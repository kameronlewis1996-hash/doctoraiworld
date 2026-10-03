'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('health-hub.js', 'utf8');
const between = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); if (a < 0 || b < 0) throw new Error('UI fixture boundaries missing'); return source.slice(a, b); };
const notices = []; let confirm = false; let requests = 0;
const context = vm.createContext({ activePersonId: 'river', personName: () => 'River', window: { confirm: text => { notices.push(text); return confirm; } },
  capturePersonContext: () => ({}), hasProAccess: () => true, managedReadOnly: () => false, managedAiUnavailable: () => false, unavailableAiMessage: () => 'Child AI is unavailable', selfRecoveryActive: false, activePersonId: 'river', chatBusy: false, medicationScanBusy: false, MAX_SCAN_DATA_URL: 1000,
  authUser: { name: 'Synthetic owner' }, showToast() {}, fetch: async () => { requests++; throw new Error('No request should be sent after declining.'); },
  els: { chatInput: { value: 'Synthetic question' } }, $: () => ({ classList: { remove() {} } }) });
vm.runInContext(between('  function confirmManagedTransmission(', '  async function submitPersonForm('), context);
vm.runInContext(between('  async function sendChat(', '  async function copyChatAnswer('), context);
vm.runInContext(between('  async function submitMedicationScan(', '  async function medicationBarcodeDetected('), context);
vm.runInContext(between('  async function loadTodayIntelligence(', '  function normalizeMedicationKey('), context);
(async () => {
  await context.sendChat();
  await context.submitMedicationScan('data:image/png;base64,synthetic');
  await context.loadTodayIntelligence([], []);
  assert.equal(requests, 0, 'Declining chat/scan/briefing disclosure sends nothing.');
  assert.equal(notices.length, 3);
  for (const notice of notices) { assert.match(notice, /River/); assert.match(notice, /OpenAI/); assert.match(notice, /wishes and ability to take part/); }
  confirm = true;
  assert.equal(context.confirmManagedTransmission('chat'), true);
  assert.equal(context.confirmManagedTransmission('chat'), true);
  assert.equal(notices.length, 5, 'Every action asks again; consent is never stored or reused.');
  context.activePersonId = 'self';
  assert.equal(context.confirmManagedTransmission('scan'), true);
  assert.equal(notices.length, 5, 'Self retains its existing consent flow.');
  context.activePersonId = 'river'; context.managedAiUnavailable = () => true;
  await context.sendChat(); await context.submitMedicationScan('data:image/png;base64,synthetic'); await context.loadTodayIntelligence([], []);
  assert.equal(requests, 0, 'Child chat/OCR/briefings remain blocked even through direct function calls.');
  assert.equal(notices.length, 5, 'Child AI never reaches an activation consent prompt.');

  let release; const pending = new Promise(resolve => { release = resolve; });
  const deletion = vm.createContext({ documentDeletionBusy: false, activePersonId: 'river', selfRecoveryActive: false, capturePersonContext: () => ({}), personContextIsCurrent: () => true,
    state: { documents: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], timeline: [] }, window: { confirm: () => true }, managedReadOnly: () => true,
    cloudSyncRevision: 0, cloudSyncDirty: false, fetch: async () => { requests++; await pending; return { ok: true, json: async () => ({ state: { documents: [{ id: 'b', title: 'B' }], timeline: [] }, revision: 'synthetic_revision', updatedAt: 1 }) }; },
    applyCloudState(state) { deletion.state = state; }, write() {}, renderAll() {}, showToast() {}, setSyncStatus() {} });
  vm.runInContext(between('  async function deleteDocument(', '  function exportHealthData('), deletion);
  const first = deletion.deleteDocument('a');
  await deletion.deleteDocument('b');
  assert.equal(requests, 1, 'A second deletion does not race an older response into the UI.');
  release(); await first;
  assert.equal(deletion.documentDeletionBusy, false);
  assert.equal(deletion.state.documents.length, 1);
  assert.equal(deletion.state.documents[0].id, 'b');
  console.log('Managed client guards passed: declined chat/OCR/briefing makes no requests, fresh disclosures identify person/provider and child wishes/capacity, self flow preserved, document deletes serialized. VM UI checks; no provider/storage calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
