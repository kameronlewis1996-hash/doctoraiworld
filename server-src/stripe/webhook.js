const Stripe = require('stripe');
const { environmentModeMatches, keyMode } = require('./plan-catalog.cjs');
const core = require('../_lib/doctorai-core.cjs');

const readRawBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

async function recordEntitlementEvent(event, stripe) {
  if (!core.storageConfigured()) return;
  const object = event.data.object || {};
  let subscription = event.type === 'checkout.session.completed' ? object.subscription : object;
  if (typeof subscription === 'string') subscription = await stripe.subscriptions.retrieve(subscription);
  if (event.type.startsWith('invoice.') && object.subscription) subscription = await stripe.subscriptions.retrieve(object.subscription);
  if (!subscription || typeof subscription !== 'object') return;
  const metadata = { ...(object.metadata || {}), ...(subscription.metadata || {}) };
  if (metadata.product !== 'doctorai_pro') return;
  const email = core.normaliseEmail(metadata.account_email || object.customer_email || object.customer_details?.email);
  if (!email) return;
  const account = { sub: String(metadata.account_sub || metadata.client_reference_id || ''), email };
  const status = String(subscription.status || 'inactive');
  const active = status === 'active' || status === 'trialing';
  const currentPeriodEnd = Number(subscription.current_period_end || 0);
  const exp = active ? Math.max(currentPeriodEnd, core.nowSeconds()) : core.nowSeconds();
  const saved = await core.saveEntitlement(account, {
    tier: active ? 'pro' : 'free', source: 'stripe', plan: metadata.plan || null, email,
    customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null,
    subscriptionId: subscription.id || null, status, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    renewalDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    cancelledAt: subscription.canceled_at ? new Date(Number(subscription.canceled_at) * 1000).toISOString() : null,
    currentPeriodEnd: currentPeriodEnd || null, exp
  });
  return saved;
}

async function stripeWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!environmentModeMatches(process.env.STRIPE_SECRET_KEY, process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV) || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe webhook is not configured yet.' });
  }
  if (!core.storageConfigured()) {
    return res.status(503).json({ error: 'Secure subscription storage is not connected yet.' });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.livemode !== (keyMode(process.env.STRIPE_SECRET_KEY) === 'live')) return res.status(400).json({ error: 'Stripe webhook mode does not match this environment.' });

    if (['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'].includes(event.type)) await recordEntitlementEvent(event, stripe);

    return res.status(200).json({ received: true });
  } catch (error) {
    core.reportError('stripe_webhook_verification_failed', { route: '/api/stripe/webhook', provider: 'stripe', type: error?.type, code: error?.code });
    return res.status(400).json({ error: 'Invalid Stripe webhook.' });
  }
}

// Stripe signs the exact raw request body. Keep this setting attached to the
// exported handler so Vercel does not consume or transform that body first.
stripeWebhook.config = { api: { bodyParser: false } };

module.exports = stripeWebhook;
