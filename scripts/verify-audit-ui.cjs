'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
const hub = fs.readFileSync(path.join(root, 'health-hub.html'), 'utf8');
assert.match(hub, /data-modal="emergency"/);
for (const id of ['emergency-contact', 'emergency-phone']) assert.match(hub, new RegExp(`id="${id}"`), 'Saved contact fields have live rendering targets');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function source(name, endName) {
  const start = js.indexOf(`  function ${name}(`);
  const asyncStart = js.indexOf(`  async function ${name}(`);
  const from = start < 0 ? asyncStart : start;
  const end = js.indexOf(`  ${endName}`, from + 1);
  assert.ok(from >= 0 && end > from, `Actual ${name} function can be exercised`);
  return js.slice(from, end);
}
function load(code, extra = {}) {
  return vm.createContext({ escapeHTML, iconMarkup: () => '', ...extra, code });
}
function run(context, code) { return vm.runInContext(code, context, { timeout: 1000 }); }

const files = { documents: [{ id: 'fictional-file', category: 'result', title: '<private report>', description: 'Saved report', date: '2026-10-13', size: '1 KB', type: 'PDF' }], timeline: [{ type: 'document', title: '<private report>', description: 'Uploaded', date: '2026-10-13' }] };
const nodes = { documentsGrid: {}, resultList: {}, timelineList: {}, activity: {} };
const docs = load(source('renderDocuments', 'function renderProControls') + source('renderResults', 'const symptomImpactLabels') + source('renderTimeline', 'function renderDocuments') + source('renderActivity', 'const upcomingAppointments'), {
  state: files, els: nodes, hasProAccess: () => false, documentFilter: 'all', timelineFilter: 'all', proFeatureGate: title => `UPGRADE: ${title}`, formatDate: date => date, formatShortDate: date => date, timelineIconMarkup: () => '', symptomLogDescription: () => ''
});
run(docs, docs.code + '\nrenderDocuments(); renderResults(); renderTimeline(); renderActivity();');
for (const node of Object.values(nodes)) assert.match(node.innerHTML, /&lt;private report&gt;/, 'Saved files remain visible after expiry and escaped');
for (const name of ['documentsGrid', 'resultList']) {
  assert.match(nodes[name].innerHTML, /data-document-view="fictional-file"/);
  assert.match(nodes[name].innerHTML, /data-document-download="fictional-file"/);
  assert.match(nodes[name].innerHTML, /data-delete-document="fictional-file"/);
  assert.match(nodes[name].innerHTML, /Explain pasted text/);
  assert.doesNotMatch(nodes[name].innerHTML, /UPGRADE:/);
}
files.documents = [];
run(docs, 'renderDocuments(); renderResults();');
assert.match(nodes.documentsGrid.innerHTML, /UPGRADE: New file uploads/);
assert.match(nodes.resultList.innerHTML, /UPGRADE: New results uploads/);

let submit, drafted = '', modal = '', focused = false, closed = false;
const explanationForm = { elements: { excerpt: { value: '', focus() { focused = true; } } }, addEventListener(type, callback) { assert.equal(type, 'submit'); submit = callback; } };
const explanation = load(source('openDocumentTextExplanation', 'function prepareAppointment'), {
  $: () => explanationForm, setModal: (_title, _subtitle, html) => { modal = html; }, closeModal: () => { closed = true; }, fillChat: prompt => { drafted = prompt; }, showToast: () => {}, fetch: () => { throw new Error('No request before explicit Send'); }
});
run(explanation, explanation.code + '\nopenDocumentTextExplanation();');
assert.match(modal, /has not read your uploaded file/);
assert.match(modal, /Health Memory/);
submit({ preventDefault() {} });
assert.equal(drafted, ''); assert.equal(focused, true);
explanationForm.elements.excerpt.value = '  Chosen excerpt <fictional>  ';
submit({ preventDefault() {} });
assert.equal(closed, true);
assert.match(drafted, /Only this excerpt is supplied; the full document has not been read/);
assert.ok(drafted.endsWith('Chosen excerpt <fictional>'));
assert.ok(drafted.length <= 2000);

const todayNodes = { '#today-visit-title': {}, '#today-visit-details': {} };
class FixedDate extends Date { constructor(value) { super(value ?? '2026-10-13T12:00:00Z'); } }
let appointments = [{ date: '2026-10-12', title: 'Past date' }, { date: '2026-10-14', title: 'Upcoming fictional visit', time: '10:00', provider: 'Test clinic' }];
const today = load(source('renderTodayVisit', 'function renderTodayAppointment'), { Date: FixedDate, $: key => todayNodes[key], upcomingAppointments: () => appointments, formatDate: date => date, formatTime: time => time });
run(today, today.code + '\nrenderTodayVisit();');
assert.match(todayNodes['#today-visit-details'].textContent, /Upcoming fictional visit/);
assert.doesNotMatch(todayNodes['#today-visit-details'].textContent, /Past date/);
appointments = [];
run(today, 'renderTodayVisit();');
assert.match(todayNodes['#today-visit-details'].textContent, /Add an appointment/);

const profile = load(source('handleModalSubmit', 'function renderLocalMedicationDatabaseResult'), {
  state: { profile: { conditions: 'Preserve this', emergencyContact: 'Old', emergencyPhone: 'Old' } }, FormData: class { constructor(form) { this.form = form; } entries() { return Object.entries(this.form.values); } }, saveState: () => {}, renderAll: () => {}, closeModal: () => {}, showToast: () => {}, showView: () => {}
});
run(profile, profile.code);
const contactForm = { dataset: { modalForm: 'emergency' }, values: { emergencyContact: '  Fictional contact  ', emergencyPhone: '  123  ' } };
profile.handleModalSubmit({ target: { matches: () => false, closest: () => contactForm }, preventDefault() {} });
assert.equal(profile.state.profile.emergencyContact, 'Fictional contact');
assert.equal(profile.state.profile.emergencyPhone, '123');
assert.equal(profile.state.profile.conditions, 'Preserve this');
contactForm.values = { emergencyContact: '', emergencyPhone: '' };
profile.handleModalSubmit({ target: { matches: () => false, closest: () => contactForm }, preventDefault() {} });
assert.equal(profile.state.profile.emergencyPhone, '');

async function verifyDeletionUI() {
  let fail = true, writes = 0;
  const requests = [], messages = [];
  const deletion = load(source('deleteHealthData', 'function handleModalSubmit'), {
    cloudSyncBusy: false, cloudSyncTimer: null, cloudSyncEnabled: true, cloudSyncDirty: false, cloudSyncRevision: 0, authUser: { sub: 'fictional-user' }, state: { medications: [{ name: 'fictional medicine' }] }, emptyProfile: {}, clone: value => structuredClone(value), window: { confirm: () => true, clearTimeout() {} }, showToast: message => messages.push(message), setSyncStatus: () => {}, write: () => { writes += 1; }, clearChat: () => {}, renderAll: () => {}, closePrivacy: () => {}, fetch: async (url, options = {}) => {
      requests.push([url, options.method || 'GET']);
      if (url === '/api/documents') return { ok: true, json: async () => ({ documents: [{ id: 'fictional-file' }] }) };
      if (url.includes('fictional-file')) return { ok: !fail, status: fail ? 503 : 200 };
      return { ok: true };
    }
  });
  run(deletion, deletion.code);
  await deletion.deleteHealthData();
  assert.equal(deletion.state.medications.length, 1);
  assert.equal(writes, 0);
  assert.equal(requests.some(([url]) => url === '/api/health/state'), false);
  assert.ok(messages.some(message => message.includes('could not finish')));
  fail = false;
  await deletion.deleteHealthData();
  assert.equal(deletion.state.medications.length, 0);
  assert.ok(writes > 0);
  assert.ok(requests.some(([url, method]) => url === '/api/health/state' && method === 'DELETE'));
}
verifyDeletionUI().then(() => console.log('Audit UI verification passed: expired-Pro file actions, explicit pasted-text draft, next appointment, editable contacts and incomplete-deletion recovery.')).catch(error => { console.error(error); process.exitCode = 1; });
