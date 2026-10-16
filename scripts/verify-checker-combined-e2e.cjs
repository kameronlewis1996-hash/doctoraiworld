'use strict';
process.env.TZ = 'UTC';

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
const now = '2026-10-16T00:00:00Z';
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
    assert.deepEqual(result, createHealthAlertsEngine(medicineEngine).evaluate({ ...inputs, existingCheck: saved['medication-check'] || null, now }), 'Browser and server engines agree');
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
const confirmed = (id, ingredients) => ({ id, name: `Synthetic ${id}`, activeIngredients: ingredients, activeIngredientsManuallyConfirmed: true });

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

check('unrelated-and-duplicate-candidates-have-exact-triggers', () => {
  const h = harness({ medications: [{ id: 'unrelated', name: 'Paracetamol' }, ...triple, { id: 'extra-ras', name: 'Losartan' }] });
  const notices = h.render().alerts.filter(item => item.ruleId === multiId);
  assert.equal(notices.length, 1);
  assert.deepEqual(notices[0].triggers.map(item => item.id), ['ras', 'diuretic', 'nsaid']);
});
check('two-products-with-three-components-not-duplicated-or-counted-as-pair-rule', () => {
  const combo = confirmed('combo', ['losartan', 'furosemide']);
  const result = harness({ medications: [combo, triple[2]] }).render();
  const notices = result.alerts.filter(item => item.ruleId === multiId);
  assert.equal(notices.length, 1);
  assert.deepEqual(notices[0].triggers.map(item => item.id), ['combo', 'nsaid']);
  assert.equal(result.coverage.medicationMedication.assessedPairs, 0);
  assert.equal(result.coverage.medicationMedication.unassessedPairs, 1);
});
for (const [name, extra] of Object.entries({ stopped: { status: 'stopped' }, inactive: { active: false }, deleted: { deleted: true }, past: { endDate: '2026-10-15' }, future: { startDate: '2026-10-17' } })) check(`saved-lifecycle-${name}-removes-combination`, () => {
  const result = harness({ medications: [...triple.slice(0, 2), { ...triple[2], ...extra }] }).render();
  assert.equal(hasMulti(result), false);
  assert.equal(result.coverage.medications.excludedInactiveOrOutOfDate, 1);
});
check('current-date-boundaries-retain-combination', () => assert.ok(hasMulti(harness({ medications: triple.map(item => ({ ...item, startDate: '2026-10-16', endDate: '2026-10-16' })) }).render())));
check('saved-edit-removes-old-combination', () => {
  const h = harness({ medications: triple });
  assert.ok(hasMulti(h.render()));
  h.seed({ medications: triple.slice(0, 2) });
  h.run('loadHealthStateFromDevice()');
  assert.equal(hasMulti(h.render()), false);
  assert.doesNotMatch(h.nodes['#alerts-list'].innerHTML, /Potential multi-medicine interaction/);
});
check('zero-medicines-ignore-stale-controller-result', () => {
  const h = harness({ medications: [], 'medication-check': { status: 'complete', result: { alerts: [{ ruleId: multiId, title: 'STALE SYNTHETIC' }] } } });
  const result = h.render();
  assert.equal(result.alerts.length, 0);
  assert.equal(result.coverage.existingCheck.used, false);
  assert.match(h.nodes['#alerts-status'].textContent, /No current medicines/);
  assert.doesNotMatch(h.nodes['#alerts-list'].innerHTML, /STALE SYNTHETIC/);
});
check('missing-data-and-unknown-identity-remain-open', () => {
  const result = harness({ medications: [{ id: 'blank', name: '' }, ...triple.slice(0, 2)] }).render();
  assert.equal(hasMulti(result), false);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.medications.unknown.length, 1);
  assert.ok(result.coverage.missing.includes('allergies'));
});
check('duplicate-ingredients-across-records-render', () => {
  const result = harness({ medications: [confirmed('p1', ['paracetamol']), confirmed('p2', ['acetaminophen'])] }).render();
  assert.ok(result.alerts.some(item => item.type === 'duplicate-ingredient'));
});
check('duplicate-ingredients-within-confirmed-label-stay-unknown', () => {
  const result = harness({ medications: [confirmed('bad', ['ibuprofen', 'ibuprofen']), ...triple.slice(0, 2)] }).render();
  assert.equal(hasMulti(result), false);
  assert.equal(result.coverage.medications.unknown.length, 1);
});
check('medicine-input-overflow-is-disclosed-and-does-not-resurrect-omitted-rule', () => {
  const medications = [...triple.slice(0, 2), ...Array.from({ length: 58 }, (_, i) => ({ id: `missing-${i}`, name: `Synthetic unmapped ${i}` })), triple[2]];
  const h = harness({ medications });
  const result = h.render();
  assert.equal(result.coverage.medications.checked, 60);
  assert.equal(result.coverage.medications.omittedByLimit, 1);
  assert.equal(hasMulti(result), false);
  assert.match(h.nodes['#alerts-controls'].innerHTML, /1 omitted by the input limit/);
});
for (const [name, title] of Object.entries({ negation: 'No swollen tongue', history: 'History of swollen tongue', conditional: 'What if I have swollen tongue?', family: 'Mother has swollen tongue' })) check(`saved-symptom-${name}-excluded`, () => {
  const result = harness({ timeline: [{ id: name, type: 'symptom', source: 'symptom-diary', title, date: '2026-10-16' }] }).render();
  assert.equal(result.alerts.some(item => item.type === 'urgent-symptom'), false);
});
check('saved-current-symptom-renders-with-zero-medicines', () => {
  const result = harness({ timeline: [{ id: 'current', type: 'symptom', source: 'symptom-diary', title: 'Swollen tongue', date: '2026-10-16' }] }).render();
  assert.ok(result.alerts.some(item => item.type === 'urgent-symptom'));
});
check('saved-old-symptom-is-excluded', () => {
  const result = harness({ timeline: [{ id: 'old', type: 'symptom', source: 'symptom-diary', title: 'Swollen tongue', date: '2025-10-16' }] }).render();
  assert.equal(result.alerts.some(item => item.type === 'urgent-symptom'), false);
});
check('account-boundaries-and-unverified-transition-clear-rendered-records', () => {
  const h = harness({ medications: triple });
  const a = 'a'.repeat(64), b = 'b'.repeat(64);
  h.seed({ medications: triple }, a);
  h.seed({ medications: [] }, b);
  assert.ok(hasMulti(h.render()));
  h.run(`activateHealthDataOwner({email:'synthetic-a@example.invalid'}, '${a}')`);
  assert.ok(hasMulti(h.render()));
  h.run(`activateHealthDataOwner({email:'synthetic-b@example.invalid'}, '${b}')`);
  assert.equal(hasMulti(h.render()), false);
  h.run(`activateHealthDataOwner({email:'synthetic-a@example.invalid'}, '${a}')`);
  assert.ok(hasMulti(h.render()));
  h.run("activateHealthDataOwner(null, '', false)");
  assert.equal(h.render().alerts.length, 0);
  assert.doesNotMatch(h.nodes['#alerts-list'].innerHTML, /Losartan|Furosemide|Ibuprofen/);
});
const db = require('../data/medication/medication-safety.seed.json');
for (const [ruleId, medications] of [
  ['oral-anticoagulant-ssri', [{ name: 'Warfarin' }, { name: 'Sertraline' }]],
  ['warfarin-sulfamethoxazole', [{ name: 'Warfarin' }, { name: 'Trisul' }]],
  [multiId, triple]
]) check(`retained-source-metadata-${ruleId}`, () => {
  const expected = [...db.interactionRules, ...db.combinationRules].find(item => item.id === ruleId).source;
  const h = harness({ medications });
  const source = h.render().alerts.find(item => item.ruleId === ruleId).sources[0];
  for (const key of ['url', 'license', 'licenseUrl', 'attribution', 'rightsBasis']) assert.equal(source[key], expected[key], `Preserve ${key}`);
  assert.ok(h.nodes['#alerts-list'].innerHTML.includes(expected.url), 'Retained exact source URL reaches renderer');
  if (process.argv.includes('--require-visible-attribution')) {
    assert.ok(h.nodes['#alerts-list'].innerHTML.includes(h.run(`escapeHTML(${JSON.stringify(expected.attribution)})`)), 'Retained attribution must be visible in actual source details');
    assert.ok(h.nodes['#alerts-list'].innerHTML.includes('href="https://creativecommons.org/licenses/by/4.0/"'), 'Actual source details must link to the retained licence');
  }
});
// Route conformance at the real reviewResolved seam. The frozen catalogue has no
// exact topical NSAID product. These are NOT saved-input end-to-end cases.
for (const [name, routes, incomplete, expected] of [
  ['systemic', ['systemic'], false, true], ['topical', ['topical'], false, false],
  ['unknown', [], true, true], ['conflicting', ['oral', 'topical'], false, true]
]) check(`resolved-route-seam-${name}`, () => {
  const resolved = triple.map(item => medicineEngine.resolveMedication(item));
  resolved[2] = { ...resolved[2], possibleInteractionRoutes: routes, interactionRoutesIncomplete: incomplete };
  assert.equal(hasMulti(medicineEngine.reviewResolved({ resolved })), expected);
});
for (const route of ['topical', 'oral']) check(`saved-route-field-${route}-is-not-assessed`, () => {
  const result = harness({ medications: triple.map(item => ({ ...item, route })) }).render();
  assert.ok(hasMulti(result), 'Frozen engine does not assess the arbitrary saved route field');
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.medicationMedication.doseRouteTimingAssessed, false);
});

// Source-sanitization seam: real evaluations with only source metadata replaced.
if (process.argv.includes('--require-visible-attribution')) check('renderer-attribution-escaping-integration', () => {
  const h = harness({ medications: triple });
  h.run(`const realEvaluate = window.DoctorAIHealthAlerts.evaluate;
    window.DoctorAIHealthAlerts = { evaluate: input => {
      const result = realEvaluate(input);
      result.alerts.forEach(alert => alert.sources.forEach(source => {
        source.attribution = '<img src=x onerror=synthetic()> &';
        source.license = '<script>synthetic()</script>';
        source.licenseUrl = 'javascript:synthetic()';
      }));
      return result;
    }};
    renderHealthAlerts();`);
  const html = h.nodes['#alerts-list'].innerHTML;
  assert.ok(html.includes('&lt;img src=x onerror=synthetic()&gt; &amp;'));
  assert.ok(html.includes('&lt;script&gt;synthetic()&lt;/script&gt;'));
  assert.doesNotMatch(html, /<img src=x|<script>|href="javascript:/);
});
for (const url of [
  'https://jamanetwork.com/other', 'https://pmc.ncbi.nlm.nih.gov/articles/OTHER/',
  'https://link.springer.com/other',
  'https://link.springer.com/article/10.1186/s40780-026-00560-8?redirect=other',
  'https://user:password@link.springer.com/article/10.1186/s40780-026-00560-8',
  'javascript:alert(1)'
]) check(`source-sanitization-seam-${url}`, () => {
  const substitute = result => ({ ...result, alerts: result.alerts.map(alert => ({ ...alert, source: { ...alert.source, url, licenseUrl: 'javascript:alert(2)' } })) });
  const engine = createHealthAlertsEngine({ review: input => substitute(medicineEngine.review(input)), reviewResolved: input => substitute(medicineEngine.reviewResolved(input)) });
  const source = engine.evaluate({ medications: triple, now }).alerts.find(item => item.ruleId === multiId).sources[0];
  assert.equal(source.url, undefined);
  assert.equal(source.licenseUrl, undefined);
});

console.log(JSON.stringify({ suite: 'checker-combined-e2e', baseline: '7bec9131662b72d74e45efbf1aaaea0eda220dbe', rules: '2026.10.15-r149', denominator: rows.length, passed: rows.filter(row => row.status === 'passed').length, failed: rows.filter(row => row.status === 'failed').length, cases: rows }, null, 2));
if (rows.some(row => row.status === 'failed')) process.exitCode = 1;
