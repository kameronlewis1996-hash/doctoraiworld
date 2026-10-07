const Stripe = require('stripe');
const { environmentModeMatches } = require('./plan-catalog.cjs');
const core = require('../_lib/doctorai-core.cjs');

const appUrl = require('./app-url.cjs');

const json = core.json;

module.exports = async function createPortalSession(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const account = await core.identityFromRequest(req);
  if (!account?.email) return json(res, 401, { error: 'Please sign in with Google before managing Pro billing.' });
  if (await core.isAccountDeletionBlocked(account)) return json(res, 409, { error: 'This account is being deleted.' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!environmentModeMatches(secretKey, process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV)) return json(res, 503, { error: 'Stripe billing is not configured for this environment.' });
  if (!core.storageConfigured()) return json(res, 503, { error: 'Secure subscription storage is not connected yet. Add KV_REST_API_URL and KV_REST_API_TOKEN before managing billing.' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return json(res, 400, { error: 'Invalid billing request.' });
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  if (sessionId && !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json(res, 400, { error: 'Invalid Checkout session.' });

  try {
    const stripe = new Stripe(secretKey);
    let customerId = null;
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.product !== 'doctorai_pro') return json(res, 400, { error: 'This is not a DoctorAI Pro session.' });
      const sessionEmail = String(session.metadata?.account_email || session.customer_details?.email || '').trim().toLowerCase();
      if (!sessionEmail || sessionEmail !== String(account.email).trim().toLowerCase()) return json(res, 403, { error: 'This subscription belongs to a different DoctorAI account.' });
      customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    } else {
      const entitlement = await core.readStoredEntitlement(account);
      customerId = entitlement?.customerId || null;
    }
    if (!customerId) return json(res, 400, { error: 'No billing customer is attached to this session.' });

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl()}/subscription#plans`
    });

    return json(res, 200, { url: portal.url });
  } catch (error) {
    core.reportError('stripe_portal_creation_failed', { route: '/api/stripe/create-portal-session', provider: 'stripe', type: error?.type, code: error?.code });
    return json(res, 500, { error: 'Stripe could not open billing management. Please try again.' });
  }
};
