'use strict';

const assert = require('node:assert/strict');

process.env.VERCEL_ENV = 'preview';
process.env.PREVIEW_AUTH_SECRET = 'synthetic-preview-auth-secret';
process.env.PREVIEW_AUTH_GOOGLE_ID = 'synthetic-preview.apps.googleusercontent.com';
process.env.PREVIEW_KV_REST_API_URL = 'https://synthetic-kv.invalid';
process.env.PREVIEW_KV_REST_API_TOKEN = 'synthetic-preview-kv-token';

const core = require('../server-src/_lib/doctorai-core.cjs');
const googleHandler = require('../api/auth/google.js');
const mobileHandler = require('../api/auth/mobile.js');

function responseFixture() {
  const headers = new Map();
  return {
    headers,
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function run() {
  const signedOut = responseFixture();
  core.clearSession(signedOut);
  core.clearEntitlementCookies(signedOut);
  const cookies = signedOut.getHeader('Set-Cookie');
  assert.ok(Array.isArray(cookies));
  assert.equal(cookies.length, 3);
  assert.ok(cookies.some(value => value.startsWith('doctorai_session=;')));
  assert.ok(cookies.some(value => value.startsWith('doctorai_entitlement=;')));
  assert.ok(cookies.some(value => value.startsWith('doctorai_free_pro=;')));

  assert.equal(core.storageConfigured(), true, 'Synthetic isolated Preview storage should be configured for error-path tests.');
  core.verifyGoogleCredential = async () => ({ sub: 'synthetic-subject', email: 'synthetic@example.invalid', name: 'Synthetic Account' });
  global.fetch = async url => {
    assert.match(String(url), /^https:\/\/synthetic-kv\.invalid\//, 'The test must never reach production storage or a real provider.');
    throw new TypeError('fetch failed');
  };

  const googleResponse = responseFixture();
  await googleHandler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' }, body: { credential: 'synthetic' }, socket: {} }, googleResponse);
  assert.equal(googleResponse.statusCode, 503, 'Google auth must report storage/network outages as unavailable, not an internal server error.');

  const mobileResponse = responseFixture();
  await mobileHandler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.11' }, body: { state: 'S'.repeat(32), credential: 'synthetic' }, socket: {} }, mobileResponse);
  assert.equal(mobileResponse.statusCode, 503, 'Mobile auth must report storage/network outages as unavailable, not an internal server error.');

  core.verifyGoogleCredential = async () => { throw new Error('Google credential verification failed.'); };
  global.fetch = async () => ({ ok: false, json: async () => [] });
  const invalidGoogle = responseFixture();
  await googleHandler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.12' }, body: { credential: 'invalid' }, socket: {} }, invalidGoogle);
  assert.equal(invalidGoogle.statusCode, 401, 'Invalid credentials remain authentication failures.');

  console.log('Cloud auth boundary verification passed: sign-out clears session and entitlement cookies; storage/network failures return 503; invalid credentials remain 401. Synthetic Preview config only.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
