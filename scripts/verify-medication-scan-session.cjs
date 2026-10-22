'use strict';
// Run the real browser functions with deferred synthetic responses. No network,
// real labels, credentials, camera, or paid provider calls are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../health-hub.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Browser implementation exists: ${start}`);
  return source.slice(from, to);
}
const implementation = [
  section('  function accountSyncScope()', '  function setAccountSyncState('),
  section('  function renderAccountSession(', '  function renderEntitlementStatus('),
  section('  function medicationScannerStatus(', '  async function medicationScanAccess('),
  section('  function setMedicationScanBusy(', '  async function medicationPhotoCaptured('),
  section('  async function openMedicationScanner(', '  function openAppointmentModal(')
].join('\n');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const userA = { sub: 'synthetic-a', email: 'a@example.invalid' };
const userB = { sub: 'synthetic-b', email: 'b@example.invalid' };
const image = 'data:image/png;base64,synthetic-only';
const photo = { name: 'synthetic.png', type: 'image/png', size: 100 };
const success = () => ({ ok: true, status: 200, json: async () => ({ medication: { name: 'Synthetic A label', dose: '10 mg' } }) });
function fixture() {
  const calls = { modals: [], toasts: [], requests: [], stops: 0, timers: new Set(), cameraStates: [] };
  const context = vm.createContext({
    authUser: userA, accountSessionRevision: 1, medicationScanBusy: false,
    medicationScanController: null, medicationScannerActive: false, medicationScannerStream: null,
    medicationAccountDataReady: true, medicationLoginId: '', accountSessionReady: true,
    entitlementReady: true, subscriptionTier: 'pro', MAX_SCAN_DATA_URL: 10000,
    AbortController,
    window: { isSecureContext: true, setTimeout(fn) { calls.timers.add(fn); return fn; } },
    clearTimeout(timer) { calls.timers.delete(timer); },
    document: { getElementById: () => null }, navigator: { mediaDevices: {} },
    els: {
      medicationImageConsent: { checked: true }, medicationCaptureButton: { disabled: false },
      medicationScannerStatus: { textContent: '' },
      medicationScannerModal: { open: false, showModal() { this.open = true; }, close() { this.open = false; } },
      medicationScannerVideo: { srcObject: null, pause() {}, async play() {} }
    },
    $: () => null, $$: () => [],
    showToast: text => calls.toasts.push(text), openMedicationModal: value => calls.modals.push(value),
    clearChat() {}, activateHealthDataOwner: () => true, refreshMedicationCheckContext: async () => {},
    discardPreparationDrafts() {}, renderAll() {}, setAccountSyncState() {}, setAvatar() {},
    loadCloudState: async () => {}, setSyncStatus() {}, deviceStorageStatus: () => '',
    applyBrandTheme() {}, renderEntitlementStatus() {}, medicationScanAccess: async () => true,
    prepareScanImage: async () => image,
    fetch: async (url, options) => { calls.requests.push({ url, options }); return success(); }
  });
  vm.runInContext(implementation, context, { filename: 'actual-health-hub-scan-functions.js' });
  return { context, calls };
}
function switchAccount(context, next = userB) {
  context.accountSessionRevision++;
  context.renderAccountSession(next);
}
async function settleUntil(condition) {
  for (let n = 0; n < 100; n++) { if (condition()) return; await Promise.resolve(); }
  assert.fail('Synthetic asynchronous boundary was not reached');
}

(async () => {
  let checks = 0;
  // Providers may resolve even after an abort, including errors that would
  // otherwise revoke the new user's sign-in or Pro state.
  for (const outcome of ['success', '401', '403', 'network']) {
    for (const next of [null, userB]) {
      const { context, calls } = fixture(), pending = deferred();
      context.fetch = async (url, options) => { calls.requests.push({ url, options }); return pending.promise; };
      const operation = context.submitMedicationScan(image);
      switchAccount(context, next);
      assert.equal(calls.requests[0].options.signal.aborted, true, 'Account change aborts in-flight scan');
      const toastCount = calls.toasts.length;
      if (outcome === 'network') pending.reject(new Error('Synthetic network failure'));
      else pending.resolve(outcome === 'success' ? success() : { ok: false, status: Number(outcome), json: async () => ({ error: 'Synthetic rejection' }) });
      await operation;
      assert.equal(calls.modals.length, 0, `${outcome} cannot open a stale scan modal`);
      assert.equal(calls.toasts.length, toastCount, `${outcome} cannot publish stale status`);
      assert.equal(context.authUser, next, 'Old rejection cannot sign out the new account');
      assert.equal(context.subscriptionTier, 'pro', 'Old rejection cannot downgrade new account');
      assert.equal(context.medicationScanBusy, false, 'Completion releases scan controls');
      assert.equal(context.medicationScanController, null);
      assert.equal(calls.timers.size, 0);
      checks++;
    }
  }
  {
    const { context, calls } = fixture(), body = deferred();
    let readingBody = false;
    context.fetch = async () => ({ ok: true, status: 200, json: () => { readingBody = true; return body.promise; } });
    const operation = context.submitMedicationScan(image);
    await settleUntil(() => readingBody);
    context.accountSessionRevision++; // Same identity, distinct authenticated session.
    body.resolve({ medication: { name: 'Synthetic old-session label' } });
    await operation;
    assert.equal(calls.modals.length, 0, 'Account revision change during body parsing invalidates the scan');
    checks++;
  }
  for (const outcome of ['success', 'error']) {
    const { context, calls } = fixture(), prepared = deferred();
    let preparing = false;
    context.prepareScanImage = () => { preparing = true; return prepared.promise; };
    const operation = context.scanMedicationPhoto(photo);
    await settleUntil(() => preparing);
    switchAccount(context);
    if (outcome === 'success') prepared.resolve(image); else prepared.reject(new Error('Synthetic decode failure'));
    await operation;
    assert.equal(calls.requests.length, 0, 'An image selected by A cannot be uploaded by B after preparation');
    assert.equal(calls.modals.length, 0, 'Stale preparation does not open a modal');
    checks++;
  }
  {
    const { context, calls } = fixture(), pending = deferred();
    context.fetch = async (url, options) => {
      calls.requests.push({ url, options });
      options.signal.addEventListener('abort', () => pending.reject(Object.assign(new Error('Synthetic abort'), { name: 'AbortError' })));
      return pending.promise;
    };
    const operation = context.submitMedicationScan(image);
    switchAccount(context);
    await operation;
    context.fetch = async () => success();
    await context.submitMedicationScan(image);
    assert.equal(calls.modals.length, 1, 'New account can start a fresh scan after abort settles');
    assert.equal(calls.modals[0].__scanned, true);
    checks++;
  }
  {
    const { context, calls } = fixture();
    context.fetch = async () => { throw new Error('Synthetic unavailable'); };
    await context.submitMedicationScan(image);
    assert.equal(calls.modals[0].__scanError, 'Synthetic unavailable', 'Current-account failures retain manual entry');
    context.fetch = async () => success();
    await context.submitMedicationScan(image);
    assert.equal(calls.modals[1].name, 'Synthetic A label', 'Current-account retry retains extracted review');
    checks++;
  }
  for (const stage of ['permission', 'play']) {
    const { context, calls } = fixture(), pending = deferred();
    const stream = { getTracks: () => [{ stop: () => calls.stops++ }] };
    let reached = false;
    context.navigator.mediaDevices.getUserMedia = () => { if (stage === 'permission') reached = true; return stage === 'permission' ? pending.promise : Promise.resolve(stream); };
    context.els.medicationScannerVideo.play = () => { if (stage === 'play') reached = true; return stage === 'play' ? pending.promise : Promise.resolve(); };
    const operation = context.openMedicationScanner();
    await settleUntil(() => reached);
    switchAccount(context);
    // Opening a fresh dialog must not let the old camera request attach to it.
    context.els.medicationScannerModal.showModal();
    pending.resolve(stage === 'permission' ? stream : undefined);
    await operation;
    assert.ok(calls.stops >= 1, 'Late camera stream is stopped');
    assert.equal(context.medicationScannerStream, null);
    assert.equal(context.medicationScannerActive, false);
    assert.equal(context.els.medicationScannerVideo.srcObject, null);
    checks++;
  }
  {
    const { context, calls } = fixture(), pending = deferred();
    const stream = { getTracks: () => [{ stop: () => calls.stops++ }] };
    let playing = false;
    context.navigator.mediaDevices.getUserMedia = async () => stream;
    context.els.medicationScannerVideo.play = () => { playing = true; return pending.promise; };
    const operation = context.openMedicationScanner();
    await settleUntil(() => playing);
    context.accountSessionRevision++;
    pending.reject(new Error('Synthetic playback interruption'));
    await operation;
    assert.equal(calls.stops, 1, 'Stale playback failure stops its own stream');
    assert.equal(context.medicationScannerStream, null);
    assert.equal(context.els.medicationScannerVideo.srcObject, null);
    checks++;
  }
  {
    const { context, calls } = fixture(), pending = deferred();
    let requesting = false;
    context.navigator.mediaDevices.getUserMedia = () => { requesting = true; return pending.promise; };
    const operation = context.openMedicationScanner();
    await settleUntil(() => requesting);
    switchAccount(context);
    let newStops = 0;
    const newStream = { getTracks: () => [{ stop: () => newStops++ }] };
    context.medicationScannerStream = newStream;
    context.medicationScannerActive = true;
    context.els.medicationScannerVideo.srcObject = newStream;
    context.els.medicationScannerStatus.textContent = 'New account camera ready';
    pending.reject(new Error('Synthetic old permission rejection'));
    await operation;
    assert.equal(newStops, 0, 'An old camera failure cannot stop the new account camera');
    assert.equal(context.medicationScannerStream, newStream);
    assert.equal(context.els.medicationScannerStatus.textContent, 'New account camera ready');
    checks++;
  }
  console.log(`Medication scan session regression passed: ${checks} synthetic race, cancellation and retry cases.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
