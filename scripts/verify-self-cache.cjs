'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../self-cache.js');
const source = fs.readFileSync('health-hub.js', 'utf8');
const between = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); };
const ownerA = 'A'.repeat(43), ownerB = 'B'.repeat(43), revision = 'R'.repeat(43);
const state = name => ({ medications: [{ id: name, name: name + ' medicine' }], appointments: [], providers: [], documents: [], timeline: [], measurements: [], tasks: [], profile: { notes: name + ' note', allergies: name + ' allergy' }, memoryEnabled: true, memoryDetails: [name + ' memory'] });
const entries = new Map([['doctorai-health-hub-device-storage-consent', 'yes'], ['doctorai-health-hub-medications', ' [ { "name": "Unknown A medicine" } ] '], ['doctorai-health-hub-profile', '{ "notes": "Unknown A note" }'], ['doctorai-health-hub-updated-at', '9999999999999']]);
const original = new Map(entries); let deletions = 0;
const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: () => { deletions++; throw new Error('Deletion forbidden'); } };
const cache = api.create(storage);
assert.equal(cache.legacy().rawEntries['doctorai-health-hub-medications'], original.get('doctorai-health-hub-medications'));
assert.equal(cache.read(ownerA), null);
assert.equal(cache.write('', state('Guest')), false);
assert.equal(cache.write(ownerA, state('A'), { revision, dirty: true }), true);
const aBytes = entries.get(`doctorai-health-hub-self-v2:${ownerA}:record`);
assert.equal(cache.read(ownerB), null, 'B cannot load A cache after a full reload.');
assert.equal(cache.write(ownerB, state('B'), { revision: null }), true);
assert.equal(cache.read(ownerA).state.profile.notes, 'A note');
assert.equal(entries.get(`doctorai-health-hub-self-v2:${ownerA}:record`), aBytes);
entries.set(`doctorai-health-hub-self-v2:${ownerB}:record`, aBytes);
assert.equal(cache.read(ownerB), null, 'A record copied into B key fails the owner check.');
assert.equal(cache.preserve(ownerA, cache.read(ownerA)), true);
assert.equal(cache.preserved(ownerB).length, 0);
assert.equal(cache.preserved(ownerA).length, 1);
assert.equal(cache.preserve(ownerA, cache.read(ownerA)), true);
assert.equal(cache.preserved(ownerA).length, 1, 'Repeated preservation is idempotent.');
for (const [key, bytes] of original) assert.equal(entries.get(key), bytes, 'Legacy bytes remain unchanged.');
assert.equal(deletions, 0);
assert.equal(api.create({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } }).write(ownerA, state('A')), false);
assert.equal(api.validState({ medications: [null] }), false);
assert.equal(api.validState({ profile: { notes: {} } }), false);
const corruptBackup = '{raw-invalid-prior-backup'; entries.set(`doctorai-health-hub-self-v2:${ownerB}:preserved`, corruptBackup);
assert.equal(cache.preserve(ownerB, { ownerId: ownerB, profileId: 'self', state: state('B'), revision }), false);
assert.equal(entries.get(`doctorai-health-hub-self-v2:${ownerB}:preserved`), corruptBackup, 'Invalid earlier backup is never overwritten.');

function storageContext(owner = '') {
  const c = vm.createContext({ localStorage: storage, window: { DoctorAISelfCache: api }, currentSelfOwner: owner, activePersonId: 'self', localStorageAllowed: true, deviceStorageChoice: 'yes', selfRecoveryActive: false, recoveryBaseRevision: null, recoveryBeforeState: null, cacheWritesBlocked: false, cacheLocalDirty: true, recoverySessionDrafts: new Map(), localStateUpdatedAt: 100, cloudRecordRevision: revision, serialiseHealthState: () => state('A'), storagePrefix: 'doctorai-health-hub-' });
  vm.runInContext(between('  const selfCache = ', '  const clone = value =>'), c);
  vm.runInContext('globalThis.read = read; globalThis.write = write;', c);
  return c;
}
const freshA = storageContext();
assert.equal(freshA.read('medications', []).length, 0, 'Startup before auth ignores unknown legacy health data.');
assert.equal(freshA.read('profile', {}).notes, undefined);
freshA.write('updated-at', 100);
assert.equal(entries.get(`doctorai-health-hub-self-v2:${ownerA}:record`), aBytes, 'Unsigned-in write never claims a cache owner.');
freshA.currentSelfOwner = ownerA; freshA.activePersonId = 'person-synthetic'; freshA.write('updated-at', 101);
assert.equal(entries.get(`doctorai-health-hub-self-v2:${ownerA}:record`), aBytes, 'Managed profiles never enter persistent self cache.');

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
(async () => {
  // Actual auth function: newest server response wins, including delayed JSON.
  const first = deferred(), second = deferred(); let calls = 0; const identities = [];
  const auth = vm.createContext({ authRequestEpoch: 0, accountSessionReady: false, fetch: async () => ({ ok: true, json: () => (++calls === 1 ? first.promise : second.promise) }), renderAccountSession: user => identities.push(user?.accountId || null) });
  vm.runInContext(between('  async function loadAccountSession(', '  async function loadEntitlement('), auth);
  const a = auth.loadAccountSession(); await Promise.resolve(); const b = auth.loadAccountSession(); await Promise.resolve();
  second.resolve({ authenticated: true, user: { accountId: ownerB, email: 'same-display@example.invalid' } }); await b;
  first.resolve({ authenticated: true, user: { accountId: ownerA, email: 'same-display@example.invalid' } }); await a;
  assert.deepEqual(identities, [ownerB], 'Late A auth JSON cannot rebind a B cache, even with identical display email.');
  auth.fetch = async () => { throw new Error('Synthetic auth outage'); }; await auth.loadAccountSession();
  assert.deepEqual(identities, [ownerB, null], 'Failed auth resolves to signed-out, not a guessed owner.');

  const post = deferred(); const signInEvents = [];
  const signing = vm.createContext({ authRequestEpoch: 0, personOperations: 0, personSwitchBusy: false, personManagementBusy: false, fetch: async () => ({ ok: true, json: () => post.promise }), renderAccountSession: user => signInEvents.push(user.accountId), closeGoogleSignIn() {}, showToast() {}, setGoogleSigninStatus: value => signInEvents.push(value) });
  vm.runInContext(between('  async function handleGoogleCredential(', '  function openGoogleSignIn('), signing);
  const signIn = signing.handleGoogleCredential({ credential: 'synthetic-only' }); await Promise.resolve(); signing.authRequestEpoch++;
  post.resolve({ user: { accountId: ownerA } }); await signIn;
  assert.equal(signInEvents.length, 0, 'Late sign-in JSON cannot restore a signed-out or replaced account.');
  const badPost = deferred(); signing.fetch = async () => ({ ok: false, status: 401, json: () => badPost.promise });
  const deniedSignIn = signing.handleGoogleCredential({ credential: 'synthetic-only' }); await Promise.resolve(); signing.authRequestEpoch++;
  badPost.resolve({ error: 'Synthetic old failure' }); await deniedSignIn;
  assert.equal(signInEvents.length, 0, 'Late sign-in errors cannot alter the newer account UI.');

  // Actual cloud-load function: a late A response cannot overwrite B UI/cache.
  const late = deferred(); const load = vm.createContext({ cloudLoadEpoch: 0, cloudSyncRevision: 0, authUser: { accountId: ownerA }, cloudSyncEnabled: true, activePersonId: 'self', selfRecoveryActive: false, cacheLocalDirty: false, currentSelfOwner: ownerA, selfCacheCandidate: null,
    capturePersonContext() { return load.currentSelfOwner; }, personContextIsCurrent: owner => owner === load.currentSelfOwner,
    fetch: async () => ({ ok: true, json: () => late.promise }), setSyncStatus() {}, applyCloudState(value) { load.displayed = value; }, persistSelfCache() { throw new Error('Stale callback attempted cache write'); }, renderAll() {}, serialiseHealthState: () => state('B'), displayed: state('B') });
  vm.runInContext(between('  async function loadCloudState(', '  function updateDate('), load);
  const loading = load.loadCloudState(); await Promise.resolve(); load.currentSelfOwner = ownerB; load.authUser = { accountId: ownerB };
  late.resolve({ state: state('A'), revision, updatedAt: 1 }); await loading;
  assert.equal(load.displayed.profile.notes, 'B note');

  const preserved = []; let uploads = 0;
  Object.assign(load, { currentSelfOwner: ownerB, cloudLoadEpoch: 0, selfCacheCandidate: { ownerId: ownerB, profileId: 'self', state: state('B unsynced'), revision, updatedAt: 9999999999999, dirty: true }, cacheLocalDirty: false, selfCache: { preserve(owner, record) { preserved.push(record); return true; } }, persistSelfCache() {}, queueCloudSave() { uploads++; }, fetch: async () => ({ ok: true, json: async () => ({ state: state('B server'), revision: 'S'.repeat(43), updatedAt: 100 }) }) });
  await load.loadCloudState();
  assert.equal(uploads, 0, 'Timestamp-newer owned cache does not auto-upload at boot.');
  assert.equal(load.displayed.profile.notes, 'B server note');
  assert.equal(preserved[0].state.profile.notes, 'B unsynced note');

  // Actual recovery confirmation: owner selection and reviewed checkbox are
  // required; it writes only a paused draft and retains the prior account state.
  const recovery = storageContext(ownerA);
  const canonical = entries.get(`doctorai-health-hub-self-v2:${ownerA}:record`);
  Object.assign(recovery, { authUser: { accountId: ownerA, name: 'Synthetic A' }, selfCloudReady: true, personOperations: 0, personSwitchBusy: false, cloudSyncBusy: false, personEpoch: 1, cloudSyncRevision: 0, cloudSyncTimer: null, cloudSaveFailed: false, cloudSyncDirty: false, recoveryDraft: () => null, clone: value => JSON.parse(JSON.stringify(value)), closeModal() {}, clearChat() {}, applyCloudState(value) { recovery.displayed = value; recovery.serialiseHealthState = () => value; }, renderAll() {}, openPrivacy() {}, setSyncStatus() {}, showToast() {}, window: { DoctorAISelfCache: api, clearTimeout() {} }, pendingCacheRecoveryReview: { ownerId: ownerA, epoch: 1, value: { state: state('Recovered') } } });
  vm.runInContext(between('  function confirmCacheRecovery(', '  async function saveReviewedRecovery('), recovery);
  recovery.confirmCacheRecovery({ elements: { confirmOwnRecords: { checked: false } } });
  assert.equal(recovery.selfRecoveryActive, false);
  recovery.pendingCacheRecoveryReview.ownerId = ownerB;
  recovery.confirmCacheRecovery({ elements: { confirmOwnRecords: { checked: true } } });
  assert.equal(recovery.selfRecoveryActive, false, 'Wrong account cannot accept a recovery reviewed under A.');
  recovery.pendingCacheRecoveryReview.ownerId = ownerA;
  recovery.confirmCacheRecovery({ elements: { confirmOwnRecords: { checked: true } } });
  assert.equal(recovery.selfRecoveryActive, true);
  assert.equal(recovery.cloudSyncDirty, false);
  assert.equal(recovery.displayed.profile.notes, 'Recovered note');
  assert.equal(recovery.displayed.memoryEnabled, false, 'Recovered memory is not sent to AI.');
  assert.equal(cache.read(ownerA, 'recovery').beforeState.profile.notes, 'A note');
  assert.equal(entries.get(`doctorai-health-hub-self-v2:${ownerA}:record`), canonical, 'Recovery does not overwrite canonical cache before explicit save.');
  for (const [key, bytes] of original) assert.equal(entries.get(key), bytes);
  assert.equal(deletions, 0);
  console.log('Self-cache verification passed: blank pre-auth state, account-bound caches, two-account reload boundary, preserved raw legacy bytes/export, no anonymous/managed persistence, forged-owner rejection, storage failure, late auth/health JSON, dirty cache retained without auto-upload, explicit named-account paused recovery. VM UI/storage checks; no live APIs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
