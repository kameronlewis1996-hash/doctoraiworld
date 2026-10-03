'use strict';
// Execute the actual cache boundary/auth-stage/load/recovery functions. Storage,
// delayed GET and UI dependencies are synthetic; no live API/provider is called.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../self-cache.js');
const source = fs.readFileSync(process.argv[2] || 'health-hub.js', 'utf8');
const ownerA = 'A'.repeat(43), ownerB = 'B'.repeat(43), oldRevision = 'R'.repeat(43), serverRevision = 'S'.repeat(43);
const recordState = name => ({ medications: [], appointments: [], providers: [], documents: [], timeline: [], measurements: [], tasks: [], profile: { notes: name }, memoryEnabled: true, memoryDetails: [name] });
function between(start, end) { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness({ choice = 'session', allow = choice === 'yes', storageFailure = '', memoryFailure = false } = {}) {
  const entries = new Map([['doctorai-health-hub-profile', ' { "notes": "Unknown legacy stays untouched" } ']]);
  const original = entries.get('doctorai-health-hub-profile'); const writes = [];
  const storage = { getItem(key) { if (storageFailure === 'blocked') throw new Error('Storage blocked'); return entries.get(key) ?? null; }, setItem(key, value) { writes.push({ key, value }); if (['quota', 'blocked'].includes(storageFailure)) throw new Error(storageFailure); entries.set(key, value); } };
  const preservedMemory = new Map(); if (memoryFailure) preservedMemory.set = () => { throw new Error('Synthetic unavailable memory backup'); };
  const c = vm.createContext({ localStorage: storage, window: { DoctorAISelfCache: api, clearTimeout() {} }, currentSelfOwner: ownerA, activePersonId: 'self', localStorageAllowed: allow, deviceStorageChoice: choice,
    selfRecoveryActive: false, recoveryBeforeState: null, recoveryBaseRevision: null, cacheWritesBlocked: false, cacheLocalDirty: false, recoverySessionDrafts: new Map(), preservedSelfSessionCopies: preservedMemory, selfSessionStates: new Map(), selfCacheCandidate: null, guestRecoveryState: null,
    localStateUpdatedAt: 100, cloudRecordRevision: oldRevision, storagePrefix: 'doctorai-health-hub-', authUser: { accountId: ownerA, name: 'Synthetic A' }, selfCloudReady: false,
    personEpoch: 1, personOperations: 0, personSwitchBusy: false, personManagementBusy: false, cloudSyncBusy: false, cloudLoadEpoch: 0, cloudSyncRevision: 0, cloudSyncTimer: null, cloudSyncDirty: false, cloudSaveFailed: false, cloudSyncEnabled: true,
    displayed: recordState('Original A'), serialiseHealthState: () => JSON.parse(JSON.stringify(c.displayed)), applyCloudState(value) { c.displayed = JSON.parse(JSON.stringify(value)); }, renderAll() {}, setSyncStatus(value) { c.syncStatus = value; }, showToast(value) { c.toast = value; }, closeModal() { c.closed = true; }, clearChat() {}, closeMedicationScanner() {}, closePrivacy() {}, openPrivacy() {}, clone: value => JSON.parse(JSON.stringify(value)), capturePersonContext: () => c.currentSelfOwner, personContextIsCurrent: owner => owner === c.currentSelfOwner });
  vm.runInContext(between('  const selfCache = ', '  const clone = value =>'), c);
  vm.runInContext('globalThis.write = write;', c);
  vm.runInContext(between('  async function loadCloudState(', '  function updateDate('), c);
  vm.runInContext(between('  function recoveryDraft(', '  function renderCacheRecovery('), c);
  vm.runInContext(between('  function confirmCacheRecovery(', '  async function saveReviewedRecovery('), c);
  return { c, entries, writes, original, preservedMemory };
}
const server = () => ({ state: recordState('Server A'), revision: serverRevision, updatedAt: 200 });
(async () => {
  // Edits made while the real GET/JSON is pending cannot cause opt-out storage.
  for (const choice of ['session', '']) {
    const h = harness({ choice }); const body = deferred(); h.c.fetch = async () => ({ ok: true, json: () => body.promise });
    const loading = h.c.loadCloudState(); await Promise.resolve();
    h.c.displayed = recordState('Edited during GET'); h.c.cacheLocalDirty = true; h.c.cloudSyncRevision++; h.c.cloudSyncDirty = true;
    body.resolve(server()); await loading;
    assert.equal(h.writes.length, 0, 'Session-only/no-choice delayed GET must never attempt persistent health writes.');
    assert.equal(h.c.preservedSelfCopies(ownerA)[0].state.profile.notes, 'Edited during GET');
    assert.equal(h.c.preservedSelfCopies(ownerB).length, 0, 'The fallback is account-bound.');
    assert.equal(h.c.cloudSyncDirty, false, 'Preserved edits are not queued for an automatic upload.');
    assert.equal(h.entries.get('doctorai-health-hub-profile'), h.original);
    assert.equal(h.c.recoverySource('device:0').state.profile.notes, 'Edited during GET', 'The memory copy is reachable by the actual recovery/export source.');
    h.c.displayed.profile.notes = 'Later edit';
    assert.equal(h.c.preservedSelfCopies(ownerA)[0].state.profile.notes, 'Edited during GET', 'Preservation is detached from later live edits.');
  }

  // Exercise the actual account-transition staging before its DOM rendering.
  const session = harness(); session.c.currentSelfOwner = ownerB; session.c.authUser = { accountId: ownerB };
  session.c.selfSessionStates.set(ownerA, { state: recordState('Dirty A in-memory session'), revision: oldRevision, updatedAt: 100, recovery: false });
  const stage = between('  function renderAccountSession(user)', '    const signedIn = Boolean(authUser);');
  vm.runInContext(stage.replace('function renderAccountSession', 'function stageSession') + '\n  }', session.c);
  session.c.stageSession({ accountId: ownerA, name: 'Synthetic A' });
  assert.equal(session.c.selfCacheCandidate.dirty, true);
  session.c.fetch = async () => ({ ok: true, json: async () => server() }); await session.c.loadCloudState();
  assert.equal(session.writes.length, 0, 'Restoring an in-memory account session without consent cannot persist plaintext.');
  assert.equal(session.c.preservedSelfCopies(ownerA)[0].state.profile.notes, 'Dirty A in-memory session');
  assert.equal(session.c.preservedSelfCopies(ownerB).length, 0);

  // Both quota and blocked storage fall back to an exportable memory copy and
  // prevent the canonical device snapshot from being overwritten afterward.
  for (const storageFailure of ['quota', 'blocked', 'corrupt']) {
    const h = harness({ choice: 'yes', storageFailure }); const diskKey = `doctorai-health-hub-self-v2:${ownerA}:record`;
    h.entries.set(diskKey, 'original canonical bytes');
    const backupKey = `doctorai-health-hub-self-v2:${ownerA}:preserved`;
    if (storageFailure === 'corrupt') h.entries.set(backupKey, '{ original malformed backup');
    h.c.displayed = recordState('Unsaved quota/blocked edit'); h.c.cacheLocalDirty = true;
    h.c.fetch = async () => ({ ok: true, json: async () => server() }); await h.c.loadCloudState();
    assert.equal(h.c.preservedSelfCopies(ownerA)[0].state.profile.notes, 'Unsaved quota/blocked edit');
    assert.equal(h.c.recoverySource('device:0').state.profile.notes, 'Unsaved quota/blocked edit');
    assert.equal(h.c.cacheWritesBlocked, true);
    assert.ok(h.c.syncStatus.includes('Device backup unavailable'), 'Failed durable backup is explicitly reported.');
    assert.ok(!h.c.syncStatus.includes('preserved'), 'Failed durable preservation must not announce success.');
    if (storageFailure === 'corrupt') assert.equal(h.entries.get(backupKey), '{ original malformed backup');
    assert.equal(h.entries.get(diskKey), 'original canonical bytes');
    assert.equal(h.entries.get('doctorai-health-hub-profile'), h.original);
  }

  // If neither memory nor durable storage can preserve a copy, the live edits,
  // candidate and original revision remain. Server state cannot replace them.
  const failure = harness({ choice: 'yes', storageFailure: 'quota', memoryFailure: true });
  failure.c.displayed = recordState('Current edits must stay'); failure.c.cacheLocalDirty = true;
  failure.c.fetch = async () => ({ ok: true, json: async () => server() }); await failure.c.loadCloudState();
  assert.equal(failure.c.displayed.profile.notes, 'Current edits must stay');
  assert.equal(failure.c.selfCacheCandidate.state.profile.notes, 'Current edits must stay');
  assert.equal(failure.c.cloudRecordRevision, oldRevision, 'Failed preservation cannot silently rebase unsaved edits.');
  assert.equal(failure.c.selfCloudReady, false, 'Automatic writes remain blocked until safe preservation/review.');
  assert.equal(failure.c.cacheLocalDirty, true);

  // Session-only recovery must preserve the prior draft only in owner memory;
  // further manual edits update that draft in memory without any disk attempt.
  const reviewed = { elements: { confirmOwnRecords: { checked: true } } };
  for (const choice of ['session', '']) {
    const h = harness({ choice }); h.c.selfCloudReady = true;
    h.c.recoverySessionDrafts.set(ownerA, { state: recordState('Prior recovery draft'), beforeState: recordState('Prior account snapshot'), revision: oldRevision, pendingRecovery: true });
    h.c.pendingCacheRecoveryReview = { ownerId: ownerA, epoch: 1, value: { state: recordState('New reviewed recovery') } };
    h.c.confirmCacheRecovery(reviewed);
    assert.equal(h.writes.length, 0, 'Recovery confirmation without device consent makes no plaintext persistent write.');
    assert.equal(h.c.preservedSelfCopies(ownerA)[0].state.profile.notes, 'Prior recovery draft');
    assert.equal(h.c.recoveryDraft().state.profile.notes, 'New reviewed recovery');
    assert.equal(h.c.selfRecoveryActive, true);
    assert.ok(h.c.syncStatus.includes('Session recovery draft'));
    assert.ok(h.c.toast.includes('only in this session'));
    h.c.displayed.profile.notes = 'Session-only draft manual edit'; h.c.write('updated-at', 300);
    assert.equal(h.c.recoveryDraft().state.profile.notes, 'Session-only draft manual edit', 'Session-only draft export includes the latest manual edits.');
    assert.equal(h.writes.length, 0);
    assert.equal(h.c.preservedSelfCopies(ownerB).length, 0);
  }
  const recoveryFailure = harness({ choice: 'yes', storageFailure: 'blocked', memoryFailure: true });
  recoveryFailure.c.selfCloudReady = true; recoveryFailure.c.selfRecoveryActive = true; recoveryFailure.c.recoveryBaseRevision = oldRevision; recoveryFailure.c.recoveryBeforeState = recordState('Prior account'); recoveryFailure.c.displayed = recordState('Keep current draft edits');
  const prior = { state: recordState('Prior recovery'), beforeState: recordState('Prior account'), revision: oldRevision, pendingRecovery: true };
  recoveryFailure.c.recoverySessionDrafts.set(ownerA, prior); recoveryFailure.c.pendingCacheRecoveryReview = { ownerId: ownerA, epoch: 1, value: { state: recordState('Rejected replacement') } };
  recoveryFailure.c.confirmCacheRecovery(reviewed);
  assert.equal(recoveryFailure.c.displayed.profile.notes, 'Keep current draft edits');
  assert.equal(recoveryFailure.c.recoveryDraft().state.profile.notes, 'Keep current draft edits', 'Live draft export retains the newest edits even if the stored draft lags.');
  assert.equal(recoveryFailure.c.recoverySessionDrafts.get(ownerA).state.profile.notes, 'Prior recovery', 'Failed replacement leaves the earlier stored draft intact.');
  assert.equal(recoveryFailure.c.closed, undefined, 'Failed preservation leaves the review open and current draft unchanged.');

  const optIn = harness({ choice: 'yes' }); const result = optIn.c.preserveSelfCopy(ownerA, { ownerId: ownerA, profileId: 'self', state: recordState('Explicit device copy'), revision: oldRevision });
  assert.equal(result.durable, true); assert.equal(optIn.writes.length, 1);
  const inconsistent = harness({ choice: '', allow: true });
  inconsistent.c.preserveSelfCopy(ownerA, { ownerId: ownerA, profileId: 'self', state: recordState('No explicit choice'), revision: oldRevision });
  inconsistent.c.persistSelfCache();
  assert.equal(inconsistent.writes.length, 0, 'A boolean flag alone cannot bypass the explicit yes choice.');
  console.log('Self-cache consent regression passed: delayed GET/session restoration and recovery without consent make zero persistent health writes; owner-bound memory fallback/export, detached copies, quota/blocked storage retention, total-preservation failure keeps live/draft edits and revision, latest session-only draft edits, explicit opt-in only. Actual functions with synthetic dependencies; no live APIs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
