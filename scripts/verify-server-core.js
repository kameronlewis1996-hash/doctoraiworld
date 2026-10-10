'use strict';

const assert = require('node:assert/strict');

process.env.AUTH_SECRET = 'test-only-secret-with-sufficient-length';
process.env.VERCEL_ENV = 'production';
process.env.KV_REST_API_URL = 'https://example.invalid';
process.env.KV_REST_API_TOKEN = 'test-only-token';
process.env.BLOB_READ_WRITE_TOKEN = 'production-blob-test-token';
process.env.AUTH_GOOGLE_ID = 'server-authoritative-client-id.apps.googleusercontent.com';
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'stale-public-client-id.apps.googleusercontent.com';

let count = 0;
global.fetch = async (url, options = {}) => {
  assert.equal(url, 'https://example.invalid/pipeline');
  const commands = JSON.parse(options.body);
  assert.equal(commands[0][0], 'INCR');
  assert.equal(commands[1][0], 'PEXPIRE');
  count += 1;
  return { ok: true, json: async () => [{ result: count }, { result: 1 }] };
};

const core = require('../server-src/_lib/doctorai-core.cjs');
const request = { headers: { 'x-forwarded-for': '203.0.113.10' }, socket: {} };

(async () => {
  const first = await core.rateLimit(request, 'test', 2, 60_000);
  const second = await core.rateLimit(request, 'test', 2, 60_000);
  const third = await core.rateLimit(request, 'test', 2, 60_000);
  assert.deepEqual([first.allowed, second.allowed, third.allowed], [true, true, false]);
  assert.equal(third.source, 'durable');
  assert.ok(third.retryAfter >= 1 && third.retryAfter <= 60);
  assert.equal(core.validHealthState({ medications: [], appointments: [], timeline: [], documents: [], measurements: [], tasks: [], memoryDetails: [] }), true);
  assert.equal(core.validHealthState({ timeline: [{ id: 'symptom-test', type: 'symptom', source: 'symptom-diary', date: '2026-09-08', title: 'Symptom recorded', description: 'Intensity 5/10', severity: 5, status: 'ongoing' }] }), true, 'Symptom Diary entries must sync through the canonical timeline store.');
  assert.equal(core.validHealthState({ timeline: [], symptoms: [] }), false, 'A second symptom store would break compatibility with existing clients.');
  assert.equal(core.validHealthState({ medications: [], unexpected: 'no' }), false);
  assert.equal(core.googleClientId(), process.env.AUTH_GOOGLE_ID, 'The browser and token verifier must receive the same authoritative Google client ID.');

  process.env.VERCEL_ENV = 'preview';
  process.env.DOCTORAI_TEST_KV_REST_API_URL = '';
  process.env.DOCTORAI_TEST_KV_REST_API_TOKEN = '';
  process.env.DOCTORAI_TEST_BLOB_READ_WRITE_TOKEN = '';
  assert.equal(core.storageConfigured(), false, 'Preview must not fall back to Production KV credentials.');
  assert.equal(core.documentStorageConfigured(), false, 'Preview must not fall back to the Production Blob token.');
  let previewFetches = 0;
  global.fetch = async (url, options = {}) => {
    previewFetches += 1;
    assert.ok(String(url).startsWith('https://preview-kv.example.invalid/hget/'), 'Preview reads must use the isolated test KV URL.');
    assert.equal(options.headers.authorization, 'Bearer preview-test-token', 'Preview reads must use the test KV token.');
    return { ok: true, json: async () => ({ result: null }) };
  };
  const sampleAccount = { sub: 'preview-test-user', email: 'preview@example.invalid' };
  assert.equal(await core.readHealthState(sampleAccount), null);
  assert.equal(previewFetches, 0, 'Preview without test storage must fail closed before network access.');
  process.env.DOCTORAI_TEST_KV_REST_API_URL = 'https://preview-kv.example.invalid';
  process.env.DOCTORAI_TEST_KV_REST_API_TOKEN = 'preview-test-token';
  process.env.DOCTORAI_TEST_BLOB_READ_WRITE_TOKEN = 'preview-blob-test-token';
  assert.equal(core.storageConfigured(), true);
  assert.equal(core.documentStorageConfigured(), true);
  assert.equal(core.documentStorageToken(), 'preview-blob-test-token');
  assert.equal(await core.readHealthState(sampleAccount), null);
  assert.equal(previewFetches, 1);
  process.env.VERCEL_ENV = 'production';
  assert.equal(core.documentStorageToken(), 'production-blob-test-token', 'Production must keep its existing Blob token.');
  console.log('Server core verification passed (durable limits, health-state validation and isolated Preview storage).');
})().catch(error => { console.error(error); process.exit(1); });
