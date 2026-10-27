const Stripe = require('stripe');
const core = require('../_lib/doctorai-core.cjs');
const { subscriptionPeriodEnd } = require('./subscription-period.cjs');

const json = core.json;

function retryableError() {
  const error = new Error('Stripe entitlement synchronization must be retried.');
  error.retryable = true;
  return error;
}

module.exports = async function verifyCheckoutSession(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const account = await core.identityFromRequest(req);
  if (!account?.email) return json(res, 401, { error: 'Please sign in with Google to confirm your Pro subscription.' });
  if (!process.env.STRIPE_SECRET_KEY) return json(res, 503, { error: 'Stripe is not configured yet.' });
  if (!core.storageConfigured()) return json(res, 503, { error: 'Secure subscription storage is not connected yet. Add KV_REST_API_URL and KV_REST_API_TOKEN before confirming payment.' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return json(res, 400, { error: 'Invalid verification request.' });
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json(res, 400, { error: 'Invalid Checkout session.' });

  let lease = null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.product !== 'doctorai_pro') return json(res, 400, { error: 'This is not a DoctorAI Pro session.' });
    const sessionEmail = String(session.metadata?.account_email || session.customer_details?.email || '').trim().toLowerCase();
    if (!sessionEmail || sessionEmail !== String(account.email).trim().toLowerCase()) return json(res, 403, { error: 'This subscription belongs to a different DoctorAI account.' });

    try {
      lease = await core.acquireEntitlementLease(account);
    } catch {
      throw retryableError();
    }
    if (!lease) throw retryableError();

    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
    const status = subscription?.status || null;
    const currentPeriodEnd = subscriptionPeriodEnd(subscription);
    const subscriptionExpiry = currentPeriodEnd * 1000;
    const active = (status === 'active' || status === 'trialing')
      && (session.metadata?.plan !== 'weekly' || subscriptionExpiry > Date.now());
    // Keep legacy plan behavior; weekly access must have a real Stripe period.
    const fallbackExpiry = session.metadata?.plan === 'weekly' ? Date.now() : Date.now() + 1000 * 60 * 60 * 24 * 31;
    const expiry = Math.floor((subscriptionExpiry > Date.now() ? subscriptionExpiry : fallbackExpiry) / 1000);
    const entitlement = {
      tier: active ? 'pro' : 'free', source: 'stripe', plan: session.metadata?.plan || null,
      email: account.email, customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      subscriptionId: subscriptionId || null, status, cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      renewalDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      exp: expiry
    };
    let saved;
    try {
      saved = await core.saveEntitlementWithLease(account, entitlement, lease);
    } catch {
      throw retryableError();
    }
    if (!saved) throw retryableError();
    if (active && core.configured()) core.setEntitlementCookie(res, entitlement);
    return json(res, 200, {
      active,
      plan: session.metadata?.plan || null,
      status,
      expiresAt: active ? expiry : null,
      cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end)
    });
  } catch (error) {
    core.reportError('stripe_checkout_verification_failed', { route: '/api/stripe/verify-checkout-session', provider: 'stripe', type: error?.type, code: error?.code });
    if (error?.retryable) return json(res, 503, { error: 'Subscription status is temporarily busy. Please try again.' });
    return json(res, 400, { error: 'We could not verify that Checkout session.' });
  } finally {
    if (lease) {
      try {
        await core.releaseEntitlementLease(lease);
      } catch (error) {
        core.reportError('entitlement_lock_release_failed', {
          route: '/api/stripe/verify-checkout-session', provider: 'stripe', type: error?.type
        });
      }
    }
  }
};
