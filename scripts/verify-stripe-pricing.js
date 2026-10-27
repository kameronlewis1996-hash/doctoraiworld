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
const originalAcquireEntitlementLease = core.acquireEntitlementLease;
const originalSaveEntitlementWithLease = core.saveEntitlementWithLease;
const originalReleaseEntitlementLease = core.releaseEntitlementLease;
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
      return FakeStripe.subscriptionRetrieveHook
        ? FakeStripe.subscriptionRetrieveHook(id)
        : FakeStripe.subscription;
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
  else if (options.body) assert.deepEqual(response.body, options.body);
  else assert.deepEqual(response.body, { error: 'Invalid Stripe webhook.' });
  return response;
}

async function verifySubscriptionEntitlements() {
  const saved = [];
  const activeLeases = new Map();
  let leaseNumber = 0;
  let gatedActiveWrite = null;
  let onActiveWriteStarted = null;
  let persistedEntitlement = null;
  core.acquireEntitlementLease = async account => {
    const key = core.accountKey(account);
    if (activeLeases.has(key)) return null;
    const lease = { key, token: `synthetic-lease-${++leaseNumber}` };
    activeLeases.set(key, lease);
    return lease;
  };
  core.releaseEntitlementLease = async lease => {
    if (activeLeases.get(lease.key)?.token !== lease.token) return false;
    activeLeases.delete(lease.key);
    return true;
  };
  core.saveEntitlementWithLease = async (account, entitlement, lease) => {
    if (activeLeases.get(lease.key)?.token !== lease.token) return false;
    if (entitlement.status === 'active' && gatedActiveWrite) {
      onActiveWriteStarted?.();
      await gatedActiveWrite;
    }
    if (activeLeases.get(lease.key)?.token !== lease.token) return false;
    const write = { account, entitlement };
    saved.push(write);
    persistedEntitlement = write;
    return true;
  };
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

  for (const [type, paymentStatus, expected] of [
    ['checkout.session.completed', 'unpaid', false],
    ['checkout.session.completed', 'no_payment_required', true],
    ['checkout.session.async_payment_succeeded', 'paid', true],
    ['checkout.session.async_payment_succeeded', 'unpaid', false]
  ]) {
    FakeStripe.subscription = makeSubscription('monthly', { status: paymentStatus === 'no_payment_required' ? 'trialing' : 'active' });
    saved.length = 0;
    FakeStripe.subscriptionRetrievals = [];
    await deliverWebhook(webhook, {
      type,
      data: { object: { subscription: FakeStripe.subscription.id, payment_status: paymentStatus, metadata: metadata('monthly') } }
    });
    assert.equal(saved.length, expected ? 1 : 0, `${type} only grants access after a paid or no-payment-required outcome.`);
    if (expected) assert.equal(saved[0].entitlement.tier, 'pro');
    else assert.deepEqual(FakeStripe.subscriptionRetrievals, [], 'Unpaid Checkout Sessions do not retrieve a subscription or write an entitlement.');
  }

  FakeStripe.subscription = makeSubscription('annual', { status: 'trialing' });
  saved.length = 0;
  await deliverWebhook(webhook, { type: 'customer.subscription.created', data: { object: FakeStripe.subscription } });
  assert.equal(saved.length, 1, 'New trial subscriptions are recorded from customer.subscription.created.');
  assert.equal(saved[0].entitlement.tier, 'pro');

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
    assert.deepEqual(FakeStripe.subscriptionRetrievals, [FakeStripe.subscription.id, FakeStripe.subscription.id], 'Basil invoice events retrieve the actual subscription before and after locking.');
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
  assert.deepEqual(FakeStripe.subscriptionRetrievals, [FakeStripe.subscription.id, FakeStripe.subscription.id]);
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
  assert.deepEqual(FakeStripe.subscriptionRetrievals, [FakeStripe.subscription.id, FakeStripe.subscription.id], 'The legacy subscription pointer remains a supported fallback.');
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

  const staleActiveSubscription = makeSubscription('weekly', { status: 'active' });
  for (const [type, object] of [
    ['customer.subscription.updated', staleActiveSubscription],
    ['checkout.session.completed', {
      subscription: staleActiveSubscription.id, payment_status: 'paid', metadata: metadata('weekly')
    }],
    ['checkout.session.completed', {
      subscription: staleActiveSubscription, payment_status: 'paid', metadata: metadata('weekly')
    }]
  ]) {
    FakeStripe.subscription = makeSubscription('weekly', { status: 'canceled' });
    saved.length = 0;
    FakeStripe.subscriptionRetrievals = [];
    await deliverWebhook(webhook, { type, data: { object } });
    assert.deepEqual(FakeStripe.subscriptionRetrievals, [FakeStripe.subscription.id, FakeStripe.subscription.id]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].entitlement.tier, 'free', `${type} must use current Stripe state when its event snapshot is stale.`);
  }

  FakeStripe.subscription = makeSubscription('weekly');
  FakeStripe.subscriptionRetrieveHook = null;
  const replay = {
    id: 'evt_synthetic_replay', type: 'customer.subscription.updated',
    data: { object: FakeStripe.subscription }
  };
  saved.length = 0;
  await deliverWebhook(webhook, replay);
  await deliverWebhook(webhook, replay);
  assert.equal(saved.length, 2, 'Webhook delivery remains at-least-once and a replay can repeat the state write.');
  assert.deepEqual(saved[1].entitlement, saved[0].entitlement, 'Replaying an event must converge to the same entitlement state.');

  const olderActive = makeSubscription('weekly', { status: 'active' });
  const newerCancelled = makeSubscription('weekly', { status: 'canceled' });
  let releaseOlderWrite;
  let olderWriteStarted;
  const olderWriteStartedPromise = new Promise(resolve => { olderWriteStarted = resolve; });
  gatedActiveWrite = new Promise(resolve => { releaseOlderWrite = resolve; });
  onActiveWriteStarted = olderWriteStarted;
  let retrieval = 0;
  FakeStripe.subscription = olderActive;
  FakeStripe.subscriptionRetrieveHook = () => (++retrieval <= 2 ? olderActive : newerCancelled);
  const olderEvent = deliverWebhook(webhook, {
    id: 'evt_synthetic_older_active', type: 'customer.subscription.updated',
    data: { object: olderActive }
  });
  await olderWriteStartedPromise;
  const busyEvent = await deliverWebhook(webhook, {
    id: 'evt_synthetic_newer_cancelled', type: 'customer.subscription.deleted',
    data: { object: newerCancelled }
  }, {
    status: 503,
    body: { error: 'Subscription status is temporarily busy. Stripe will retry.' }
  });
  assert.equal(busyEvent.statusCode, 503, 'A concurrent entitlement update must be retried instead of writing without the lease.');
  releaseOlderWrite();
  await olderEvent;
  gatedActiveWrite = null;
  onActiveWriteStarted = null;
  FakeStripe.subscription = newerCancelled;
  await deliverWebhook(webhook, {
    id: 'evt_synthetic_newer_cancelled', type: 'customer.subscription.deleted',
    data: { object: newerCancelled }
  });
  assert.equal(persistedEntitlement.entitlement.tier, 'free', 'A delayed older active write must not overwrite a later cancellation.');
  FakeStripe.subscriptionRetrieveHook = null;
  core.saveEntitlementWithLease = async (account, entitlement, lease) => {
    if (activeLeases.get(lease.key)?.token !== lease.token) return false;
    const write = { account, entitlement };
    saved.push(write);
    persistedEntitlement = write;
    return true;
  };

  const heldLease = await core.acquireEntitlementLease({ email: 'buyer@example.test', sub: 'test-account' });
  assert.ok(heldLease, 'A webhook entitlement lease can be acquired for the authenticated account.');
  saved.length = 0;
  const checkoutDuringWebhook = await verifySession('weekly', makeSubscription('weekly'));
  assert.equal(checkoutDuringWebhook.statusCode, 503, 'Checkout verification must share the webhook account lock.');
  assert.equal(saved.length, 0, 'Checkout verification must not write around an active webhook lease.');
  await core.releaseEntitlementLease(heldLease);
  const checkoutAfterWebhook = await verifySession('weekly', makeSubscription('weekly'));
  assert.equal(checkoutAfterWebhook.statusCode, 200, 'Checkout verification can save after the shared account lease is released.');
  assert.equal(saved.length, 1);

  const originalReadStoredEntitlement = core.readStoredEntitlement;
  const originalReadFreeGrant = core.readFreeGrant;
  const originalRecordFreeGrant = core.recordFreeGrant;
  const originalSetEntitlementCookie = core.setEntitlementCookie;
  const originalFreeProCode = process.env.DOCTORAI_FREE_PRO_CODE;
  try {
    process.env.DOCTORAI_FREE_PRO_CODE = 'SYNTHETIC-PROMO';
    core.configured = () => true;
    core.readStoredEntitlement = async () => null;
    core.readFreeGrant = async () => null;
    core.recordFreeGrant = async () => true;
    core.setEntitlementCookie = () => {};
    delete require.cache[require.resolve('../server-src/staff/redeem-pro.js')];
    const redeemPro = require('../server-src/staff/redeem-pro.js');
    const redemptionLease = await core.acquireEntitlementLease({ email: 'buyer@example.test', sub: 'test-account' });
    assert.ok(redemptionLease);
    saved.length = 0;
    const busyRedemption = responseRecorder();
    await redeemPro({ method: 'POST', body: { code: 'SYNTHETIC-PROMO' }, headers: {}, socket: {} }, busyRedemption);
    assert.equal(busyRedemption.statusCode, 503, 'Promo redemption must wait for the shared account entitlement lock.');
    assert.equal(saved.length, 0);
    await core.releaseEntitlementLease(redemptionLease);
    const redemption = responseRecorder();
    await redeemPro({ method: 'POST', body: { code: 'SYNTHETIC-PROMO' }, headers: {}, socket: {} }, redemption);
    assert.equal(redemption.statusCode, 200);
    assert.equal(saved[0].entitlement.source, 'promotional-code');
  } finally {
    core.configured = () => false;
    core.readStoredEntitlement = originalReadStoredEntitlement;
    core.readFreeGrant = originalReadFreeGrant;
    core.recordFreeGrant = originalRecordFreeGrant;
    core.setEntitlementCookie = originalSetEntitlementCookie;
    if (originalFreeProCode === undefined) delete process.env.DOCTORAI_FREE_PRO_CODE;
    else process.env.DOCTORAI_FREE_PRO_CODE = originalFreeProCode;
    delete require.cache[require.resolve('../server-src/staff/redeem-pro.js')];
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
  FakeStripe.subscription = makeSubscription('weekly', { metadata: { ...metadata('weekly'), product: 'unrelated' } });
  await deliverWebhook(webhook, {
    type: 'customer.subscription.updated',
    data: { object: FakeStripe.subscription }
  });
  assert.equal(saved.length, 0, 'Unrelated Stripe products must not write DoctorAI entitlements.');

  FakeStripe.session = { metadata: { ...metadata('weekly'), account_email: 'other@example.test' }, subscription: makeSubscription('weekly') };
  const wrongAccount = responseRecorder();
  await verifyCheckout({ method: 'POST', body: { session_id: 'cs_test_synthetic' } }, wrongAccount);
  assert.equal(wrongAccount.statusCode, 403);
  assert.equal(saved.length, 0, 'A weekly session must remain bound to its authenticated DoctorAI account.');
}

async function verifyStripeEntitlementLeaseStorage() {
  const names = ['AUTH_SECRET', 'DOCTORAI_TEST_KV_REST_API_URL', 'DOCTORAI_TEST_KV_REST_API_TOKEN', 'VERCEL_ENV'];
  const env = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const originalStorageConfigured = core.storageConfigured;
  const locks = new Map();
  const hashes = new Map();

  process.env.AUTH_SECRET = 'synthetic-only-auth-secret-for-offline-test';
  process.env.DOCTORAI_TEST_KV_REST_API_URL = 'https://redis.synthetic.invalid';
  process.env.DOCTORAI_TEST_KV_REST_API_TOKEN = 'synthetic-only-token';
  process.env.VERCEL_ENV = 'preview';
  core.storageConfigured = () => true;
  global.fetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'hget') {
      const value = hashes.get(`${parts[1]}:${parts[2]}`) ?? null;
      return { ok: true, json: async () => ({ result: value }) };
    }
    if (parts[0] === 'hset') {
      hashes.set(`${parts[1]}:${parts[2]}`, JSON.parse(options.body));
      return { ok: true, json: async () => ({ result: 1 }) };
    }
    const command = JSON.parse(options.body);
    let result = null;
    if (command[0] === 'SET') {
      const [, key, token] = command;
      if (!locks.has(key)) {
        locks.set(key, token);
        result = 'OK';
      }
    } else if (command[0] === 'EVAL' && command[1].includes('entitlement-save-v1')) {
      const [, , , lockKey, accountKey, token, field, value] = command;
      if (locks.get(lockKey) === token) {
        hashes.set(`${accountKey}:${encodeURIComponent(field)}`, value);
        result = 1;
      } else result = 0;
    } else if (command[0] === 'EVAL' && command[1].includes('entitlement-release-v1')) {
      const [, , , lockKey, token] = command;
      if (locks.get(lockKey) === token) {
        locks.delete(lockKey);
        result = 1;
      } else result = 0;
    } else {
      throw new Error(`Unexpected synthetic Redis command: ${command[0]}`);
    }
    return { ok: true, json: async () => ({ result }) };
  };

  try {
    const account = { email: 'lease@example.test', sub: 'synthetic-account' };
    const staleLease = await core.acquireEntitlementLease(account);
    assert.ok(staleLease);
    assert.equal(await core.acquireEntitlementLease(account), null, 'SET NX must reject a second concurrent lease.');
    assert.equal(await core.saveEntitlement(account, { tier: 'free', email: account.email }), false,
      'The compatibility save API must not bypass an active entitlement lease.');
    assert.equal(await core.saveEntitlementWithLease({ email: 'other@example.test', sub: 'other-account' }, {
      tier: 'pro', email: 'other@example.test'
    }, staleLease), false, 'A lease for one account cannot authorize writes to another account.');
    assert.equal(await core.saveEntitlementWithLease(account, { tier: 'pro', email: account.email }, staleLease), true);
    const entitlementKey = `${encodeURIComponent(`doctorai:accounts:${core.accountKey(account)}`)}:entitlement`;
    const previousValue = hashes.get(entitlementKey);
    assert.ok(previousValue, `A lease holder writes the sealed entitlement hash value (stored keys: ${[...hashes.keys()].join(', ')}; expected: ${entitlementKey}).`);

    locks.delete(staleLease.key); // Model expiration of the first lease before another holder takes it.
    const currentLease = await core.acquireEntitlementLease(account);
    assert.ok(currentLease);
    assert.equal(await core.saveEntitlementWithLease(account, { tier: 'free', email: account.email }, staleLease), false,
      'A former lease holder cannot overwrite a newer entitlement after lease expiry.');
    assert.equal(await core.releaseEntitlementLease(staleLease), false,
      'A former lease holder cannot release the current holder’s lease.');
    assert.equal(hashes.get(entitlementKey), previousValue,
      'A fenced stale write leaves the current entitlement untouched.');
    assert.equal(await core.saveEntitlementWithLease(account, { tier: 'free', email: account.email }, currentLease), true);
    assert.equal(await core.releaseEntitlementLease(currentLease), true);
    assert.equal(await core.saveEntitlement(account, { tier: 'pro', email: account.email }), true,
      'The compatibility save API acquires and releases the same per-account entitlement lease.');

    const grantAccount = { email: 'grant@example.test', sub: 'synthetic-grant-account' };
    const originalGrant = {
      email: grantAccount.email, source: 'promotional-code', exp: core.nowSeconds() + 86400,
      expiresAt: new Date((core.nowSeconds() + 86400) * 1000).toISOString(), redeemedAt: new Date().toISOString()
    };
    await core.recordFreeGrant(grantAccount, originalGrant);
    const grantLease = await core.acquireEntitlementLease(grantAccount);
    assert.ok(grantLease);
    assert.equal(await core.saveEntitlementWithLease(grantAccount, {
      tier: 'pro', source: 'promotional-code', email: grantAccount.email, exp: originalGrant.exp
    }, grantLease), true);
    await core.releaseEntitlementLease(grantLease);

    const competingLease = await core.acquireEntitlementLease(grantAccount);
    assert.ok(competingLease);
    await assert.rejects(core.revokeFreeGrant(grantAccount, { email: 'staff@example.test' }), error => error.retryable === true,
      'A complimentary revoke must not bypass a concurrent paid entitlement update.');
    assert.equal((await core.readFreeGrant(grantAccount)).revokedAt, undefined,
      'A busy revoke leaves the complimentary grant unchanged for a retry.');
    await core.releaseEntitlementLease(competingLease);

    assert.deepEqual(await core.revokeFreeGrant(grantAccount, { email: 'staff@example.test' }), { found: true, revoked: true });
    assert.equal((await core.readFreeGrant(grantAccount)).revokedAt?.length > 0, true);
    assert.equal(await core.readStoredEntitlement(grantAccount), null);
    assert.equal(await core.activeEntitlement({}, grantAccount), null,
      'A revoked complimentary grant no longer activates Pro access.');

    await core.recordFreeGrant(grantAccount, { ...originalGrant, redeemedAt: undefined, revokedAt: undefined });
    const paidLease = await core.acquireEntitlementLease(grantAccount);
    assert.ok(paidLease);
    assert.equal(await core.saveEntitlementWithLease(grantAccount, {
      tier: 'pro', source: 'stripe', email: grantAccount.email, exp: originalGrant.exp
    }, paidLease), true);
    await core.releaseEntitlementLease(paidLease);
    assert.deepEqual(await core.revokeFreeGrant(grantAccount, { email: 'staff@example.test' }), { found: true, revoked: true });
    const paidAfterRevocation = await core.readStoredEntitlement(grantAccount);
    assert.equal(paidAfterRevocation.tier, 'pro', 'Revoking a complimentary code must preserve a separate paid subscription.');
    assert.equal(paidAfterRevocation.source, 'stripe');
  } finally {
    global.fetch = originalFetch;
    core.storageConfigured = originalStorageConfigured;
    for (const name of names) {
      if (env[name] === undefined) delete process.env[name];
      else process.env[name] = env[name];
    }
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

  await verifyStripeEntitlementLeaseStorage();
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
  core.acquireEntitlementLease = originalAcquireEntitlementLease;
  core.saveEntitlementWithLease = originalSaveEntitlementWithLease;
  core.releaseEntitlementLease = originalReleaseEntitlementLease;
  core.configured = originalConfigured;
  core.reportError = originalReportError;
  if (stripeModule && originalStripeExport) stripeModule.exports = originalStripeExport;
  delete require.cache[require.resolve('../server-src/stripe/create-checkout-session.js')];
  delete require.cache[require.resolve('../server-src/stripe/webhook.js')];
  delete require.cache[require.resolve('../server-src/stripe/verify-checkout-session.js')];
  delete require.cache[stripeStubPath];
  Module._resolveFilename = originalResolveFilename;
});
