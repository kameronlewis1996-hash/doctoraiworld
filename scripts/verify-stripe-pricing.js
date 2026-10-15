'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const core = require('../server-src/_lib/doctorai-core.cjs');
const catalog = require('../server-src/stripe/plan-catalog.cjs');

// Keep this verification offline and runnable without the Stripe SDK installed.
const stripeStubPath = path.join(__dirname, '.stripe-offline-stub.cjs');
const stripeStubModule = {
  id: stripeStubPath,
  filename: stripeStubPath,
  loaded: true,
  exports: class StripeOfflineStub {}
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain) {
  return request === 'stripe'
    ? stripeStubPath
    : originalResolveFilename.call(this, request, parent, isMain);
};
require.cache[stripeStubPath] = stripeStubModule;

const plansHandler = require('../server-src/stripe/public-plans.js');

const envNames = ['STRIPE_SECRET_KEY', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'STRIPE_PRO_ANNUAL_PRICE_ID', 'VERCEL_ENV'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalReportError = core.reportError;
const originalIdentity = core.identityFromRequest;
const originalStorage = core.storageConfigured;
const originalRateLimit = core.rateLimit;
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
  monthly: { active: true, type: 'recurring', unit_amount: 2900, currency: 'nzd', recurring: { interval: 'month', interval_count: 1 }, livemode: false },
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
      return { url: 'https://checkout.stripe.test/session' };
    } } };
  }
}

async function run() {
  const subscriptionHtml = fs.readFileSync(path.join(__dirname, '..', 'subscription.html'), 'utf8');
  const subscriptionCss = fs.readFileSync(path.join(__dirname, '..', 'subscription.css'), 'utf8');
  const subscriptionJs = fs.readFileSync(path.join(__dirname, '..', 'subscription.js'), 'utf8');
  const pricingStatusPosition = subscriptionHtml.indexOf('id="pricing-status"');
  const checkoutDialogPosition = subscriptionHtml.indexOf('id="checkout-dialog"');
  assert.match(subscriptionHtml, /id="pricing-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.ok(pricingStatusPosition >= 0 && checkoutDialogPosition > pricingStatusPosition, 'Pricing errors are announced outside the closed checkout dialog.');
  assert.match(subscriptionJs, /pricingStatus\.textContent\s*=\s*message/);
  assert.match(subscriptionCss, /\.back-link\s*\{[^}]*min-height:\s*44px/s, 'The mobile subscription back link retains a 44px target.');

  assert.equal(catalog.keyMode('sk_test_fake'), 'test');
  assert.equal(catalog.keyMode('sk_live_fake'), 'live');
  assert.equal(catalog.environmentModeMatches('sk_test_fake', 'preview'), true);
  assert.equal(catalog.environmentModeMatches('sk_live_fake', 'preview'), false);
  assert.equal(catalog.environmentModeMatches('sk_live_fake', 'production'), true);
  assert.equal(catalog.environmentModeMatches('sk_test_fake', 'production'), false);
  assert.equal(catalog.isValidPlanPrice(stripePrices.monthly, 'monthly', 'test'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.annual, 'annual', 'test'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.monthly, 'annual', 'test'), false);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, currency: 'usd' }, 'monthly', 'test'), false, 'Monthly checkout must not accept USD 29.00.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, unit_amount: 2901 }, 'monthly', 'test'), false, 'Monthly checkout must not accept a non-NZD-29 amount.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, recurring: { interval: 'month', interval_count: 12 } }, 'monthly', 'test'), false, 'Monthly checkout must reject malformed cadence.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, currency: 'eur' }, 'monthly', 'test'), false, 'Monthly checkout must reject unsupported currency.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, livemode: true }, 'monthly', 'test'), false);

  const logged = [];
  core.reportError = (name, details) => logged.push({ name, details });
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.VERCEL_ENV = 'preview';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_monthly_test';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_annual_test';
  const handler = plansHandler.createHandler(FakeStripe);
  const success = responseRecorder();
  await handler({ method: 'GET' }, success);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.body.plans.monthly, { available: true, amount: 2900, currency: 'NZD', interval: 'month' });
  assert.deepEqual(success.body.plans.annual, { available: true, amount: 7900, currency: 'USD', interval: 'year' });
  assert.equal(JSON.stringify(success.body).includes('price_'), false, 'Public pricing must not reveal Stripe Price IDs.');

  core.identityFromRequest = async () => ({ email: 'buyer@example.test', sub: 'test-account' });
  core.storageConfigured = () => true;
  core.rateLimit = async () => ({ allowed: true, retryAfter: 0 });
  stripeModule.exports = FakeStripe;
  delete require.cache[require.resolve('../server-src/stripe/create-checkout-session.js')];
  const checkoutHandler = require('../server-src/stripe/create-checkout-session.js');
  stripePrices.monthly = { ...stripePrices.monthly, livemode: false };
  const checkout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, checkout);
  assert.equal(checkout.statusCode, 200, 'Checkout must accept the current active monthly Stripe amount instead of a stale hard-coded website amount.');
  assert.equal(checkout.body.url, 'https://checkout.stripe.test/session');
  assert.equal(FakeStripe.checkoutOptions.line_items[0].price, 'price_monthly_test');
  const annualCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'annual' }, headers: {}, socket: {} }, annualCheckout);
  assert.equal(annualCheckout.statusCode, 200, 'The configured annual price remains available when monthly NZ$29 pricing is valid.');
  assert.equal(FakeStripe.checkoutOptions.line_items[0].price, 'price_annual_test');

  const monthlyAmount = stripePrices.monthly.unit_amount;
  stripePrices.monthly = { ...stripePrices.monthly, unit_amount: 2901 };
  const wrongMonthlyPricing = responseRecorder();
  await handler({ method: 'GET' }, wrongMonthlyPricing);
  assert.equal(wrongMonthlyPricing.body.plans.monthly.available, false, 'An unverified monthly amount must not be presented as NZ$29.00.');
  FakeStripe.checkoutOptions = null;
  const blockedMonthlyCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, blockedMonthlyCheckout);
  assert.equal(blockedMonthlyCheckout.statusCode, 503, 'Monthly checkout must reject a non-NZD-29 Stripe Price.');
  assert.equal(FakeStripe.checkoutOptions, null, 'Invalid monthly pricing must not create a Stripe checkout session.');
  const blockedAnnualCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'annual' }, headers: {}, socket: {} }, blockedAnnualCheckout);
  assert.equal(blockedAnnualCheckout.statusCode, 503, 'All Pro checkout must stay unavailable until Stripe confirms the NZ$29.00 monthly price.');
  assert.equal(FakeStripe.checkoutOptions, null, 'Invalid monthly pricing must also block annual checkout.');
  stripePrices.monthly = { ...stripePrices.monthly, unit_amount: monthlyAmount };

  stripePrices.monthly = { ...stripePrices.monthly, livemode: true };
  const modeMismatch = responseRecorder();
  await handler({ method: 'GET' }, modeMismatch);
  assert.equal(modeMismatch.body.plans.monthly.available, false, 'Live prices must not be presented from test credentials.');
  assert.equal(logged.some(item => item.name === 'stripe_public_plan_invalid'), true);
  FakeStripe.checkoutOptions = null;
  const rejectedCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, rejectedCheckout);
  assert.equal(rejectedCheckout.statusCode, 503, 'Checkout must reject a live Price ID when test credentials are configured.');
  assert.equal(FakeStripe.checkoutOptions, null, 'A mode mismatch must not create a Stripe checkout session.');

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
  core.reportError = originalReportError;
  if (stripeModule && originalStripeExport) stripeModule.exports = originalStripeExport;
  delete require.cache[require.resolve('../server-src/stripe/create-checkout-session.js')];
  delete require.cache[stripeStubPath];
  Module._resolveFilename = originalResolveFilename;
});
