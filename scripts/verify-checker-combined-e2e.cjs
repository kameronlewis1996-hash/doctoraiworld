'use strict';

// Synthetic software conformance only; expectations have not been clinician adjudicated.
// Actual storage/owner/renderer functions and generated browser engine; fake DOM sinks,
// an in-memory localStorage and a fixed clock. No service, health account or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const medicineEngine = require('../server-src/medication/safety-engine.cjs');
const { createHealthAlertsEngine } = require('../server-src/health/alerts-engine.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
const now = '2026-10-16T12:00:00Z';
const multiId = 'ras-inhibitor-diuretic-nsaid-aki';
const triple = [
  { id: 'ras', name: 'Losartan Actavis — Losartan potassium — Tab 100 mg' },
  { id: 'diuretic', name: 'Furosemide' },
  { id: 'nsaid', name: 'Ibuprofen' }
];
const copy = value => JSON.parse(JSON.stringify(value));
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Actual implementation exists: ${start}`);
  return source.slice(from, to);
};
const prefix = 'doctorai-health-hub-';
function harness(saved = {}) {
  const memory = new Map([[prefix + 'device-storage-consent', 'yes']]);
  const seed = (record, scope = null) => {
    for (const [key, value] of Object.entries(record)) memory.set(prefix + (scope ? `account-${scope}-` : '') + key, JSON.stringify(value));
  };
  seed(saved);
  const nodes = Object.fromEntries(['alerts-list', 'alerts-status', 'alerts-count', 'alerts-controls'].map(id => ['#' + id, { innerHTML: '', textContent: '', replaceChildren() { this.innerHTML = ''; } }]));
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return Date.parse(now); } }
  const denied = () => { throw new Error('Network access forbidden'); };
  const context = vm.createContext({
    URL, Date: FixedDate, console, fetch: denied, XMLHttpRequest: denied,
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) },
    window: { clearTimeout() {}, DoctorAIIcons: { hydrate() {} }, DoctorAIAlertStatus: { render(result) { context.lastResult = result; } } },
    document: {}, $: selector => nodes[selector] || null,
    iconMarkup: name => `<i data-icon="${name}"></i>`,
    medicationCheckController: { snapshot: () => saved['medication-check'] || null },
    refreshMedicationCheckContext: async () => {},
    localStateUpdatedAt: 0, cloudSyncTimer: 0, cloudSyncDirty: false, cloudSyncRevision: 0, cloudSyncEnabled: false
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'health-alerts.js'), 'utf8'), context);
  context.window.DoctorAIHealthAlerts = context.DoctorAIHealthAlerts;
  const escaping = source.match(/^\s*const escapeHTML = .*;$/m)?.[0];
  assert.ok(escaping);
  vm.runInContext(section('  const storagePrefix =', '  const els =') + '\n' + escaping + '\n' + section('  function renderHealthAlerts() {', '\n  function renderAll() {'), context);
  const run = code => vm.runInContext(code, context);
  const render = () => {
    run('renderHealthAlerts()');
    assert.ok(context.lastResult, 'Real renderer must evaluate the actual combined engine');
    const result = copy(context.lastResult);
    const inputs = copy(run('healthStateSnapshot()'));
    assert.deepEqual(result, createHealthAlertsEngine(medicineEngine).evaluate({ ...inputs, now }), 'Browser and server engines agree');
    for (const alert of result.alerts) assert.ok(nodes['#alerts-list'].innerHTML.includes(run(`escapeHTML(${JSON.stringify(alert.message)})`)), 'Every evaluated notice reaches actual UI markup');
    return result;
  };
  run('activateHealthDataOwner(null)');
  return { render, run, seed, nodes, memory };
}
const rows = [];
function check(name, callback) {
  try { callback(); rows.push({ name, status: 'passed' }); }
  catch (error) { rows.push({ name, status: 'failed', error: error.message }); }
}
const hasMulti = result => result.alerts.some(alert => alert.ruleId === multiId);

check('saved-triple-to-engine-to-combined-to-renderer', () => {
  const original = medicineEngine.review({ medications: triple }).alerts.find(alert => alert.ruleId === multiId);
  assert.ok(original, 'The frozen retained rule fires in the medicine engine');
  const h = harness({ medications: triple });
  const result = h.render();
  const alert = result.alerts.find(item => item.ruleId === multiId);
  assert.ok(alert, 'Combined wrapper must forward retained multi-medicine alert');
  assert.equal(alert.message, original.message);
  assert.equal(alert.severity, original.severity);
  assert.deepEqual(alert.triggers.map(item => item.id), ['ras', 'diuretic', 'nsaid']);
  assert.match(h.nodes['#alerts-list'].innerHTML, /Potential multi-medicine interaction/);
});

console.log(JSON.stringify({ suite: 'checker-combined-e2e', baseline: '7bec9131662b72d74e45efbf1aaaea0eda220dbe', rules: '2026.10.15-r149', denominator: rows.length, passed: rows.filter(row => row.status === 'passed').length, failed: rows.filter(row => row.status === 'failed').length, cases: rows }, null, 2));
if (rows.some(row => row.status === 'failed')) process.exitCode = 1;
