const Stripe = require('stripe');
const { environmentModeMatches } = require('./plan-catalog.cjs');
const core = require('../_lib/doctorai-core.cjs');

const json = core.json;

module.exports = async function verifyCheckoutSession(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const account = await core.identityFromRequest(req);
  if (!account?.email) return json(res, 401, { error: 'Please sign in with Google to confirm your Pro subscription.' });
  if (!environmentModeMatches(process.env.STRIPE_SECRET_KEY, process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV)) return json(res, 503, { error: 'Stripe is not configured for this environment.' });
  if (!core.storageConfigured()) return json(res, 503, { error: 'Secure subscription storage is not connected yet. Add KV_REST_API_URL and KV_REST_API_TOKEN before confirming payment.' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return json(res, 400, { error: 'Invalid verification request.' });
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json(res, 400, { error: 'Invalid Checkout session.' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    if (session.metadata?.product !== 'doctorai_pro') return json(res, 400, { error: 'This is not a DoctorAI Pro session.' });
    const sessionEmail = String(session.metadata?.account_email || session.customer_details?.email || '').trim().toLowerCase();
    if (!sessionEmail || sessionEmail !== String(account.email).trim().toLowerCase()) return json(res, 403, { error: 'This subscription belongs to a different DoctorAI account.' });

    const subscription = session.subscription && typeof session.subscription === 'object' ? session.subscription : null;
    const status = subscription?.status || null;
    const active = status === 'active' || status === 'trialing';
    const subscriptionExpiry = Number(subscription?.current_period_end || 0) * 1000;
    const fallbackExpiry = Date.now() + 1000 * 60 * 60 * 24 * 31;
    const expiry = Math.floor((subscriptionExpiry > Date.now() ? subscriptionExpiry : fallbackExpiry) / 1000);
    const entitlement = {
      tier: active ? 'pro' : 'free', source: 'stripe', plan: session.metadata?.plan || null,
      email: account.email, customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null,
      status, cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      renewalDate: subscription?.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null,
      exp: expiry
    };
    if (core.storageConfigured()) {
      const saved = await core.saveEntitlement(account, entitlement);
      if (!saved) return json(res, 409, { error: 'This account cannot be reactivated after its data deletion request.' });
      await core.deletePendingCheckoutSession(account, sessionId);
    }
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
    return json(res, 400, { error: 'We could not verify that Checkout session.' });
  }
};
