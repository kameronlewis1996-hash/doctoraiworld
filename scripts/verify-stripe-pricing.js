'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../server-src/_lib/doctorai-core.cjs');
const catalog = require('../server-src/stripe/plan-catalog.cjs');
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
      return { url: 'https://checkout.stripe.test/session' };
    } } };
  }
}

async function renderPricing(plans, requestedPlan = 'monthly') {
  const makeElement = () => ({
    textContent: '', innerHTML: '', disabled: false, dataset: {}, checked: false, listeners: {}, children: {},
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener(name, handler) { this.listeners[name] = handler; },
    querySelector(selector) { return this.children[selector] ||= makeElement(); }
  });
  const selectors = ['[data-price]', '[data-period]', '[data-equivalent]', '#selected-plan-price', '#checkout-renewal-note', '[data-annual-savings]', '[data-subscribe]', '[data-confirm-checkout]', '#checkout-terms-confirm', '#checkout-status'];
  const elements = Object.fromEntries(selectors.map(selector => [selector, makeElement()]));
  const buttons = ['monthly', 'annual'].map(plan => ({ ...makeElement(), dataset: { plan } }));
  const location = { search: `?plan=${requestedPlan}`, pathname: '/subscription', hash: '' };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../subscription.js'), 'utf8'), {
    Intl, URLSearchParams,
    document: {
      querySelector: selector => elements[selector] || null,
      querySelectorAll: selector => selector === '[data-plan]' ? buttons : [],
      createElement: makeElement
    },
    window: { location }, location,
    fetch: async () => ({ ok: true, json: async () => ({ plans }) })
  }, { filename: 'subscription.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, buttons };
}

async function verifyPricingDisplay() {
  const monthly = { available: true, amount: 999, currency: 'NZD', interval: 'month' };
  const annual = { available: true, amount: 7900, currency: 'NZD', interval: 'year' };
  const nz = await renderPricing({ monthly, annual });
  assert.equal(nz.elements['[data-price]'].textContent, 'NZ$9.99');
  assert.equal(nz.elements['#selected-plan-price'].textContent, 'NZ$9.99 / month');
  assert.match(nz.elements['#checkout-renewal-note'].textContent, /charged NZ\$9\.99 monthly/);
  assert.equal(nz.elements['[data-subscribe]'].disabled, false);
  assert.equal(nz.elements['[data-confirm-checkout]'].disabled, true, 'Consent is still required before checkout.');
  nz.buttons[1].listeners.click();
  assert.equal(nz.elements['[data-price]'].textContent, 'NZ$79.00');
  assert.match(nz.elements['[data-equivalent]'].textContent, /^Equivalent to NZ\$6\.58 a month/);
  assert.match(nz.elements['#checkout-renewal-note'].textContent, /charged NZ\$79\.00 yearly/);
  nz.elements['#checkout-terms-confirm'].checked = true;
  nz.elements['#checkout-terms-confirm'].listeners.change();
  assert.equal(nz.elements['[data-confirm-checkout]'].disabled, false);

  const usd = await renderPricing({ monthly: { ...monthly, currency: 'USD' }, annual: { ...annual, currency: 'USD' } });
  assert.equal(usd.elements['[data-price]'].textContent, 'US$9.99', 'US dollars must remain explicit.');
  const mixed = await renderPricing({ monthly: { ...monthly, currency: 'USD' }, annual });
  assert.equal(mixed.elements['[data-price]'].textContent, 'US$9.99');
  assert.equal(mixed.elements['[data-annual-savings]'].textContent, '', 'Never compare unlike currencies.');
  assert.equal(mixed.elements['[data-equivalent]'].textContent, 'Billed monthly');
  mixed.buttons[1].listeners.click();
  assert.equal(mixed.elements['[data-price]'].textContent, 'NZ$79.00');
  assert.equal(mixed.elements['[data-equivalent]'].textContent, 'Billed yearly');
  assert.equal(mixed.elements['[data-annual-savings]'].textContent, '');

  const unsupported = await renderPricing({ monthly: { ...monthly, currency: 'EUR' }, annual: { ...annual, currency: 'EUR' } });
  assert.equal(unsupported.elements['[data-price]'].textContent, 'Unavailable');
  assert.equal(unsupported.elements['[data-subscribe]'].disabled, true);
  const invalid = await renderPricing({ monthly: { ...monthly, interval: 'year' }, annual: { ...annual, amount: 7900.5 } });
  assert.equal(invalid.elements['[data-subscribe]'].disabled, true, 'Malformed intervals and non-integer minor amounts must disable checkout.');
}

async function run() {
  assert.equal(catalog.keyMode('sk_test_fake'), 'test');
  assert.equal(catalog.keyMode('sk_live_fake'), 'live');
  assert.equal(catalog.environmentModeMatches('sk_test_fake', 'preview'), true);
  assert.equal(catalog.environmentModeMatches('sk_live_fake', 'preview'), false);
  assert.equal(catalog.environmentModeMatches('sk_live_fake', 'production'), true);
  assert.equal(catalog.environmentModeMatches('sk_test_fake', 'production'), false);
  assert.equal(catalog.isValidPlanPrice(stripePrices.monthly, 'monthly', 'test'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.annual, 'annual', 'test'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.monthly, 'annual', 'test'), false);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, livemode: true }, 'monthly', 'test'), false);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, currency: 'nzd' }, 'monthly', 'test'), true);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.annual, currency: 'nzd' }, 'annual', 'test'), true);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, currency: 'eur' }, 'monthly', 'test'), false);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, unit_amount: 999.5 }, 'monthly', 'test'), false);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, recurring: { interval: 'month', interval_count: 2 } }, 'monthly', 'test'), false);
  await verifyPricingDisplay();

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
  assert.deepEqual(success.body.plans.monthly, { available: true, amount: 999, currency: 'USD', interval: 'month' });
  assert.deepEqual(success.body.plans.annual, { available: true, amount: 7900, currency: 'USD', interval: 'year' });
  assert.equal(success.body.currency, 'USD');
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

  stripePrices.monthly = { ...stripePrices.monthly, currency: 'nzd' };
  stripePrices.annual = { ...stripePrices.annual, currency: 'nzd' };
  const nzPlans = responseRecorder();
  await handler({ method: 'GET' }, nzPlans);
  assert.equal(nzPlans.body.currency, 'NZD');
  assert.deepEqual(nzPlans.body.plans.monthly, { available: true, amount: 999, currency: 'NZD', interval: 'month' });
  assert.deepEqual(nzPlans.body.plans.annual, { available: true, amount: 7900, currency: 'NZD', interval: 'year' });
  const nzCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, nzCheckout);
  assert.equal(nzCheckout.statusCode, 200, 'NZD checkout must use its configured Stripe price.');
  const nzAnnualCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'annual' }, headers: {}, socket: {} }, nzAnnualCheckout);
  assert.equal(nzAnnualCheckout.statusCode, 200);
  assert.equal(FakeStripe.checkoutOptions.line_items[0].price, 'price_annual_test');

  stripePrices.monthly = { ...stripePrices.monthly, currency: 'usd' };
  const mixedPlans = responseRecorder();
  await handler({ method: 'GET' }, mixedPlans);
  assert.equal(mixedPlans.body.currency, null, 'A mixed catalog must not claim a single shared currency.');
  assert.equal(mixedPlans.body.plans.monthly.currency, 'USD');
  assert.equal(mixedPlans.body.plans.annual.currency, 'NZD');

  stripePrices.monthly = { ...stripePrices.monthly, currency: 'eur' };
  const unsupportedPlans = responseRecorder();
  await handler({ method: 'GET' }, unsupportedPlans);
  assert.equal(unsupportedPlans.body.plans.monthly.available, false);
  FakeStripe.checkoutOptions = null;
  const unsupportedCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, unsupportedCheckout);
  assert.equal(unsupportedCheckout.statusCode, 503, 'Unsupported currencies must not enter checkout.');
  assert.equal(FakeStripe.checkoutOptions, null);

  stripePrices.monthly = { ...stripePrices.monthly, currency: 'usd', livemode: true };
  const modeMismatch = responseRecorder();
  await handler({ method: 'GET' }, modeMismatch);
  assert.equal(modeMismatch.body.plans.monthly.available, false, 'Live prices must not be presented from test credentials.');
  assert.equal(logged.some(item => item.name === 'stripe_public_plan_invalid'), true);
  const rejectedCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'monthly' }, headers: {}, socket: {} }, rejectedCheckout);
  assert.equal(rejectedCheckout.statusCode, 503, 'Checkout must reject a live Price ID when test credentials are configured.');
  assert.equal(FakeStripe.checkoutOptions, null);

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

  process.stdout.write('Stripe pricing verification passed (USD/NZD rendering and checkout, no cross-currency comparisons, server source of truth, mode guard, and safe unavailable states).\n');
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
});
