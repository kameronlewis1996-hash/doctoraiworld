'use strict';

const assert = require('node:assert/strict');

process.env.AUTH_SECRET = 'test-only-secret-with-sufficient-length';
process.env.KV_REST_API_URL = 'https://example.invalid';
process.env.KV_REST_API_TOKEN = 'test-only-token';
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
  assert.equal(core.validHealthState({ providers: [{ id: 'provider-test', name: 'Synthetic GP' }] }), true, 'Client care providers must sync.');
  assert.equal(core.validHealthState({ providers: 'invalid' }), false);
  assert.equal(core.validHealthState({ medications: [], unexpected: 'no' }), false);
  assert.equal(core.googleClientId(), process.env.AUTH_GOOGLE_ID, 'The browser and token verifier must receive the same authoritative Google client ID.');
  console.log('Server core verification passed (durable limits and health-state validation).');
})().catch(error => { console.error(error); process.exit(1); });
