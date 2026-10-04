'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const guard = require('../server-src/_lib/preview-provider-guard.cjs');
const paths = [
  'api/chat.js', 'api/medication/_handlers/scan.js',
  'server-src/stripe/public-plans.js',
  'server-src/stripe/create-checkout-session.js',
  'server-src/stripe/create-portal-session.js',
  'server-src/stripe/verify-checkout-session.js',
  'server-src/stripe/webhook.js', 'server-src/staff/grant-pro.js'
];
const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
(async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Outbound request is forbidden in this synthetic test'); };
  process.env.VERCEL_ENV = 'preview';
  process.env.OPENAI_API_KEY = 'synthetic-inherited-key';
  process.env.STRIPE_SECRET_KEY = 'sk_live_synthetic_fixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-inherited-webhook';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'synthetic-monthly';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'synthetic-annual';
  for (const file of paths) {
    const result = response();
    await require(path.join('..', file))({ method: file.endsWith('public-plans.js') ? 'GET' : 'POST', headers: {}, query: {}, body: {} }, result);
    assert.equal(result.statusCode, 503, file);
    assert.match(result.body.code, /^preview_.*_disabled$/, file);
    assert.equal(result.headers['Cache-Control'], 'no-store, max-age=0');
  }
  const config = response();
  require('../api/auth/config.js')({ method: 'GET' }, config);
  assert.equal(config.body.services.ai, false);
  assert.equal(config.body.services.subscriptions, false);
  assert.equal(calls, 0);
  for (const environment of ['production', 'development', '']) {
    process.env.VERCEL_ENV = environment;
    assert.equal(guard.paidProvidersEnabled(), true);
    assert.equal(guard.blockPreview(response(), 'ai'), false);
  }
  assert.equal(calls, 0);
  console.log(`Preview providers passed: ${paths.length} real handlers reject inherited keys before auth/provider calls, config reports AI/billing disabled, production/development guard unchanged; zero outbound calls. Local medication checks remain separate.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
