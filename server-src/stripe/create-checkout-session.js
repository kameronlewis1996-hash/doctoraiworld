const Stripe = require('stripe');
const core = require('../_lib/doctorai-core.cjs');
const { plans, keyMode, environmentModeMatches, isValidPlanPrice } = require('./plan-catalog.cjs');

const appUrl = () => String(process.env.NEXT_PUBLIC_APP_URL || 'https://www.doctoraiworld.com').replace(/\/$/, '');

const json = core.json;

module.exports = async function createCheckoutSession(req, res) {
  if (require('../_lib/preview-provider-guard.cjs').blockPreview(res, 'payments')) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const account = await core.identityFromRequest(req);
  if (!account?.email) return json(res, 401, { error: 'Please sign in with Google before starting a Pro subscription.' });
  const limit = await core.rateLimit(req, `stripe-checkout:${core.accountKey(account)}`, 12, 60 * 60 * 1000);
  if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfter)); return json(res, 429, { error: 'Too many checkout requests. Please try again later.' }); }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(res, 503, { error: 'Stripe checkout is not configured yet.' });
  if (!environmentModeMatches(secretKey, process.env.VERCEL_ENV)) return json(res, 503, { error: 'Stripe checkout is not configured for this environment.' });
  if (!core.storageConfigured()) return json(res, 503, { error: 'Secure subscription storage is not connected yet. Add KV_REST_API_URL and KV_REST_API_TOKEN before taking payments.' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return json(res, 400, { error: 'Invalid checkout request.' });
  }

  const plan = body.plan === 'monthly' ? 'monthly' : body.plan === 'annual' ? 'annual' : null;
  if (!plan) return json(res, 400, { error: 'Choose an annual or monthly Pro plan.' });

  const priceId = process.env[plans[plan].env];
  if (!priceId) return json(res, 503, { error: 'DoctorAI Pro pricing is not configured yet.' });

  try {
    const stripe = new Stripe(secretKey);
    const configuredPrice = await stripe.prices.retrieve(priceId);
    const priceMatchesSite = isValidPlanPrice(configuredPrice, plan, keyMode(secretKey));

    if (!priceMatchesSite) {
      core.reportError('stripe_checkout_price_mismatch', { route: '/api/stripe/create-checkout-session', plan });
      return json(res, 503, { error: 'DoctorAI Pro pricing is being updated. Please try again later or contact support.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl()}/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/subscription?checkout=cancelled&plan=${plan}`,
      billing_address_collection: 'auto',
      locale: 'auto',
      customer_email: account.email,
      client_reference_id: account.sub || account.email,
      metadata: {
        product: 'doctorai_pro',
        plan,
        account_email: account.email,
        account_sub: account.sub || '',
        version: '1'
      },
      subscription_data: {
        metadata: {
          product: 'doctorai_pro',
          plan,
          account_email: account.email,
          account_sub: account.sub || '',
          version: '1'
        }
      }
    });

    return json(res, 200, { url: session.url });
  } catch (error) {
    core.reportError('stripe_checkout_creation_failed', { route: '/api/stripe/create-checkout-session', provider: 'stripe', type: error?.type, code: error?.code });
    return json(res, 500, { error: 'Stripe could not start checkout. Please try again.' });
  }
};
