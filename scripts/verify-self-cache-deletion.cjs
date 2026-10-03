'use strict';
// Future explicitly-confirmed deletion behavior, synthetic storage/users only.
// Runs real cache helpers and the actual hub deletion/load/recovery functions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../self-cache.js');
const source = fs.readFileSync('health-hub.js', 'utf8');
const ownerA = 'A'.repeat(43), ownerB = 'B'.repeat(43), revision = 'R'.repeat(43);
const personState = name => ({ medications: [{ id: name, name: name + ' medicine' }], appointments: [], providers: [], documents: [], timeline: [], measurements: [], tasks: [], profile: { notes: name + ' note' }, memoryEnabled: true, memoryDetails: [name + ' memory'] });
function between(start, end) { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness({ confirm = true, serverFailure = false, removalFailure = false, managed = false } = {}) {
  const entries = new Map([['doctorai-health-hub-profile', ' { "notes": "Unknown legacy must survive" } '], ['doctorai-health-hub-device-storage-consent', 'session']]); const writes = [], removals = [], requests = [], notices = [];
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { writes.push(key); entries.set(key, value); }, removeItem: key => { removals.push(key); if (removalFailure && key.endsWith(':recovery')) throw new Error('Synthetic removal blocked'); entries.delete(key); } };
  const cache = api.create(storage);
  for (const owner of [ownerA, ownerB]) { const label = owner === ownerA ? 'A' : 'B'; cache.write(owner, personState(label), { revision }); cache.write(owner, personState(label + ' recovery'), { kind: 'recovery', revision, beforeState: personState(label + ' before') }); cache.preserve(owner, { ownerId: owner, profileId: 'self', state: personState(label + ' preserved'), revision }); }
  writes.length = 0; const original = new Map(entries);
  const c = vm.createContext({ localStorage: storage, window: { DoctorAISelfCache: api, confirm: text => { notices.push(text); return confirm; }, clearTimeout() {} }, authUser: { accountId: ownerA, name: 'Synthetic A' }, currentSelfOwner: ownerA, activePersonId: managed ? 'managed-synthetic' : 'self', selfRecoveryActive: false, selfCloudReady: true,
    state: personState(managed ? 'Managed' : 'A'), emptyProfile: { name: '', allergies: '', notes: '' }, serialiseHealthState: () => JSON.parse(JSON.stringify(c.state)), applyCloudState(value) { c.state = JSON.parse(JSON.stringify(value)); }, clone: value => JSON.parse(JSON.stringify(value)),
    localStorageAllowed: false, deviceStorageChoice: 'session', cacheWritesBlocked: false, cacheLocalDirty: false, recoveryBeforeState: personState('A before'), recoveryBaseRevision: revision, cloudRecordRevision: revision, selfStateSnapshot: personState('A fallback'), selfCacheCandidate: { ownerId: ownerA, profileId: 'self', state: personState('A pending'), revision, dirty: true }, pendingCacheRecoveryReview: { ownerId: ownerA }, guestRecoveryState: personState('Unlinked guest'),
    selfSessionStates: new Map([[ownerA, { state: personState('A session'), revision }], [ownerB, { state: personState('B session'), revision }]]), preservedSelfSessionCopies: new Map([[ownerA, [{ ownerId: ownerA, profileId: 'self', state: personState('A memory copy'), revision }]], [ownerB, [{ ownerId: ownerB, profileId: 'self', state: personState('B memory copy'), revision }]]]), recoverySessionDrafts: new Map([[ownerA, { state: personState('A RAM recovery'), beforeState: personState('A before'), revision, pendingRecovery: true }], [ownerB, { state: personState('B RAM recovery'), beforeState: personState('B before'), revision, pendingRecovery: true }]]),
    cloudLoadEpoch: 0, personEpoch: 1, cloudSyncBusy: false, cloudSyncEnabled: true, cloudSyncDirty: false, cloudSaveFailed: false, cloudSyncRevision: 0, cloudSyncTimer: null, localStateUpdatedAt: 100, careSummaryDraft: 'Old self care summary',
    personName: () => managed ? 'Managed synthetic' : 'Myself', capturePersonContext: () => c.currentSelfOwner, personContextIsCurrent: owner => owner === c.currentSelfOwner,
    clearChat() {}, closeModal() { c.pendingCacheRecoveryReview = null; }, closeMedicationScanner() {}, closePrivacy() {}, renderAll() {}, renderCacheRecovery() {}, showToast(value) { c.toast = value; }, setSyncStatus(value) { c.syncStatus = value; },
    fetch: async (url, options = {}) => { requests.push({ url, method: options.method || 'GET' }); return { ok: !serverFailure, status: serverFailure ? 503 : 200, json: async () => url === '/api/documents' ? { documents: [] } : { state: null, revision: null } }; } });
  vm.runInContext(between('  const selfCache = ', '  const clone = value =>'), c);
  vm.runInContext(between('  function recoveryDraft(', '  function renderCacheRecovery('), c);
  vm.runInContext(between('  async function deleteHealthData(', '  function handleModalSubmit('), c);
  vm.runInContext(between('  async function loadCloudState(', '  function updateDate('), c);
  return { c, cache, entries, original, writes, removals, requests, notices };
}
(async () => {
  const h = harness(); await h.c.deleteHealthData();
  assert.ok(h.notices[0].includes('self browser cache, preserved copies and recovery drafts'));
  assert.ok(h.notices[0].includes('Other accounts and unlinked legacy/session copies are kept'));
  for (const kind of ['record', 'recovery', 'preserved']) assert.equal(h.entries.has(`doctorai-health-hub-self-v2:${ownerA}:${kind}`), false);
  assert.deepEqual(h.removals.sort(), ['record', 'recovery', 'preserved'].map(kind => `doctorai-health-hub-self-v2:${ownerA}:${kind}`).sort(), 'Only current owner fixed cache keys are removed.');
  for (const [key, bytes] of h.original) if (!key.startsWith(`doctorai-health-hub-self-v2:${ownerA}:`)) assert.equal(h.entries.get(key), bytes, 'Other owner, legacy and preference bytes remain unchanged.');
  assert.equal(h.writes.length, 0, 'Confirmed deletion does not recreate a canonical health cache.');
  assert.equal(h.c.selfSessionStates.has(ownerA), false);
  assert.equal(h.c.preservedSelfSessionCopies.has(ownerA), false);
  assert.equal(h.c.recoverySessionDrafts.has(ownerA), false);
  assert.equal(h.c.selfSessionStates.get(ownerB).state.profile.notes, 'B session note');
  assert.equal(h.c.recoverySessionDrafts.get(ownerB).state.profile.notes, 'B RAM recovery note');
  assert.equal(h.c.selfCacheCandidate, null); assert.equal(h.c.selfStateSnapshot, null); assert.equal(h.c.pendingCacheRecoveryReview, null);
  assert.equal(h.c.recoveryBeforeState, null); assert.equal(h.c.recoveryBaseRevision, null);
  assert.equal(h.c.recoverySource('draft'), null, 'Deleted self recovery cannot be exported or continued.');
  assert.equal(h.c.recoverySource('device:0'), null, 'Deleted self preserved copy cannot be exported/recovered.');
  assert.equal(h.c.preservedSelfCopies(ownerA).length, 0);
  assert.equal(api.create({ getItem: key => h.entries.get(key) ?? null }).read(ownerA), null, 'A reload has no deleted self cache to hydrate.');
  assert.equal(h.c.state.medications.length, 0); assert.equal(h.c.state.profile.notes, ''); assert.equal(h.c.careSummaryDraft, null);
  assert.ok(h.c.toast.includes('caches and recovery drafts deleted'));
  assert.equal(h.c.recoverySource('legacy').state.profile.notes, 'Unknown legacy must survive');
  assert.equal(h.c.recoverySource('guest').state.profile.notes, 'Unlinked guest note', 'Unknown-origin guest source is not silently assigned to/deleted with A.');

  const staleOwner = harness(); staleOwner.c.currentSelfOwner = ownerB; await staleOwner.c.deleteHealthData();
  assert.equal(staleOwner.requests.length, 0); assert.equal(staleOwner.removals.length, 0); assert.equal(staleOwner.c.state.profile.notes, 'A note', 'Unverified owner mismatch cannot target deletion.');

  const cancel = harness({ confirm: false }); await cancel.c.deleteHealthData();
  assert.equal(cancel.requests.length, 0); assert.equal(cancel.removals.length, 0); assert.equal(cancel.c.state.profile.notes, 'A note');
  const remoteFailure = harness({ serverFailure: true }); await remoteFailure.c.deleteHealthData();
  assert.equal(remoteFailure.removals.length, 0); assert.equal(remoteFailure.c.recoverySource('draft').state.profile.notes, 'A RAM recovery note');
  assert.equal(remoteFailure.c.state.profile.notes, 'A note'); assert.ok(remoteFailure.c.syncStatus.includes('incomplete'));
  const partial = harness({ removalFailure: true }); await partial.c.deleteHealthData();
  assert.ok(partial.c.syncStatus.includes('device cleanup incomplete'));
  assert.ok(partial.c.toast.includes('Deletion is incomplete'));
  assert.equal(partial.c.cloudSyncEnabled, false); assert.equal(partial.c.cacheWritesBlocked, true);
  assert.equal(partial.entries.get(`doctorai-health-hub-self-v2:${ownerA}:recovery`), partial.original.get(`doctorai-health-hub-self-v2:${ownerA}:recovery`));
  assert.equal(partial.c.preservedSelfSessionCopies.has(ownerA), false);

  const managed = harness({ managed: true }); await managed.c.deleteHealthData();
  assert.equal(managed.removals.length, 0, 'Managed-person deletion never clears self/other-owner caches.');
  assert.equal(managed.c.recoverySessionDrafts.get(ownerA).state.profile.notes, 'A RAM recovery note');
  for (const [key, bytes] of managed.original) assert.equal(managed.entries.get(key), bytes);
  assert.equal(h.cache.clearOwner('../crafted-owner'), false); assert.equal(h.removals.length, 3, 'Crafted owner cannot enumerate or delete storage.');

  // A pre-deletion GET resolving after deletion must not recreate a backup or
  // repopulate UI even when its JSON still contains the deleted health record.
  const late = harness(); const body = deferred(); const originalFetch = late.c.fetch;
  late.c.selfCacheCandidate = null;
  late.c.fetch = async (url, options = {}) => url === '/api/health/state' && !options.method ? { ok: true, json: () => body.promise } : originalFetch(url, options);
  const loading = late.c.loadCloudState(); await Promise.resolve(); await late.c.deleteHealthData();
  body.resolve({ state: personState('Deleted stale GET'), revision, updatedAt: 300 }); await loading;
  assert.equal(late.c.state.medications.length, 0); assert.equal(late.c.preservedSelfCopies(ownerA).length, 0); assert.equal(late.c.recoverySource('draft'), null);
  assert.equal(late.writes.length, 0, 'Late JSON cannot recreate the removed owner cache.');
  console.log('Self-cache deletion regression passed: explicitly confirmed future self deletion clears only current-owner record/preserved/recovery keys and RAM copies/drafts/candidates; exports/reload/late GET cannot resurrect completed deletion; other owners/unlinked bytes remain exact; Cancel/server failure retain data; partial local removal reports incomplete cleanup and pauses writes; managed deletion preserves self caches. Synthetic users/storage only, no live deletion.');
})().catch(error => { console.error(error); process.exitCode = 1; });
