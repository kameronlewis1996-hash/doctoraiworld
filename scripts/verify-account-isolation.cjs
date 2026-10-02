'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
const block = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Expected source block ${startMarker}`);
  return source.slice(start, end);
};

const state = {
  medications: [{ name: 'Synthetic account A medicine' }],
  appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [],
  profile: { name: 'Synthetic account A' }, memoryEnabled: true, memoryDetails: ['synthetic private detail']
};
const stateCheckContext = vm.createContext({});
vm.runInContext(`${block('  const hasHealthState = value => {', '  function applyCloudState')}\nthis.hasHealthState = hasHealthState;`, stateCheckContext);
assert.equal(stateCheckContext.hasHealthState({ profile: { name: '', medicationSafetyTerms: { allergies: [], conditions: [], symptoms: [], unmatched: [], reviewed: {} } } }), false, 'Empty safety-review scaffolding is not health data.');
const resetContext = vm.createContext({
  state,
  emptyProfile: { name: '', bloodType: '', allergies: '', conditions: '', notes: '', medicationSafetyTerms: {} },
  clone: value => JSON.parse(JSON.stringify(value)),
  normaliseMedicationSafetyTerms: value => value,
  clearMedicationSafetyResults() {}
});
vm.runInContext(`${block('  function replaceHealthStateInMemory(', '\n  function loadDeviceHealthState')}\nthis.resetHealthState = replaceHealthStateInMemory;`, resetContext);
resetContext.resetHealthState();
assert.deepEqual(JSON.parse(JSON.stringify(state)), {
  medications: [], appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [],
  profile: { name: '', bloodType: '', allergies: '', conditions: '', notes: '', medicationSafetyTerms: {} }, memoryEnabled: false, memoryDetails: []
}, 'Changing account scope must clear A data from the in-memory account view.');

const accountKeyContext = vm.createContext({
  storagePrefix: 'doctorai-health-hub-', window: { crypto: webcrypto }, TextEncoder
});
vm.runInContext(`${block('  async function accountStatePrefix(', '\n\n  const els =')}\nthis.accountStatePrefix = accountStatePrefix;`, accountKeyContext);
(async () => {
  const namespace = await accountKeyContext.accountStatePrefix({ email: 'person-b@example.test' });
  assert.match(namespace, /^doctorai-health-hub-account-[a-f0-9]{64}-$/);
  assert.equal(namespace.includes('person-b'), false, 'Account storage keys must not expose the email address.');

  const calls = [];
  let queued = 0;
  const cloudContext = vm.createContext({
    authUser: { email: 'person-b@example.test' }, cloudSyncEnabled: true, cloudStateReadyForAccount: false,
    accountScopeRevision: 3, cloudSyncTimer: null, cloudSyncDirty: false,
    window: { clearTimeout() {}, setTimeout() { return 1; } },
    state,
    serialiseHealthState: () => state,
    hasHealthState: stateCheckContext.hasHealthState,
    applyCloudState() {}, write() {}, deviceStorageStatus: () => 'Session only',
    setSyncStatus() {}, queueCloudSave() { queued += 1; },
    fetch: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });
      return { ok: true, json: async () => ({ state: null, updatedAt: null }) };
    }
  });
  vm.runInContext(`${block('  function queueCloudSave() {', '\n  async function saveCloudState()')}\n${block('  async function loadCloudState(', '\n  function updateDate()')}\nthis.runCloudLoad = loadCloudState;`, cloudContext);
  await cloudContext.runCloudLoad(3);
  assert.deepEqual(calls, [{ url: '/api/health/state', method: 'GET' }]);
  assert.equal(queued, 0, 'An empty B cloud record must not queue a PUT from A browser data.');
  assert.equal(cloudContext.cloudStateReadyForAccount, true);

  const session = block('  async function renderAccountSession(user) {', '\n  function renderEntitlementStatus()');
  assert.ok(session.indexOf('replaceHealthStateInMemory();') < session.indexOf('loadCloudState(revision)'), 'The old in-memory account view must be cleared before B cloud loading starts.');
  process.stdout.write('Account isolation verification passed with synthetic A/B state; no account or health API write was made.\n');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
