'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const { Readable } = require('node:stream');

// All providers in this review are synthetic. Unexpected network access fails.
process.env.AUTH_SECRET = 'synthetic-shared-environment-secret';
process.env.KV_REST_API_URL = 'https://example.invalid';
process.env.KV_REST_API_TOKEN = 'synthetic-token';
process.env.BLOB_READ_WRITE_TOKEN = 'synthetic-blob-token';
process.env.DOCTORAI_TEST_BLOB_STORE_ID = 'store_synthetic_preview';
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.VERCEL_TARGET_ENV;
const hashes = new Map();
const keysSeen = [];
global.fetch = async (input, options = {}) => {
  const url = new URL(input);
  assert.equal(url.origin, 'https://example.invalid');
  const [command, key, field] = url.pathname.slice(1).split('/').map(decodeURIComponent);
  if (command === 'pipeline') {
    const commands = JSON.parse(options.body);
    keysSeen.push(...commands.map(value => value[1]));
    return { ok: true, json: async () => [{ result: 1 }, { result: 1 }] };
  }
  keysSeen.push(key);
  if (!hashes.has(key)) hashes.set(key, new Map());
  const values = hashes.get(key);
  let result;
  if (command === 'hset') { values.set(field, JSON.parse(options.body)); result = 1; }
  else if (command === 'hget') result = values.get(field) ?? null;
  else if (command === 'hgetall') result = Object.fromEntries(values);
  else if (command === 'hvals') result = [...values.values()];
  else if (command === 'hdel') result = values.delete(field) ? 1 : 0;
  else if (command === 'del') result = hashes.delete(key) ? 1 : 0;
  else throw new Error(`Unexpected synthetic storage command: ${command}`);
  return { ok: true, json: async () => ({ result }) };
};
let stripeConstructed = 0;
let webhookLiveMode = true;
let blobCalls = 0;
const blob = {
  get: async () => { blobCalls++; throw new Error('Unexpected Blob read'); },
  del: async () => { blobCalls++; throw new Error('Unexpected Blob delete'); },
  put: async () => { blobCalls++; throw new Error('Unexpected Blob write'); }
};
const originalLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'stripe') return class SyntheticStripe {
    constructor() { stripeConstructed++; this.webhooks = { constructEvent: () => ({ type: 'synthetic.ignored', livemode: webhookLiveMode }) }; }
  };
  if (name === '@vercel/blob') return blob;
  return originalLoad.call(this, name, parent, isMain);
};
const core = require('../server-src/_lib/doctorai-core.cjs');
const health = require('../api/health/state.js');
const documents = require('../api/documents.js');
const portal = require('../server-src/stripe/create-portal-session.js');
const verify = require('../server-src/stripe/verify-checkout-session.js');
const webhook = require('../server-src/stripe/webhook.js');
const staff = require('../server-src/staff/delete-account.js');
const response = () => ({ statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } });
const request = (session, method = 'GET', body, query = {}) => ({ method, body, query, headers: { cookie: `doctorai_session=${core.signedToken(session)}`, 'x-forwarded-for': '203.0.113.7' } });
const snapshotProduction = () => JSON.stringify([...hashes].filter(([key]) => key.startsWith('doctorai:')).map(([key, value]) => [key, [...value]]));

(async () => {
  const account = { email: 'same.account@example.test' };
  process.env.VERCEL_ENV = 'production';
  assert.equal(core.storageNamespace(), 'doctorai');
  assert.equal(core.documentStorageConfigured(), true);
  assert.deepEqual(await core.documentBlobOptions(), { access: 'private' });
  const production = core.createSession({ sub: 'synthetic-google-sub', email: account.email });
  const productionToken = core.signedToken(production);
  const payload = productionToken.slice(0, productionToken.lastIndexOf('.'));
  assert.equal(productionToken, `${payload}.${crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url')}`, 'Production signature format must remain compatible.');
  const encrypted = core.sealBuffer(Buffer.from('synthetic production document'));
  const envelope = JSON.parse(encrypted.toString());
  const legacyKey = crypto.hkdfSync('sha256', Buffer.from(process.env.AUTH_SECRET), Buffer.from('doctorai-health-storage-v1'), Buffer.from('account-data'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', legacyKey, Buffer.from(envelope.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  assert.equal(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64url')), decipher.final()]).toString(), 'synthetic production document');
  await core.activateSession(production);
  await core.saveHealthState(account, { providers: [{ name: 'Production GP' }] });
  await core.saveEntitlement(account, { tier: 'pro', subscriptionId: 'sub_production' });
  await core.savePendingCheckoutSession(account, 'cs_production');
  await core.recordFreeGrant(account, { email: account.email, issuedAt: new Date().toISOString() });
  const prodBlob = `${core.documentBlobPrefix(account)}doc-production.enc`;
  await core.saveDocumentMetadata(account, { id: 'doc-production', blobPath: prodBlob });
  const before = snapshotProduction();

  process.env.VERCEL_ENV = 'preview';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  keysSeen.length = 0;
  assert.equal(core.storageNamespace(), 'doctorai-preview');
  assert.equal(core.documentStorageConfigured(), true, 'Preview documents must use their connected OIDC-backed Blob store without a build-only OIDC environment variable.');
  const syntheticOidcPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const syntheticOidcToken = `synthetic.${syntheticOidcPayload}.signature`;
  process.env.VERCEL_OIDC_TOKEN = syntheticOidcToken;
  assert.deepEqual(await core.documentBlobOptions(), { access: 'private', oidcToken: syntheticOidcToken, storeId: 'store_synthetic_preview' });
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.DOCTORAI_TEST_BLOB_STORE_ID;
  assert.equal(core.documentStorageConfigured(), false, 'Preview documents must fail closed without a connected test store.');
  await assert.rejects(core.documentBlobOptions(), /Preview private document storage is not configured/);
  process.env.DOCTORAI_TEST_BLOB_STORE_ID = 'store_synthetic_preview';
  await assert.rejects(core.documentBlobOptions(), /OIDC/i, 'Preview documents must not fall back to a shared Blob token without OIDC.');
  process.env.VERCEL_OIDC_TOKEN = syntheticOidcToken;
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.doctoraiworld.com';
  process.env.VERCEL_URL = 'synthetic-preview.vercel.app';
  assert.equal(require('../server-src/stripe/app-url.cjs')(), 'https://synthetic-preview.vercel.app');
  assert.equal(await core.identityFromRequest({ headers: { cookie: `doctorai_session=${productionToken}` } }), null);
  assert.equal(core.unsealBuffer(encrypted), null, 'Preview must not decrypt Production data with a shared secret.');
  assert.equal(await core.readHealthState(account), null);
  assert.equal(await core.readStoredEntitlement(account), null);
  assert.equal(await core.readFreeGrant(account), null);
  assert.deepEqual(await core.listDocumentMetadata(account), []);
  assert.deepEqual(await core.listPendingCheckoutSessions(account), []);
  const preview = core.createSession({ sub: production.sub, email: account.email });
  await core.activateSession(preview);
  assert.ok(await core.identityFromRequest(request(preview)));
  const res = response();
  await health(request(preview, 'PUT', { state: { medications: [], providers: [{ id: 'gp-test', name: 'Preview GP' }] } }), res);
  assert.equal(res.statusCode, 200, 'The actual health route must accept the Android providers payload.');
  assert.equal((await core.readHealthState(account)).state.providers[0].name, 'Preview GP');
  await core.saveEntitlement(account, { tier: 'pro', subscriptionId: 'sub_preview' });
  await core.savePendingCheckoutSession(account, 'cs_preview');
  await core.recordFreeGrant(account, { email: account.email, issuedAt: new Date().toISOString() });
  assert.equal(core.documentPathIsOwned(account, prodBlob), false);
  for (const suffix of ['../other.enc', '%2e%2e%2fother.enc', 'folder/file.enc', 'folder\\file.enc', '']) assert.equal(core.documentPathIsOwned(account, `${core.documentBlobPrefix(account)}${suffix}`), false);
  // Even forged or stale metadata cannot direct a Preview read/delete to Production.
  await core.saveDocumentMetadata(account, { id: 'doc-foreign', blobPath: prodBlob });
  for (const method of ['GET', 'DELETE']) {
    const reply = response();
    await documents(request(preview, method, undefined, { id: 'doc-foreign' }), reply);
    assert.equal(reply.statusCode, 404);
  }
  assert.equal(blobCalls, 0);
  await core.deleteDocumentMetadata(account, 'doc-foreign');
  const previewBlob = `${core.documentBlobPrefix(account)}doc-preview.enc`;
  await core.saveDocumentMetadata(account, { id: 'doc-preview', blobPath: previewBlob });

  const admin = core.createSession({ sub: 'synthetic-admin', email: 'support@doctoraiworld.com' });
  await core.activateSession(admin);
  process.env.STRIPE_SECRET_KEY = 'sk_live_synthetic_only';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
  for (const handler of [portal, verify]) {
    const reply = response();
    await handler(request(preview, 'POST', { session_id: 'cs_preview' }), reply);
    assert.equal(reply.statusCode, 503);
  }
  const staffReply = response();
  await staff(request(admin, 'POST', { email: account.email, action: 'inspect' }), staffReply);
  assert.equal(staffReply.body.billing.verified, false);
  const webhookReply = response();
  await webhook({ method: 'POST' }, webhookReply);
  assert.equal(webhookReply.statusCode, 503);
  assert.equal(stripeConstructed, 0, 'No Preview handler may instantiate Stripe with a live key.');
  process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_only';
  for (const [livemode, expected] of [[true, 400], [false, 200]]) {
    webhookLiveMode = livemode;
    const req = Readable.from([Buffer.from('{}')]); req.method = 'POST'; req.headers = { 'stripe-signature': 'synthetic' };
    const reply = response(); await webhook(req, reply); assert.equal(reply.statusCode, expected);
  }
  const deleted = [];
  await core.deleteAccountData(account, ['sub_preview'], {
    list: async ({ prefix }) => { assert.equal(prefix, core.documentBlobPrefix(account)); return { blobs: [{ pathname: previewBlob }], hasMore: false }; },
    del: async paths => deleted.push(...paths)
  });
  assert.deepEqual(deleted, [previewBlob]);
  assert.equal(await core.isDeletedSubscription('sub_preview'), true);
  assert.equal(await core.isDeletedSubscription('sub_production'), false);
  assert.equal(snapshotProduction(), before, 'Preview writes and deletion must leave every Production record unchanged.');
  assert.ok(keysSeen.length > 0 && keysSeen.every(key => key.startsWith('doctorai-preview:')), 'All Preview KV paths and rate-limit pipeline keys must be scoped.');
  const previewToken = core.signedToken(admin);
  process.env.VERCEL_ENV = 'production';
  assert.equal(await core.identityFromRequest({ headers: { cookie: `doctorai_session=${previewToken}` } }), null);
  assert.ok(await core.identityFromRequest({ headers: { cookie: `doctorai_session=${productionToken}` } }));
  assert.equal((await core.readHealthState(account)).state.providers[0].name, 'Production GP');
  process.env.VERCEL_TARGET_ENV = 'custom-staging';
  assert.match(core.storageNamespace(), /^doctorai-environment-/);
  assert.equal(require('../server-src/stripe/plan-catalog.cjs').environmentModeMatches('sk_live_synthetic', 'custom-staging'), false);
  console.log('Preview isolation review passed: shared credentials, signatures/encryption, KV/pipeline keys, document guards, provider sync, billing mode, and scoped deletion. Production format and records preserved.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; });
