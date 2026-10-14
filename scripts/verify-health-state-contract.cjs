'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Only synthetic records and an in-memory service stand-in are used below.
global.fetch = async () => { throw new Error('Health-state contract checks must not access the network.'); };
const core = require('../server-src/_lib/doctorai-core.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const clientSource = fs.readFileSync(path.join(__dirname, '../health-hub.js'), 'utf8');
const cloneSource = clientSource.match(/^  const clone = value => JSON\.parse\(JSON\.stringify\(value\)\);\r?$/m)?.[0];
const serialiseSource = clientSource.match(/^  const serialiseHealthState = \(\) => \(\{[\s\S]*?^  \}\);/m)?.[0];
assert.ok(cloneSource && serialiseSource, 'The actual browser clone and health-state serializer must be available.');
const serialiseScript = new vm.Script(`${cloneSource}\n${serialiseSource}\nserialiseHealthState();`, { filename: 'health-hub.js:serialiseHealthState' });

function browserPayload(state) {
  const original = copy(state);
  const result = serialiseScript.runInNewContext({ state });
  assert.deepEqual(state, original, 'Serialization must not mutate the saved browser records.');
  assert.notStrictEqual(result.providers, state.providers, 'Provider records must be copied into the outgoing state.');
  return copy(result); // The actual serializer's output after JSON transport.
}

const firstAccount = { sub: 'synthetic-health-account-a', email: 'account-a@example.invalid' };
const secondAccount = { sub: 'synthetic-health-account-b', email: 'account-b@example.invalid' };
let account = firstAccount;
let storageAvailable = true;
let rateAllowed = true;
let storageFailure = '';
const records = new Map();
let calls = [];
const serviceCore = {
  ...core,
  identityFromRequest: async () => { calls.push('identity'); return account; },
  storageConfigured: () => { calls.push('storage'); return storageAvailable; },
  rateLimit: async (request, key, limit, window) => {
    calls.push('rate');
    assert.equal(key, `health-state:${core.accountKey(account)}`);
    assert.equal(limit, 90);
    assert.equal(window, 60_000);
    return { allowed: rateAllowed, retryAfter: 7 };
  },
  saveHealthState: async (owner, state) => {
    calls.push('write');
    if (storageFailure === 'write') throw new Error('Synthetic write failure');
    records.set(core.accountKey(owner), { state: copy(state), updatedAt: 123456789 });
    return true;
  },
  readHealthState: async owner => {
    calls.push('read');
    if (storageFailure === 'read') throw new Error('Synthetic read failure');
    const record = records.get(core.accountKey(owner));
    return record ? copy(record) : null;
  }
};
assert.equal(serviceCore.validHealthState, core.validHealthState, 'The API must use the real health-state validator.');
const handlerModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/health/state.js'), 'utf8'), {
  module: handlerModule,
  require: name => {
    assert.equal(name, '../../server-src/_lib/doctorai-core.cjs', 'Only the handler service dependency may be supplied.');
    return serviceCore;
  },
  Date
}, { filename: 'api/health/state.js' });
const handler = handlerModule.exports;

async function invoke(method, body) {
  calls = [];
  const response = {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = copy(value); return this; }
  };
  await handler({ method, body, headers: {} }, response);
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0', 'Health responses must remain private and uncacheable.');
  return response;
}

function emptyBrowserState() {
  return {
    medications: [], appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [],
    profile: { name: '', bloodType: '', allergies: '', conditions: '', notes: '' },
    memoryEnabled: false, memoryDetails: []
  };
}

(async () => {
  const empty = browserPayload(emptyBrowserState());
  assert.deepEqual(empty.providers, [], 'The actual browser always includes providers, even when empty.');
  let response = await invoke('PUT', { state: empty });
  assert.equal(response.statusCode, 200, 'The actual empty browser payload must be accepted.');
  assert.deepEqual(records.get(core.accountKey(account)).state, empty);
  assert.equal(calls.filter(call => call === 'write').length, 1);

  const populatedState = emptyBrowserState();
  populatedState.providers.push({ id: 'provider-synthetic', name: 'Dr Synthetic', practice: 'Example clinic', phone: 'not-a-real-number', email: 'doctor@example.invalid', address: 'Synthetic address', notes: 'Bring the selected visit brief.' });
  populatedState.timeline.push({ id: 'symptom-synthetic', type: 'symptom', name: 'Synthetic observation', date: '2026-10-10', severity: 3, notes: 'Fictional regression record.' });
  populatedState.profile.notes = 'Synthetic account notes.';
  const populated = browserPayload(populatedState);
  response = await invoke('PUT', JSON.stringify({ state: populated }));
  assert.equal(response.statusCode, 200, 'Providers and other saved records must pass together through JSON transport.');
  response = await invoke('GET');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.configured, true);
  assert.equal(response.body.updatedAt, 123456789);
  assert.deepEqual(response.body.state, populated, 'GET must return the complete state saved by the actual browser serializer.');
  assert.deepEqual(calls, ['identity', 'storage', 'rate', 'read']);

  const legacy = copy(populated);
  delete legacy.providers;
  response = await invoke('PUT', { state: legacy });
  assert.equal(response.statusCode, 200, 'Existing clients and stored records may omit providers.');
  response = await invoke('GET');
  assert.deepEqual(response.body.state, legacy, 'Legacy records must roundtrip without an implicit migration.');

  for (const providers of [null, false, 0, '', 'invalid', {}, { 0: populated.providers[0] }, true, 1]) {
    response = await invoke('PUT', { state: { ...empty, providers } });
    assert.equal(response.statusCode, 400, `A supplied providers collection must be an array: ${JSON.stringify(providers)}`);
    assert.ok(!calls.includes('write'), 'Malformed provider payloads must not reach storage.');
  }
  for (const invalid of [{ ...empty, unexpected: [] }, { ...empty, profile: { notes: 'x'.repeat(240001) } }]) {
    response = await invoke('PUT', { state: invalid });
    assert.equal(response.statusCode, 400, 'Unknown keys and oversized state must remain rejected.');
    assert.ok(!calls.includes('write'));
  }
  response = await invoke('PUT', '{invalid json');
  assert.equal(response.statusCode, 400);
  assert.ok(!calls.includes('write'));
  assert.deepEqual(records.get(core.accountKey(account)).state, legacy, 'Rejected updates must preserve the last accepted state.');

  account = null;
  for (const method of ['GET', 'PUT']) {
    response = await invoke(method, { state: empty });
    assert.equal(response.statusCode, 401, 'Authentication must be checked before any storage operation.');
    assert.deepEqual(calls, ['identity']);
  }
  account = firstAccount;
  storageAvailable = false;
  response = await invoke('PUT', { state: empty });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'secure_storage_not_configured');
  assert.deepEqual(calls, ['identity', 'storage'], 'Unconfigured storage must fail before rate-limit or data operations.');
  storageAvailable = true;
  rateAllowed = false;
  response = await invoke('PUT', { state: empty });
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['Retry-After'], '7');
  assert.deepEqual(calls, ['identity', 'storage', 'rate']);
  rateAllowed = true;

  account = secondAccount;
  response = await invoke('GET');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.state, null, 'Another account must not read the first account records.');
  response = await invoke('PUT', { state: empty });
  assert.equal(response.statusCode, 200);
  account = firstAccount;
  response = await invoke('GET');
  assert.deepEqual(response.body.state, legacy, 'Another account update must not overwrite the original records.');

  for (const [failure, method] of [['read', 'GET'], ['write', 'PUT']]) {
    storageFailure = failure;
    response = await invoke(method, { state: empty });
    assert.equal(response.statusCode, 503, 'Storage failures must remain failures instead of successful saves or empty data.');
  }
  storageFailure = '';
  response = await invoke('POST', { state: empty });
  assert.equal(response.statusCode, 405);
  assert.ok(!calls.includes('write') && !calls.includes('read'));

  console.log('Health-state contract verification passed (actual browser serializer, API and validator; synthetic providers, legacy data, roundtrips, rejection and account/storage guards).');
})().catch(error => { console.error(error); process.exit(1); });
