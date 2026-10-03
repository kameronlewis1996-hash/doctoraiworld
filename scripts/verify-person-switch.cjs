'use strict';
// Exercise the real hub functions with a delayed target GET and file decoding.
// Browser/transport dependencies are synthetic; no provider or storage is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(process.argv[2] || require.resolve('../health-hub.js'), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const blank = name => ({ profile: { name }, documents: [], timeline: [] });
function harness({ fail = false, dirty = false } = {}) {
  const target = deferred(); const decode = deferred();
  const writes = []; const renders = []; const messages = [];
  const controls = [{ disabled: false }, { disabled: true }];
  const context = vm.createContext({ persistSelfCache() {}, selfRecoveryActive: false, recoveryBeforeState: null, recoveryBaseRevision: null, Headers, URL, console, setTimeout, clearTimeout,
    location: { href: 'http://synthetic.invalid/health-hub', origin: 'http://synthetic.invalid' },
    state: blank('Cedar'), authUser: { accountId: 'synthetic-owner' },
    els: { modal: { open: false }, modalBody: { replaceChildren() {} } },
    managedProfiles: [{ id: 'cedar', name: 'Cedar' }, { id: 'river', name: 'River' }],
    activePersonId: 'cedar', personEpoch: 0, personSwitchBusy: false,
    personManagementBusy: false, personOperations: 0, cloudSyncBusy: false,
    cloudSyncDirty: dirty, cloudSaveFailed: false, cloudSyncEnabled: true,
    cloudSyncTimer: null, cloudSyncRevision: 0, localStateUpdatedAt: 0,
    medicationScanBusy: false, chatBusy: false, medicationAlertTimer: null,
    medicationAlertFingerprint: '', careSummaryDraft: null, documentFilter: 'all', timelineFilter: 'all',
    $$: selector => selector === 'button, input, select, textarea' ? controls : [],
    $: () => ({ setAttribute() {}, removeAttribute() {} }),
    showToast: value => messages.push(value), renderManagedProfiles() {},
    managedReadOnly: () => false, hasProAccess: () => true,
    closeModal() {}, closePrivacy() {}, closeMedicationScanner() {}, closeProfile() {},
    closeMedicationSafetyAlert() {}, clearChat() {}, renderAccountIdentity() {},
    applyCloudState(value) { context.state = structuredClone(value); },
    serialiseHealthState: () => context.state,
    renderAll() { renders.push(structuredClone(context.state)); },
    setSyncStatus() {}, personName: () => context.activePersonId,
    documentDetails: () => ({ category: 'other', type: 'Synthetic' }),
    fileAsDataUrl: () => decode.promise, formatFileSize: () => '1 KB',
    saveState() {}, renderResults() {}, renderDocuments() {}, renderTimeline() {}, renderActivity() {},
    reviewCareSummary() { context.careSummaryDraft = 'wrong-person draft'; },
    window: { clearTimeout, confirm: () => true, fetch: async (url, options) => {
      if (url.startsWith('/api/health/state')) { await target.promise; return { ok: !fail, json: async () => fail ? { error: 'Synthetic load failure' } : { profileId: 'river', state: blank('River') } }; }
      writes.push({ url, person: options.headers.get('x-doctorai-profile') });
      return { ok: true, json: async () => ({ document: { id: 'synthetic-doc' } }) };
    } },
    guardedPersonOperations: { saveCloudState: async () => { context.flushes++; context.cloudSyncDirty = false; return true; } }, flushes: 0
  });
  vm.runInContext(between('  async function fetch(', '  function renderManagedProfiles('), context);
  vm.runInContext(between('  async function switchManagedPerson(', '  function renderAccountIdentity('), context);
  vm.runInContext(between('  async function addDocument(', '  async function deleteDocument('), context);
  vm.runInContext(between('  function handleModalSubmit(', '  function renderLocalMedicationDatabaseResult('), context);
  vm.runInContext('addDocument = protectPersonOperation(addDocument); saveCloudState = protectPersonOperation(guardedPersonOperations.saveCloudState);', context);
  return { context, target, decode, writes, renders, messages, controls };
}
(async () => {
  // Before the fix, decoding begins during the GET; after it resolves, the
  // upload targets River and appends Cedar's file into River's displayed state.
  const h = harness(); const transition = h.context.switchManagedPerson('river');
  const upload = h.context.addDocument({ name: 'cedar-private.txt', size: 10 });
  // A blocked operation resolves immediately. Old code waits for decoding.
  h.target.resolve(); await transition;
  h.decode.resolve('data:text/plain;base64,c3ludGhldGlj'); await upload;
  assert.equal(h.writes.length, 0, 'No upload begun during a switch may reach either person.');
  assert.equal(h.context.state.documents.length, 0);
  assert.equal(h.context.activePersonId, 'river');
  for (const label of ['save', 'scan', 'chat', 'safety']) {
    h.context.personSwitchBusy = true;
    let starts = 0;
    await h.context.protectPersonOperation(async () => { starts++; })(label);
    assert.equal(starts, 0, `${label} must not start during a target GET.`);
  }
  h.context.personSwitchBusy = true;
  const event = { target: { matches: () => true }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
  h.context.handleModalSubmit(event);
  assert.equal(h.context.careSummaryDraft, null, 'Form review/save must not mutate a transitioning person.');
  assert.equal(event.prevented, true);
  h.context.blockPersonTransitionEvent(event);
  assert.equal(event.stopped, true, 'Capture guard stops direct listeners on upload, scan and memory controls.');
  const failing = harness({ fail: true }); const failedSwitch = failing.context.switchManagedPerson('river');
  assert.deepEqual(failing.controls.map(control => control.disabled), [true, true]);
  failing.target.resolve(); await failedSwitch;
  assert.equal(failing.context.activePersonId, 'cedar');
  assert.deepEqual(failing.controls.map(control => control.disabled), [false, true], 'Failure restores each prior control state.');
  assert.equal(failing.context.personSwitchBusy, false);
  const dirty = harness({ dirty: true }); const dirtySwitch = dirty.context.switchManagedPerson('river');
  await Promise.resolve(); dirty.target.resolve(); await dirtySwitch;
  assert.equal(dirty.context.flushes, 1, 'Switch itself must still flush originating unsaved records.');
  assert.equal(dirty.context.activePersonId, 'river');
  const paused = harness({ dirty: true }); paused.context.activePersonId = 'self'; paused.context.selfRecoveryActive = true; paused.context.recoveryBeforeState = blank('Saved self');
  const pausedSwitch = paused.context.switchManagedPerson('river'); paused.target.resolve(); await pausedSwitch;
  assert.equal(paused.context.flushes, 0, 'Switching away from a paused recovery must never upload its unsynced edits.');
  assert.equal(paused.context.activePersonId, 'river');
  assert.equal(paused.context.selfStateSnapshot.profile.name, 'Saved self', 'Self fallback retains the prior account state, not recovered data.');
  for (const [name, end, resultKey] of [['runMedicationSafetyCheck', '  async function runIngredientSafetyCheck(', 'lastMedicationSafetyResult'], ['runIngredientSafetyCheck', '  async function handleClick(', 'lastIngredientSafetyResult']]) {
    const delayed = harness(); const body = deferred(); const headers = deferred();
    const c = delayed.context; c.activePersonId = 'self'; c[resultKey] = null;
    c.state.medications = [{ nzfProductConfirmed: true, nzfProduct: {} }];
    c.validNzmtProduct = () => ({ id: '1234567', ingredientsComplete: true });
    c.medicationSafetyTerms = () => ({ reviewed: { allergies: true, conditions: true, symptoms: true } });
    c.buildDrugBankSafetyPayload = () => ({ medications: [{ ingredientIds: ['DB00001'] }] });
    c.renderMedicationSafetyResult = () => { delayed.renders.push('stale result'); };
    c.window.fetch = async () => { headers.resolve(); return { ok: true, json: () => body.promise }; };
    const output = { textContent: '' }; const consent = { checked: true };
    const button = { closest: () => ({ querySelector: selector => selector.includes('consent') ? consent : output }) };
    vm.runInContext(between(`  async function ${name}(`, end), c);
    const action = c.protectPersonOperation(c[name])(button);
    await headers.promise; await Promise.resolve();
    await c.switchManagedPerson('river');
    assert.equal(c.activePersonId, 'self', 'JSON parsing is part of the originating operation barrier.');
    // Also exercise the post-body context check independently of the barrier,
    // including an account replacement after the headers have arrived.
    c.activePersonId = 'river'; c.personEpoch++; c.authUser = { accountId: 'other-synthetic-account' };
    body.resolve({ oldAllergy: 'Self-only allergy' }); await action;
    assert.equal(c[resultKey], null, 'Late JSON cannot commit another person/account’s global safety result.');
    assert.equal(delayed.renders.length, 0);
  }
  console.log('Person-switch regression passed: delayed target GET blocks upload/save/scan/chat/safety/form events; delayed external-check JSON holds the barrier and rechecks person/account before result commits; failure unlocks controls; originating changes flush. Synthetic dependencies only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
