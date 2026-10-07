'use strict';

const assert = require('node:assert/strict');
const core = require('../server-src/_lib/doctorai-core.cjs');
const catalog = require('../server-src/stripe/plan-catalog.cjs');
const plansHandler = require('../server-src/stripe/public-plans.js');

const envNames = ['STRIPE_SECRET_KEY', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'STRIPE_PRO_ANNUAL_PRICE_ID', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_URL', 'NEXT_PUBLIC_APP_URL'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalReportError = core.reportError;
const originalIdentity = core.identityFromRequest;
const originalStorage = core.storageConfigured;
const originalRateLimit = core.rateLimit;
const originalDeletionBlocked = core.isAccountDeletionBlocked;
const originalSavePendingCheckout = core.savePendingCheckoutSession;
const originalDeletePendingCheckout = core.deletePendingCheckoutSession;
const stripeModulePath = require.resolve('stripe');
const stripeModule = require.cache[stripeModulePath];
const originalStripeExport = stripeModule?.exports;

function responseRecorder() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

const stripePrices = {
  monthly: { active: true, type: 'recurring', unit_amount: 999, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, livemode: false },
  annual: { active: true, type: 'recurring', unit_amount: 7900, currency: 'usd', recurring: { interval: 'year', interval_count: 1 }, livemode: false }
};

class FakeStripe {
  constructor() {
    this.prices = { retrieve: async id => {
      if (id === 'price_monthly_test') return stripePrices.monthly;
      if (id === 'price_annual_test') return stripePrices.annual;
      const error = new Error('Missing test price');
      error.type = 'StripeInvalidRequestError';
      error.code = 'resource_missing';
      throw error;
    } };
    this.checkout = { sessions: { create: async options => {
      FakeStripe.checkoutOptions = options;
      return { id: 'cs_test_checkout', url: 'https://checkout.stripe.test/session' };
    }, expire: async id => { FakeStripe.expiredCheckoutSessionId = id; } } };
  }
}

async function run() {
  assert.equal(catalog.keyMode('sk_test_fake'), 'test');
  assert.equal(catalog.keyMode('sk_live_fake'), 'live');
  assert.equal(catalog.keyMode('rkcs_test_fake'), 'test');
  assert.equal(catalog.environmentModeMatches('sk_test_fake', 'preview'), true);
  assert.equal(catalog.environmentModeMatches('rkcs_test_fake', 'preview'), true);
  assert.equal(catalog.environmentModeMatches('sk_live_fake', 'preview'), false);
  assert.equal(catalog.environmentModeMatches('sk_live_fake', 'production'), true);
  assert.equal(catalog.environmentModeMatches('sk_test_fake', 'production'), false);
  assert.equal(catalog.isValidPlanPrice(stripePrices.monthly, 'monthly', 'test'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.annual, 'annual', 'test'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.monthly, 'annual', 'test'), false);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, livemode: true }, 'monthly', 'test'), false);

  const logged = [];
  core.reportError = (name, details) => logged.push({ name, details });
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.VERCEL_ENV = 'preview';
  delete process.env.VERCEL_TARGET_ENV;
  process.env.VERCEL_URL = 'doctorai-synthetic-preview.vercel.app';
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.doctoraiworld.com';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_monthly_test';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_annual_test';
  const handler = plansHandler.createHandler(FakeStripe);
  const success = responseRecorder();
  await handler({ method: 'GET' }, success);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.body.plans.monthly, { available: true, amount: 999, currency: 'USD', interval: 'month' });
  assert.deepEqual(success.body.plans.annual, { available: true, amount: 7900, currency: 'USD', interval: 'year' });
  assert.equal(JSON.stringify(success.body).includes('price_'), false, 'Public pricing must not reveal Stripe Price IDs.');

  core.identityFromRequest = async () => ({ email: 'buyer@example.test', sub: 'test-account' });
  core.storageConfigured = () => true;
  core.rateLimit = async () => ({ allowed: true, retryAfter: 0 });
  core.isAccountDeletionBlocked = async () => false;
  core.savePendingCheckoutSession = async () => true;
  core.deletePendingCheckoutSession = async () => true;
  stripeModule.exports = FakeStripe;
  delete require.cache[require.resolve('../server-src/stripe/create-checkout-session.js')];
  const checkoutHandler = require('../server-src/stripe/create-checkout-session.js');
  stripePrices.monthly = { ...stripePrices.monthly, livemode: false };
  const checkout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, checkout);
  assert.equal(checkout.statusCode, 200, 'Checkout must accept the current active monthly Stripe amount instead of a stale hard-coded website amount.');
  assert.equal(checkout.body.url, 'https://checkout.stripe.test/session');
  assert.equal(FakeStripe.checkoutOptions.line_items[0].price, 'price_monthly_test');
  assert.equal(FakeStripe.checkoutOptions.success_url, 'https://doctorai-synthetic-preview.vercel.app/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  assert.equal(FakeStripe.checkoutOptions.cancel_url, 'https://doctorai-synthetic-preview.vercel.app/subscription?checkout=cancelled&plan=monthly');
  delete process.env.VERCEL_URL;
  assert.throws(() => require('../server-src/stripe/app-url.cjs')(), /Preview return address/);
  process.env.VERCEL_URL = 'doctorai-synthetic-preview.vercel.app';

  stripePrices.monthly = { ...stripePrices.monthly, livemode: true };
  const modeMismatch = responseRecorder();
  await handler({ method: 'GET' }, modeMismatch);
  assert.equal(modeMismatch.body.plans.monthly.available, false, 'Live prices must not be presented from test credentials.');
  assert.equal(logged.some(item => item.name === 'stripe_public_plan_invalid'), true);
  const rejectedCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, rejectedCheckout);
  assert.equal(rejectedCheckout.statusCode, 503, 'Checkout must reject a live Price ID when test credentials are configured.');
  assert.equal(FakeStripe.checkoutOptions.line_items[0].price, 'price_monthly_test');

  delete process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
  const missingAnnual = responseRecorder();
  await handler({ method: 'GET' }, missingAnnual);
  assert.deepEqual(missingAnnual.body.plans.annual, { available: false, interval: 'year' });

  const wrongMethod = responseRecorder();
  await handler({ method: 'POST' }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.allow, 'GET');

  delete process.env.STRIPE_SECRET_KEY;
  const noKey = responseRecorder();
  await handler({ method: 'GET' }, noKey);
  assert.equal(noKey.statusCode, 503);

  process.env.STRIPE_SECRET_KEY = 'sk_live_fake';
  const unsafePreview = responseRecorder();
  await handler({ method: 'GET' }, unsafePreview);
  assert.equal(unsafePreview.statusCode, 503, 'Preview must not enable live billing credentials.');
  FakeStripe.checkoutOptions = null;
  const unsafeCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, unsafeCheckout);
  assert.equal(unsafeCheckout.statusCode, 503, 'Preview checkout must refuse live credentials before creating a Stripe session.');
  assert.equal(FakeStripe.checkoutOptions, null, 'Unsafe Preview configuration must not create a checkout session.');

  process.stdout.write('Stripe pricing verification passed (server source of truth, plan validation, mode guard, and safe unavailable states).\n');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  core.identityFromRequest = originalIdentity;
  core.storageConfigured = originalStorage;
  core.rateLimit = originalRateLimit;
  core.isAccountDeletionBlocked = originalDeletionBlocked;
  core.savePendingCheckoutSession = originalSavePendingCheckout;
  core.deletePendingCheckoutSession = originalDeletePendingCheckout;
  core.reportError = originalReportError;
  if (stripeModule && originalStripeExport) stripeModule.exports = originalStripeExport;
  delete require.cache[require.resolve('../server-src/stripe/create-checkout-session.js')];
});
