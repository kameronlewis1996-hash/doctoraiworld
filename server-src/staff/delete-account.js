'use strict';

const Stripe = require('stripe');
const { environmentModeMatches } = require('../stripe/plan-catalog.cjs');
const core = require('../_lib/doctorai-core.cjs');
const { del, list } = require('@vercel/blob');

const validEmail = value => /^\S+@\S+\.\S+$/.test(value);
const workflowEnabled = () => process.env.ACCOUNT_DELETION_WORKFLOW_ENABLED === 'true';
const parseBody = request => {
  try { return typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {}); }
  catch { return null; }
};

async function inspectBilling(account) {
  const email = core.normaliseEmail(account.email);
  if (!environmentModeMatches(process.env.STRIPE_SECRET_KEY, process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV)) return { verified: false, customers: 0, subscriptions: [], subscriptionIds: [], openCheckoutSessions: 0, blockers: ['Stripe status could not be verified.'] };
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const customerResult = await stripe.customers.list({ email, limit: 100 });
  const customers = (customerResult.data || []).filter(customer => core.normaliseEmail(customer.email) === email);
  if (customerResult.has_more) return { verified: false, customers: customers.length, subscriptions: [], subscriptionIds: [], openCheckoutSessions: 0, blockers: ['Stripe returned more matching customers than this check can verify.'] };

  const subscriptions = [];
  const subscriptionIds = new Set();
  const addSubscription = subscription => {
    if (!subscription || typeof subscription !== 'object' || !subscription.id || subscriptionIds.has(subscription.id)) return;
    subscriptionIds.add(subscription.id);
    subscriptions.push({ status: String(subscription.status || 'unknown'), cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end) });
  };
  const stored = await core.readStoredEntitlement(account);
  const customerIds = new Set(customers.map(customer => customer.id));
  if (typeof stored?.customerId === 'string') customerIds.add(stored.customerId);
  for (const customerId of customerIds) {
    let page = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    let pageCount = 0;
    while (true) {
      for (const subscription of page.data || []) addSubscription(subscription);
      pageCount += 1;
      if (!page.has_more) break;
      if (pageCount >= 10 || !(page.data || []).length) {
        return { verified: false, customers: customerIds.size, subscriptions, subscriptionIds: [...subscriptionIds], openCheckoutSessions: 0, blockers: ['All Stripe subscription records could not be verified.'] };
      }
      page = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100, starting_after: page.data[page.data.length - 1].id });
    }
  }

  // A customer can change their billing email while subscription metadata still
  // links the record to the DoctorAI account. Search supplements (but does not
  // replace) the customer-scoped list and stored Checkout-session checks below.
  let searchPage;
  let searchPages = 0;
  const searchQuery = `metadata["account_email"]:"${email.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  while (true) {
    const result = await stripe.subscriptions.search({
      query: searchQuery,
      limit: 100,
      ...(searchPage ? { page: searchPage } : {})
    });
    for (const subscription of result.data || []) {
      if (core.normaliseEmail(subscription.metadata?.account_email) === email) addSubscription(subscription);
    }
    searchPages += 1;
    if (!result.has_more) break;
    if (searchPages >= 10 || !result.next_page) {
      return { verified: false, customers: customerIds.size, subscriptions, subscriptionIds: [...subscriptionIds], openCheckoutSessions: 0, blockers: ['All Stripe subscription metadata records could not be verified.'] };
    }
    searchPage = result.next_page;
  }

  if (stored?.source === 'stripe' && typeof stored.subscriptionId === 'string') {
    addSubscription(await stripe.subscriptions.retrieve(stored.subscriptionId));
  }

  let openCheckoutSessions = 0;
  const pendingSessions = await core.listPendingCheckoutSessions(account);
  for (const sessionId of pendingSessions) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    if (core.normaliseEmail(session.metadata?.account_email) !== email) {
      return { verified: false, customers: customerIds.size, subscriptions, subscriptionIds: [...subscriptionIds], openCheckoutSessions, blockers: ['A saved Checkout session could not be matched to this account.'] };
    }
    if (session.status === 'open') openCheckoutSessions += 1;
    let subscription = session.subscription;
    if (typeof subscription === 'string') subscription = await stripe.subscriptions.retrieve(subscription);
    addSubscription(subscription);
  }

  const active = subscriptions.filter(subscription => !['canceled', 'incomplete_expired'].includes(subscription.status));
  return {
    verified: true,
    customers: customerIds.size,
    subscriptions,
    subscriptionIds: [...subscriptionIds],
    openCheckoutSessions,
    blockers: active.length ? ['Cancel or otherwise resolve every non-canceled subscription before deleting this account.'] : []
  };
}

async function expirePendingCheckoutSessions(stripe, account) {
  const email = core.normaliseEmail(account.email);
  const sessionIds = await core.listPendingCheckoutSessions(account);
  for (const sessionId of sessionIds) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (core.normaliseEmail(session.metadata?.account_email) !== email) throw new Error('A saved Checkout session could not be matched to this account.');
    if (session.status === 'open') await stripe.checkout.sessions.expire(sessionId);
  }
}

module.exports = async function deleteAccount(request, response) {
  core.noStore(response);
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  const admin = await core.identityFromRequest(request);
  if (!core.isAdmin(admin)) return response.status(403).json({ error: 'Staff admin access is required.' });
  if (!core.storageConfigured()) return response.status(503).json({ error: 'Secure account storage is not connected.' });
  const limit = await core.rateLimit(request, `staff-delete-account:${core.accountKey(admin)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    return response.status(429).json({ error: 'Too many account deletion actions. Please try again later.' });
  }

  const body = parseBody(request);
  if (!body) return response.status(400).json({ error: 'Invalid account deletion request.' });
  const email = core.normaliseEmail(body.email);
  if (!validEmail(email)) return response.status(400).json({ error: 'Enter a valid account email address.' });
  const account = { email };
  const action = String(body.action || 'inspect');
  if (!['inspect', 'delete'].includes(action)) return response.status(400).json({ error: 'Choose inspect or delete.' });

  try {
    const billing = await inspectBilling(account);
    const deletion = await core.accountDeletionStatus(account);
    if (action === 'inspect') {
      return response.status(200).json({
        ok: true,
        workflowEnabled: workflowEnabled(),
        billing: { verified: billing.verified, customers: billing.customers, subscriptions: billing.subscriptions, openCheckoutSessions: billing.openCheckoutSessions, blockers: billing.blockers },
        deletionStatus: deletion.status
      });
    }

    if (!workflowEnabled()) return response.status(423).json({ error: 'Account deletion is not enabled until request verification, retention, and support procedures are approved.' });
    if (body.requestVerified !== true || body.retentionReviewed !== true || body.billingReviewed !== true || body.confirmation !== `DELETE ${email}`) {
      return response.status(400).json({ error: 'Confirm verified ownership, review retention requirements, and type the exact DELETE confirmation.' });
    }
    if (!billing.verified || billing.blockers.length) {
      return response.status(409).json({ error: 'Billing must be verified and all subscriptions resolved before deleting this account.', billing: { verified: billing.verified, blockers: billing.blockers } });
    }
    if (!core.documentStorageConfigured()) return response.status(503).json({ error: 'Private document storage is not configured, so complete account deletion cannot be verified.' });

    await core.beginAccountDeletion(account);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await expirePendingCheckoutSessions(stripe, account);
    const finalBilling = await inspectBilling(account);
    if (!finalBilling.verified || finalBilling.blockers.length) {
      return response.status(409).json({ error: 'The account is now blocked while billing is resolved. Inspect Stripe, resolve every subscription, then retry deletion.', billing: { verified: finalBilling.verified, blockers: finalBilling.blockers } });
    }
    const result = await core.deleteAccountData(account, finalBilling.subscriptionIds, {
      list: async options => list({ ...options, ...await core.documentBlobOptions() }),
      del: async paths => del(paths, await core.documentBlobOptions())
    });
    return response.status(200).json({ ok: true, email, deleted: true, documentsDeleted: result.documentsDeleted, alreadyDeleted: result.alreadyDeleted });
  } catch (error) {
    core.reportError('staff_account_deletion_failed', { route: '/api/staff/delete-account', operation: action, name: error?.name, code: error?.code });
    return response.status(503).json({ error: 'Account deletion did not finish. The account remains blocked; inspect it and retry after resolving the reported storage issue.' });
  }
};
