const Stripe = require('stripe');
const core = require('../_lib/doctorai-core.cjs');
const { subscriptionPeriodEnd } = require('./subscription-period.cjs');

const readRawBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

function invoiceSubscriptionId(invoice) {
  const parentSubscription = invoice.parent?.type === 'subscription_details'
    ? invoice.parent.subscription_details?.subscription
    : null;
  for (const reference of [parentSubscription, invoice.subscription]) {
    const id = typeof reference === 'string' ? reference : reference?.id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

async function recordEntitlementEvent(event, stripe) {
  if (!core.storageConfigured()) return;
  const object = event.data.object || {};
  const checkoutEvent = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type);
  if (event.type === 'checkout.session.completed' && !['paid', 'no_payment_required'].includes(object.payment_status)) return;
  if (event.type === 'checkout.session.async_payment_succeeded' && object.payment_status !== 'paid') return;
  let subscriptionId = checkoutEvent
    ? (typeof object.subscription === 'string' ? object.subscription : object.subscription?.id)
    : object.id;
  if (event.type.startsWith('invoice.')) {
    subscriptionId = invoiceSubscriptionId(object);
    if (!subscriptionId) return;
  }
  // Snapshot events can arrive out of order. Resolve the current Stripe state
  // before writing access so an older active snapshot cannot undo a later
  // cancellation or payment failure.
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (!subscription || typeof subscription !== 'object') return;
  const metadata = { ...(object.metadata || {}), ...(subscription.metadata || {}) };
  if (metadata.product !== 'doctorai_pro') return;
  const email = core.normaliseEmail(metadata.account_email || object.customer_email || object.customer_details?.email);
  if (!email) return;
  const account = { sub: String(metadata.account_sub || metadata.client_reference_id || ''), email };
  const status = String(subscription.status || 'inactive');
  const currentPeriodEnd = subscriptionPeriodEnd(subscription);
  const active = (status === 'active' || status === 'trialing')
    && (metadata.plan !== 'weekly' || currentPeriodEnd > core.nowSeconds());
  const exp = active ? Math.max(currentPeriodEnd, core.nowSeconds()) : core.nowSeconds();
  await core.saveEntitlement(account, {
    tier: active ? 'pro' : 'free', source: 'stripe', plan: metadata.plan || null, email,
    customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null,
    subscriptionId: subscription.id || null, status, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    renewalDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    cancelledAt: subscription.canceled_at ? new Date(Number(subscription.canceled_at) * 1000).toISOString() : null,
    currentPeriodEnd: currentPeriodEnd || null, exp
  });
}

async function stripeWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
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

    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'].includes(event.type)) await recordEntitlementEvent(event, stripe);

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
