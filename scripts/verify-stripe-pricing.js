'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const core = require('../server-src/_lib/doctorai-core.cjs');
const catalog = require('../server-src/stripe/plan-catalog.cjs');
const { subscriptionPeriodEnd } = require('../server-src/stripe/subscription-period.cjs');

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

const envNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRO_WEEKLY_PRICE_ID', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'STRIPE_PRO_ANNUAL_PRICE_ID', 'VERCEL_ENV'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalReportError = core.reportError;
const originalIdentity = core.identityFromRequest;
const originalStorage = core.storageConfigured;
const originalRateLimit = core.rateLimit;
const originalSaveEntitlement = core.saveEntitlement;
const originalConfigured = core.configured;
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
  weekly: { active: true, type: 'recurring', unit_amount: 699, currency: 'nzd', recurring: { interval: 'week', interval_count: 1 }, livemode: false },
  monthly: { active: true, type: 'recurring', unit_amount: 2900, currency: 'nzd', recurring: { interval: 'month', interval_count: 1 }, livemode: false },
  annual: { active: true, type: 'recurring', unit_amount: 7900, currency: 'usd', recurring: { interval: 'year', interval_count: 1 }, livemode: false }
};

class FakeStripe {
  constructor() {
    this.prices = { retrieve: async id => {
      if (id === 'price_weekly_test') return stripePrices.weekly;
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
    }, retrieve: async () => FakeStripe.session } };
    this.subscriptions = { retrieve: async id => {
      if (FakeStripe.subscriptionRetrievals) FakeStripe.subscriptionRetrievals.push(id);
      assert.equal(id, FakeStripe.subscription.id);
      return FakeStripe.subscription;
    } };
    this.webhooks = { constructEvent: (rawBody, signature, secret) => {
      assert.ok(Buffer.isBuffer(rawBody), 'Webhook verification receives the unmodified raw body.');
      assert.equal(signature, 'synthetic-signature');
      assert.equal(secret, 'whsec_synthetic');
      return JSON.parse(rawBody.toString('utf8'));
    } };
  }
}

async function deliverWebhook(handler, event, options = {}) {
  const request = new PassThrough();
  request.method = 'POST';
  request.headers = { 'stripe-signature': options.signature || 'synthetic-signature' };
  const response = responseRecorder();
  const handled = handler(request, response);
  request.end(Buffer.from(JSON.stringify(event)));
  await handled;
  assert.equal(response.statusCode, options.status || 200);
  if (!options.status || options.status === 200) assert.deepEqual(response.body, { received: true });
  else assert.deepEqual(response.body, { error: 'Invalid Stripe webhook.' });
}

async function verifySubscriptionEntitlements() {
  const saved = [];
  core.saveEntitlement = async (account, entitlement) => saved.push({ account, entitlement });
  core.configured = () => false;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
  delete require.cache[require.resolve('../server-src/stripe/webhook.js')];
  delete require.cache[require.resolve('../server-src/stripe/verify-checkout-session.js')];
  const webhook = require('../server-src/stripe/webhook.js');
  const verifyCheckout = require('../server-src/stripe/verify-checkout-session.js');
  const currentTime = core.nowSeconds();
  const nextWeek = currentTime + 7 * 24 * 60 * 60;
  const metadata = plan => ({ product: 'doctorai_pro', plan, account_email: 'buyer@example.test', account_sub: 'test-account' });
  const makeSubscription = (plan, overrides = {}) => ({
    id: `sub_${plan}_synthetic`, customer: 'cus_synthetic', status: 'active', metadata: metadata(plan),
    current_period_end: currentTime + ({ weekly: 7, monthly: 31, annual: 365 }[plan] * 24 * 60 * 60),
    cancel_at_period_end: false, ...overrides
  });
  const verifySession = async (plan, subscription) => {
    FakeStripe.session = { id: 'cs_test_synthetic', metadata: metadata(plan), customer: 'cus_synthetic', subscription };
    const response = responseRecorder();
    await verifyCheckout({ method: 'POST', body: { session_id: 'cs_test_synthetic' } }, response);
    return response;
  };

  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: nextWeek + 7 }, { current_period_end: nextWeek }] } }), nextWeek);
  assert.equal(subscriptionPeriodEnd({ current_period_end: nextWeek, items: { data: [{ current_period_end: nextWeek + 7 }] } }), nextWeek);
  assert.equal(subscriptionPeriodEnd({ current_period_end: Infinity, items: { data: [] } }), 0);

  for (const plan of ['weekly', 'monthly', 'annual']) {
    FakeStripe.subscription = makeSubscription(plan);
    saved.length = 0;
    await deliverWebhook(webhook, {
      type: 'checkout.session.completed',
      data: { object: { subscription: FakeStripe.subscription.id, payment_status: 'paid', metadata: metadata(plan) } }
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].entitlement.tier, 'pro');
    assert.equal(saved[0].entitlement.plan, plan);
    assert.equal(saved[0].entitlement.exp, FakeStripe.subscription.current_period_end);
    assert.equal(saved[0].entitlement.renewalDate, new Date(FakeStripe.subscription.current_period_end * 1000).toISOString());
    saved.length = 0;
    const verified = await verifySession(plan, FakeStripe.subscription);
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.body.active, true);
    assert.equal(verified.body.plan, plan);
    assert.equal(verified.body.expiresAt, FakeStripe.subscription.current_period_end);
    assert.equal(saved[0].entitlement.exp, FakeStripe.subscription.current_period_end);
  }

  FakeStripe.subscription = makeSubscription('weekly', {
    current_period_end: undefined,
    items: { data: [{ current_period_end: nextWeek, price: { recurring: { interval: 'week', interval_count: 1 } } }] }
  });
  saved.length = 0;
  await deliverWebhook(webhook, { type: 'invoice.paid', data: { object: { subscription: FakeStripe.subscription.id } } });
  assert.equal(saved[0].entitlement.plan, 'weekly');
  assert.equal(saved[0].entitlement.tier, 'pro');
  assert.equal(saved[0].entitlement.exp, nextWeek, 'Weekly renewal uses the real item period, never a 31-day fallback.');
  const itemPeriodVerification = await verifySession('weekly', FakeStripe.subscription);
  assert.equal(itemPeriodVerification.body.active, true);
  assert.equal(itemPeriodVerification.body.expiresAt, nextWeek);

  for (const reference of [FakeStripe.subscription.id, { id: FakeStripe.subscription.id }]) {
    saved.length = 0;
    FakeStripe.subscriptionRetrievals = [];
    await deliverWebhook(webhook, {
      type: 'invoice.paid',
      data: { object: {
        status: 'paid', metadata: { product: 'unrelated', plan: 'annual' },
        parent: { type: 'subscription_details', subscription_details: { subscription: reference } }
      } }
    });
    assert.deepEqual(FakeStripe.subscriptionRetrievals, [FakeStripe.subscription.id], 'Basil invoice events retrieve the actual subscription.');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].entitlement.tier, 'pro');
    assert.equal(saved[0].entitlement.plan, 'weekly', 'Subscription metadata takes precedence over invoice metadata.');
    assert.equal(saved[0].entitlement.exp, nextWeek, 'Basil renewal keeps the actual weekly item period.');
  }

  FakeStripe.subscription = makeSubscription('weekly', {
    status: 'past_due', current_period_end: undefined, items: { data: [{ current_period_end: nextWeek }] }
  });
  saved.length = 0;
  FakeStripe.subscriptionRetrievals = [];
  await deliverWebhook(webhook, {
    type: 'invoice.payment_failed',
    data: { object: { parent: { type: 'subscription_details', subscription_details: { subscription: FakeStripe.subscription.id } } } }
  });
  assert.deepEqual(FakeStripe.subscriptionRetrievals, [FakeStripe.subscription.id]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].entitlement.tier, 'free', 'Basil payment failure uses the actual past-due subscription status.');
  assert.equal(saved[0].entitlement.plan, 'weekly');
  assert.ok(saved[0].entitlement.exp <= core.nowSeconds());

  FakeStripe.subscription = makeSubscription('weekly');
  saved.length = 0;
  FakeStripe.subscriptionRetrievals = [];
  await deliverWebhook(webhook, {
    type: 'invoice.paid',
    data: { object: {
      subscription: FakeStripe.subscription.id,
      parent: { type: 'subscription_details', subscription_details: {} }
    } }
  });
  assert.deepEqual(FakeStripe.subscriptionRetrievals, [FakeStripe.subscription.id], 'The legacy subscription pointer remains a supported fallback.');
  assert.equal(saved[0].entitlement.tier, 'pro');

  for (const parent of [undefined, { type: 'quote_details', subscription_details: { subscription: FakeStripe.subscription.id } }, { type: 'subscription_details', subscription_details: {} }, { type: 'subscription_details', subscription_details: { subscription: { id: 42 } } }]) {
    saved.length = 0;
    FakeStripe.subscriptionRetrievals = [];
    await deliverWebhook(webhook, {
      type: 'invoice.paid',
      data: { object: { status: 'active', current_period_end: nextWeek, metadata: metadata('weekly'), parent } }
    });
    assert.deepEqual(FakeStripe.subscriptionRetrievals, [], 'Invoices without a recognized subscription association are ignored.');
    assert.equal(saved.length, 0, 'Unrelated or missing invoice parents must not grant or overwrite entitlements.');
  }

  saved.length = 0;
  FakeStripe.subscriptionRetrievals = [];
  await deliverWebhook(webhook, {
    type: 'invoice.paid',
    data: { object: { parent: { type: 'subscription_details', subscription_details: { subscription: FakeStripe.subscription.id } } } }
  }, { signature: 'invalid-signature', status: 400 });
  assert.deepEqual(FakeStripe.subscriptionRetrievals, []);
  assert.equal(saved.length, 0, 'Failed Stripe signature verification must not read subscriptions or write entitlements.');

  FakeStripe.subscription = makeSubscription('weekly', {
    cancel_at_period_end: true, current_period_end: undefined, items: { data: [{ current_period_end: nextWeek }] }
  });
  saved.length = 0;
  await deliverWebhook(webhook, { type: 'customer.subscription.updated', data: { object: FakeStripe.subscription } });
  assert.equal(saved[0].entitlement.tier, 'pro', 'A scheduled cancellation preserves the current paid weekly period.');
  assert.equal(saved[0].entitlement.cancelAtPeriodEnd, true);
  assert.equal(saved[0].entitlement.exp, nextWeek);

  for (const currentPeriodEnd of [undefined, currentTime - 1]) {
    FakeStripe.subscription = makeSubscription('weekly', { current_period_end: currentPeriodEnd });
    saved.length = 0;
    await deliverWebhook(webhook, { type: 'customer.subscription.updated', data: { object: FakeStripe.subscription } });
    assert.equal(saved[0].entitlement.tier, 'free', 'A weekly subscription needs a current Stripe billing period.');
    assert.ok(saved[0].entitlement.exp <= core.nowSeconds());
    saved.length = 0;
    const missingPeriod = await verifySession('weekly', FakeStripe.subscription);
    assert.equal(missingPeriod.statusCode, 200);
    assert.equal(missingPeriod.body.active, false);
    assert.equal(missingPeriod.body.expiresAt, null);
    assert.equal(saved[0].entitlement.tier, 'free');
  }

  for (const [type, status] of [['invoice.payment_failed', 'past_due'], ['customer.subscription.deleted', 'canceled']]) {
    FakeStripe.subscription = makeSubscription('weekly', { status });
    saved.length = 0;
    const object = type.startsWith('invoice.') ? { subscription: FakeStripe.subscription.id } : FakeStripe.subscription;
    await deliverWebhook(webhook, { type, data: { object } });
    assert.equal(saved[0].entitlement.tier, 'free');
    assert.equal(saved[0].entitlement.plan, 'weekly');
  }

  saved.length = 0;
  await deliverWebhook(webhook, {
    type: 'customer.subscription.updated',
    data: { object: makeSubscription('weekly', { metadata: { ...metadata('weekly'), product: 'unrelated' } }) }
  });
  assert.equal(saved.length, 0, 'Unrelated Stripe products must not write DoctorAI entitlements.');

  FakeStripe.session = { metadata: { ...metadata('weekly'), account_email: 'other@example.test' }, subscription: makeSubscription('weekly') };
  const wrongAccount = responseRecorder();
  await verifyCheckout({ method: 'POST', body: { session_id: 'cs_test_synthetic' } }, wrongAccount);
  assert.equal(wrongAccount.statusCode, 403);
  assert.equal(saved.length, 0, 'A weekly session must remain bound to its authenticated DoctorAI account.');
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
  assert.equal(catalog.isValidPlanPrice(stripePrices.weekly, 'weekly', 'test'), true);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.weekly, livemode: true }, 'weekly', 'live'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.annual, 'annual', 'test'), true);
  assert.equal(catalog.isValidPlanPrice(stripePrices.monthly, 'annual', 'test'), false);
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, currency: 'usd' }, 'monthly', 'test'), false, 'Monthly checkout must not accept USD 29.00.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, unit_amount: 2901 }, 'monthly', 'test'), false, 'Monthly checkout must not accept a non-NZD-29 amount.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, recurring: { interval: 'month', interval_count: 12 } }, 'monthly', 'test'), false, 'Monthly checkout must reject malformed cadence.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, currency: 'eur' }, 'monthly', 'test'), false, 'Monthly checkout must reject unsupported currency.');
  assert.equal(catalog.isValidPlanPrice({ ...stripePrices.monthly, livemode: true }, 'monthly', 'test'), false);

  const validWeeklyPrice = structuredClone(stripePrices.weekly);
  const invalidWeeklyPrices = [
    { ...validWeeklyPrice, active: false },
    { ...validWeeklyPrice, type: 'one_time' },
    { ...validWeeklyPrice, currency: 'usd' },
    { ...validWeeklyPrice, currency: 'eur' },
    { ...validWeeklyPrice, unit_amount: 700 },
    { ...validWeeklyPrice, unit_amount: 699.5 },
    { ...validWeeklyPrice, recurring: { interval: 'month', interval_count: 1 } },
    { ...validWeeklyPrice, recurring: { interval: 'week', interval_count: 2 } },
    { ...validWeeklyPrice, livemode: true }
  ];
  for (const price of invalidWeeklyPrices) assert.equal(catalog.isValidPlanPrice(price, 'weekly', 'test'), false);
  assert.equal(catalog.isValidPlanPrice(validWeeklyPrice, 'daily', 'test'), false);

  const logged = [];
  core.reportError = (name, details) => logged.push({ name, details });
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.VERCEL_ENV = 'preview';
  process.env.STRIPE_PRO_WEEKLY_PRICE_ID = 'price_weekly_test';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_monthly_test';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_annual_test';
  const handler = plansHandler.createHandler(FakeStripe);
  const success = responseRecorder();
  await handler({ method: 'GET' }, success);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.body.plans.monthly, { available: true, amount: 2900, currency: 'NZD', interval: 'month' });
  assert.deepEqual(success.body.plans.weekly, { available: true, amount: 699, currency: 'NZD', interval: 'week' });
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

  const weeklyCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'weekly' }, headers: {}, socket: {} }, weeklyCheckout);
  assert.equal(weeklyCheckout.statusCode, 200);
  assert.deepEqual(FakeStripe.checkoutOptions.line_items, [{ price: 'price_weekly_test', quantity: 1 }]);
  assert.equal(FakeStripe.checkoutOptions.mode, 'subscription');
  assert.equal(FakeStripe.checkoutOptions.metadata.plan, 'weekly');
  assert.equal(FakeStripe.checkoutOptions.subscription_data.metadata.plan, 'weekly');
  assert.match(FakeStripe.checkoutOptions.cancel_url, /plan=weekly$/);
  assert.equal(Object.hasOwn(FakeStripe.checkoutOptions.subscription_data, 'trial_period_days'), false, 'Weekly pricing adds no unapproved trial.');
  assert.equal(Object.hasOwn(FakeStripe.checkoutOptions.subscription_data, 'trial_end'), false);

  core.identityFromRequest = async () => null;
  FakeStripe.checkoutOptions = null;
  const signedOutWeekly = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'weekly' }, headers: {}, socket: {} }, signedOutWeekly);
  assert.equal(signedOutWeekly.statusCode, 401);
  assert.equal(FakeStripe.checkoutOptions, null, 'A signed-out visitor cannot create a weekly Checkout Session.');
  core.identityFromRequest = async () => ({ email: 'buyer@example.test', sub: 'test-account' });

  for (const invalidPlan of ['daily', '__proto__']) {
    FakeStripe.checkoutOptions = null;
    const invalid = responseRecorder();
    await checkoutHandler({ method: 'POST', body: { plan: invalidPlan }, headers: {}, socket: {} }, invalid);
    assert.equal(invalid.statusCode, 400);
    assert.equal(FakeStripe.checkoutOptions, null);
  }

  for (const invalidPrice of invalidWeeklyPrices) {
    stripePrices.weekly = invalidPrice;
    const unavailable = responseRecorder();
    await handler({ method: 'GET' }, unavailable);
    assert.deepEqual(unavailable.body.plans.weekly, { available: false, interval: 'week' });
    assert.equal(unavailable.body.plans.monthly.available, true);
    assert.equal(unavailable.body.plans.annual.available, true);
    FakeStripe.checkoutOptions = null;
    const rejectedWeekly = responseRecorder();
    await checkoutHandler({ method: 'POST', body: { plan: 'weekly' }, headers: {}, socket: {} }, rejectedWeekly);
    assert.equal(rejectedWeekly.statusCode, 503);
    assert.equal(FakeStripe.checkoutOptions, null, 'Invalid weekly price details must not create a Checkout Session.');
  }
  for (const plan of ['monthly', 'annual']) {
    const unaffected = responseRecorder();
    await checkoutHandler({ method: 'POST', body: { plan }, headers: {}, socket: {} }, unaffected);
    assert.equal(unaffected.statusCode, 200, 'Invalid optional weekly pricing must not block an existing plan.');
    assert.equal(FakeStripe.checkoutOptions.line_items[0].price, `price_${plan}_test`);
  }
  stripePrices.weekly = validWeeklyPrice;
  delete process.env.STRIPE_PRO_WEEKLY_PRICE_ID;
  const missingWeekly = responseRecorder();
  await handler({ method: 'GET' }, missingWeekly);
  assert.deepEqual(missingWeekly.body.plans.weekly, { available: false, interval: 'week' });
  assert.equal(missingWeekly.body.plans.monthly.available, true);
  assert.equal(missingWeekly.body.plans.annual.available, true);
  FakeStripe.checkoutOptions = null;
  const missingWeeklyCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'weekly' }, headers: {}, socket: {} }, missingWeeklyCheckout);
  assert.equal(missingWeeklyCheckout.statusCode, 503);
  assert.equal(FakeStripe.checkoutOptions, null);
  process.env.STRIPE_PRO_WEEKLY_PRICE_ID = 'price_weekly_test';

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
  const blockedWeeklyCheckout = responseRecorder();
  await checkoutHandler({ method: 'POST', body: { plan: 'weekly' }, headers: {}, socket: {} }, blockedWeeklyCheckout);
  assert.equal(blockedWeeklyCheckout.statusCode, 503, 'The existing monthly verification prerequisite applies to weekly checkout too.');
  assert.equal(FakeStripe.checkoutOptions, null);
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

  await verifySubscriptionEntitlements();

  process.stdout.write('Stripe pricing verification passed (weekly/monthly/annual validation, checkout selection, mode guards, and subscription entitlements).\n');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  core.identityFromRequest = originalIdentity;
  core.storageConfigured = originalStorage;
  core.rateLimit = originalRateLimit;
  core.saveEntitlement = originalSaveEntitlement;
  core.configured = originalConfigured;
  core.reportError = originalReportError;
  if (stripeModule && originalStripeExport) stripeModule.exports = originalStripeExport;
  delete require.cache[require.resolve('../server-src/stripe/create-checkout-session.js')];
  delete require.cache[require.resolve('../server-src/stripe/webhook.js')];
  delete require.cache[require.resolve('../server-src/stripe/verify-checkout-session.js')];
  delete require.cache[stripeStubPath];
  Module._resolveFilename = originalResolveFilename;
});
