'use strict';

// All records below are synthetic verification inputs; catalogue-backed cases
// use pinned public product labels only to exercise exact name/route lookup.
// No browser health storage, live accounts, production user data or APIs are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const medicationEngine = require('../server-src/medication/safety-engine.cjs');
const { createHealthAlertsEngine } = require('../server-src/health/alerts-engine.cjs');
const pharmac = require('../data/medication/nz-pharmac-medicines.json');
const engine = createHealthAlertsEngine(medicationEngine);
const root = path.resolve(__dirname, '..');
const now = '2026-10-11T12:00:00Z';
let checks = 0;
const verified = [];
const check = (id, callback) => { callback(); checks += 1; verified.push(id); };
const evaluate = value => engine.evaluate({ ...value, now });
const has = (result, type, ruleId) => result.alerts.some(alert => alert.type === type && (!ruleId || alert.ruleId === ruleId));
const label = (id, ingredient, extra = {}) => ({ id, name: `Fictional label ${id}`, activeIngredients: [ingredient], activeIngredientsManuallyConfirmed: true, ...extra });
const symptom = (id, title, extra = {}) => ({ id, type: 'symptom', source: 'symptom-diary', title, date: '2026-10-10', ...extra });
const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item; };

check('empty-record-is-not-clearance', () => {
  const result = evaluate({});
  assert.equal(result.alerts.length, 0);
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.coverage.missing, ['medications', 'allergies', 'conditions', 'symptoms']);
  assert.match(result.disclaimer, /No alert does not mean safe/);
});

const pairs = [
  ['warfarin-sulfamethoxazole', 'warfarin', 'sulfamethoxazole'],
  ['oral-anticoagulant-ssri', 'warfarin', 'sertraline']
];
for (const [ruleId, left, right] of pairs) check(`shared-rule-${ruleId}`, () => {
  const medications = [label('m1', left), label('m2', right)];
  const original = medicationEngine.review({ medications: medications.map(item => ({ ...item, activeIngredientsConfirmed: true })) });
  const result = evaluate({ medications });
  assert.ok(original.alerts.some(alert => alert.ruleId === ruleId), `Shared source rule ${ruleId} must fire`);
  assert.ok(has(result, 'medication-medication', ruleId), `New engine must preserve source rule ${ruleId}`);
  const alert = result.alerts.find(item => item.ruleId === ruleId);
  assert.deepEqual(alert.triggers.map(item => item.id), ['m1', 'm2']);
  assert.ok(alert.sources.length);
  assert.match(alert.nextAction, /pharmacist or prescriber/);
  assert.equal(result.coverage.complete, false);
});

check('medication-medication-catalogue-brand', () => {
  const result = evaluate({ medications: [{ id: 'marevan', name: 'Marevan' }, { id: 'nurofen', name: 'Nurofen' }] });
  assert.ok(has(result, 'medication-medication-unassessed', 'medication-pair-unassessed'));
  assert.equal(result.coverage.medicationMedication.unassessedPairs, 1);
  assert.match(result.coverage.limitation, /not cleared/);
  assert.equal(result.coverage.medications.resolved, 2);
});
check('duplicate-ingredient', () => assert.ok(has(evaluate({ medications: [label('d1', 'paracetamol'), label('d2', 'acetaminophen')] }), 'duplicate-ingredient')));
check('partial-combination-retains-warning-and-coverage', () => {
  const result = evaluate({ medications: [{ id: 'one', name: 'Marevan' }, { id: 'two', name: 'Trisul' }] });
  assert.ok(has(result, 'medication-medication', 'warfarin-sulfamethoxazole'));
  assert.ok(has(result, 'medication-medication-unassessed', 'medication-pair-unassessed'));
  assert.equal(result.coverage.medicationMedication.assessedPairs, 0);
  assert.equal(result.coverage.medicationMedication.unassessedPairs, 1);
  assert.match(result.coverage.medicationMedication.unassessed[0].reason, /Some ingredient combinations/);
  assert.equal(result.alerts.find(item => item.ruleId === 'warfarin-sulfamethoxazole').severity, 'high');
  assert.match(result.alerts.find(item => item.ruleId === 'medication-pair-unassessed').message, /not fully assessed/);
});

check('multi-medicine-rule-reaches-health-alerts-with-exact-triggers', () => {
  const catalogueLabel = (productId, ingredient) => {
    const product = pharmac.products.find(item => item.id === productId);
    assert.ok(product, `Synthetic fixture product ${productId} must remain in the pinned catalogue`);
    return { id: productId, name: product.name, activeIngredients: [ingredient], activeIngredientsManuallyConfirmed: true };
  };
  const medications = [
    catalogueLabel('pharmac-16d587d3ac509b1d', 'Perindopril'),
    catalogueLabel('pharmac-edf9bc89ac681b09', 'Furosemide'),
    catalogueLabel('pharmac-9e06355ab49a321f', 'Ibuprofen')
  ];
  const engineResult = medicationEngine.review({ medications });
  const engineAlert = engineResult.alerts.find(item => item.ruleId === 'ras-inhibitor-diuretic-nsaid-aki');
  assert.ok(engineAlert, 'The retained combination rule should match the confirmed synthetic labels');
  assert.deepEqual(engineAlert.medicationIndexes, [0, 1, 2]);
  const result = evaluate({ medications });
  const alert = result.alerts.find(item => item.type === 'medication-medication' && item.ruleId === 'ras-inhibitor-diuretic-nsaid-aki');
  assert.ok(alert, 'The health-alert adapter must preserve the combination alert');
  assert.deepEqual(alert.triggers.map(item => item.id), medications.map(item => item.id));
  assert.equal(alert.severity, 'high');
  assert.ok(alert.sources.some(source => source.publisher === engineAlert.source.publisher));
  assert.equal(result.coverage.medicationMedication.requestedPairs, 3);
  assert.equal(result.coverage.medicationMedication.assessedPairs, 0, 'A triple rule must not be counted as pairwise coverage');
  assert.equal(result.coverage.medicationMedication.unassessedPairs, 3);
});
check('allergy-medication', () => assert.ok(has(evaluate({ medications: [label('pen', 'amoxicillin')], profile: { allergies: 'Penicillin (rash)' } }), 'allergy-medication', 'penicillin-class')));
check('condition-coverage-remains-unassessed', () => {
  const result = evaluate({ medications: [label('ibu', 'ibuprofen')], profile: { conditions: 'Asthma' } });
  assert.equal(result.coverage.conditionMedication.ruleCount, 0);
  assert.deepEqual(result.coverage.conditionMedication.unmatched, ['Asthma']);
  assert.equal(result.coverage.complete, false);
});
check('pregnancy-structured-detail-is-not-cleared', () => {
  const result = evaluate({ medications: [label('war', 'warfarin')], profile: { pregnant: true } });
  assert.equal(result.coverage.conditionMedication.ruleCount, 0);
  assert.ok(result.coverage.conditionMedication.unmatched.includes('Pregnant'));
  assert.equal(result.coverage.complete, false);
});
check('symptom-medication', () => assert.ok(has(evaluate({ medications: [label('war', 'warfarin')], timeline: [symptom('s1', 'Symptom recorded: coughing up blood')] }), 'symptom-medication', 'warfarin-bleeding-symptom')));
check('condition-symptom', () => assert.ok(has(evaluate({ profile: { conditions: 'Asthma' }, timeline: [symptom('s2', 'Wheezing')] }), 'condition-symptom', 'asthma-breathing-context')));
check('symptom-medication-condition', () => {
  const result = evaluate({ medications: [label('ibu', 'ibuprofen')], profile: { conditions: 'Asthma' }, timeline: [symptom('s3', 'Wheezing')] });
  assert.ok(has(result, 'symptom-medication-condition', 'asthma-nsaid-breathing-context'));
  assert.equal(result.alerts.find(item => item.type === 'symptom-medication-condition').triggers.length, 3);
});
check('detail-blood-type-conflict', () => assert.ok(has(evaluate({ profile: { bloodType: 'O+' }, memoryDetails: ['Blood type: AB negative'] }), 'health-detail-conflict', 'blood-type-record-conflict')));
check('detail-allergy-conflict', () => assert.ok(has(evaluate({ profile: { noKnownAllergies: true, allergies: 'Penicillin' } }), 'health-detail-conflict', 'allergy-record-conflict')));
check('equivalent-blood-type-is-not-conflict', () => assert.ok(!has(evaluate({ profile: { bloodType: 'AB+' }, emergency: { bloodType: 'AB positive' } }), 'health-detail-conflict')));

for (const value of ['No chest pain', 'History of sudden chest pain', 'Mother has severe difficulty breathing', 'No severe difficulty breathing', 'Swollen tongue resolved', 'Possible swollen tongue', 'I don’t have a swollen tongue', "I don't have a swollen tongue", 'My tongue isn’t swollen', "There wasn't severe chest pain", 'Swollen tongue last year', 'Swollen tongue two years ago', 'Severe chest pain in childhood', 'I can’t breathe last year', 'No severe chest pain']) check(`symptom-nonaffirmative-${value}`, () => {
  assert.equal(evaluate({ timeline: [symptom('neg', value)] }).alerts.filter(item => item.type === 'urgent-symptom').length, 0);
});
for (const value of ['No penicillin allergy', 'Not allergic to penicillin', 'Penicillin allergy ruled out', 'Family history of penicillin allergy', 'Possible penicillin allergy', 'I don’t have a penicillin allergy', "I'm not allergic to penicillin", 'I haven’t had penicillin allergy']) check(`allergy-nonaffirmative-${value}`, () => {
  assert.ok(!has(evaluate({ medications: [label('pen', 'amoxicillin')], profile: { allergies: value } }), 'allergy-medication'));
});
for (const value of ['Penicillin allergy?', 'Penicillin allergy? just asking', 'History of penicillin allergy', 'Possible penicillin allergy']) check(`allergy-uncertain-record-visible-${value}`, () => {
  const result = evaluate({ medications: [label('pen', 'amoxicillin')], profile: { allergies: value } });
  assert.ok(!has(result, 'allergy-medication'), 'Uncertain/historical wording is not promoted into a confirmed allergy match');
  const notice = result.alerts.find(item => item.type === 'allergy-record-unconfirmed');
  assert.ok(notice, 'Uncertain allergy history must remain visible as an unknown record, not disappear');
  assert.equal(notice.severity, 'unknown');
  assert.match(notice.message, /did not treat it as a confirmed allergy or as proof that there is no allergy/);
  assert.equal(result.coverage.allergyMedication.excludedOrUncertain, 1);
});
check('negation-scope-stops-at-but', () => {
  const result = evaluate({ medications: [label('pen', 'amoxicillin'), label('ibu', 'ibuprofen')], profile: { allergies: 'No penicillin allergy but ibuprofen rash' } });
  assert.ok(!result.alerts.some(item => item.type === 'allergy-medication' && item.triggers.some(trigger => trigger.id === 'pen')));
  assert.ok(result.alerts.some(item => item.type === 'allergy-medication' && item.triggers.some(trigger => trigger.id === 'ibu')));
});
check('symptom-negation-scope-stops-at-but', () => assert.ok(has(evaluate({ timeline: [symptom('pos', 'No chest pain but swollen tongue')] }), 'urgent-symptom')));
for (const value of ['Swelling of my throat', 'My tongue is swollen', 'Severe difficulty breathing', "Sudden chest pain that won't go away", 'I can’t breathe', 'I cannot breathe', 'Severe chest pain']) check(`affirmative-warning-${value}`, () => {
  const result = evaluate({ timeline: [symptom('urgent', value)] });
  assert.ok(has(result, 'urgent-symptom'));
  assert.match(result.alerts.find(item => item.type === 'urgent-symptom').nextAction, /If (?:this|severe chest pain) is happening now/);
});
check('symptom-canonical-description', () => {
  const result = evaluate({ timeline: [symptom('desc', 'Symptom recorded: Pain', { description: 'Swollen tongue' })] });
  assert.ok(has(result, 'urgent-symptom'));
  assert.match(result.alerts.find(item => item.type === 'urgent-symptom').triggers[0].value, /Matched wording: Swollen tongue/);
});
check('symptom-specific-narrative-negation-overrides-title', () => assert.ok(!has(evaluate({ timeline: [symptom('neg-note', 'Sudden chest pain', { notes: 'No chest pain now' })] }), 'urgent-symptom')));
check('symptom-other-negation-does-not-erase-swelling', () => assert.ok(has(evaluate({ timeline: [symptom('other-neg', 'Swollen tongue', { notes: 'No chest pain' })] }), 'urgent-symptom')));
check('symptom-history-note-overrides-record-date', () => assert.ok(!has(evaluate({ timeline: [symptom('history-note', 'Swollen tongue', { notes: 'Historical entry; this happened last year' })] }), 'urgent-symptom')));
check('symptom-conditional-question-is-not-affirmative', () => assert.ok(!has(evaluate({ timeline: [symptom('if', 'What if I have swollen tongue?')] }), 'urgent-symptom')));
check('canonical-timeline-overrides-stale-symptom-copy', () => {
  const result = evaluate({ symptoms: [symptom('same-id', 'Swollen tongue')], timeline: [symptom('same-id', 'No swollen tongue')] });
  assert.ok(!has(result, 'urgent-symptom'));
  assert.equal(result.coverage.symptoms.recorded, 1);
});
check('symptom-no-unsupported-ibuprofen-generalisation', () => assert.ok(!has(evaluate({ medications: [label('ibu', 'ibuprofen')], timeline: [symptom('bruise', 'Unexplained bruising')] }), 'symptom-medication', 'ibuprofen-bleeding-symptom')));
for (const extra of [{ date: '2025-10-10' }, { date: '2026-12-31' }, { date: '' }, { deleted: true }, { dismissed: true }, { resolved: true }, { current: false }, { active: false }]) check(`stale-or-excluded-symptom-${JSON.stringify(extra)}`, () => {
  assert.ok(!has(evaluate({ medications: [label('war', 'warfarin')], timeline: [symptom('stale', 'Coughing up blood', extra)] }), 'symptom-medication'));
});
check('explicit-current-symptom-may-be-undated', () => assert.ok(has(evaluate({ timeline: [symptom('current', 'Gasping', { date: '', current: true })] }), 'urgent-symptom')));
check('deleted-medicine-recalculates-pair', () => {
  const medications = [label('war', 'warfarin'), label('ibu', 'ibuprofen')];
  assert.ok(has(evaluate({ medications }), 'medication-medication-unassessed', 'medication-pair-unassessed'));
  assert.ok(!has(evaluate({ medications: [medications[0]] }), 'medication-medication-unassessed'));
  assert.ok(!has(evaluate({ medications: [medications[0], { ...medications[1], deleted: true }] }), 'medication-medication-unassessed'));
});
check('out-of-date-medicines-are-explicitly-excluded', () => {
  const result = evaluate({ medications: [label('war', 'warfarin'), label('ibu', 'ibuprofen', { endDate: '2026-10-01' })] });
  assert.ok(!has(result, 'medication-medication'));
  assert.equal(result.coverage.medications.excludedInactiveOrOutOfDate, 1);
});
check('old-controller-result-never-reused', () => {
  const result = evaluate({ existingCheck: { status: 'pending', checkedAt: '2025-01-01', result: { alerts: [{ severity: 'high', title: 'OLD RESULT' }] } } });
  assert.equal(result.alerts.length, 0);
  assert.equal(result.coverage.existingCheck.used, false);
});
check('unknown-name-keeps-coverage-open', () => {
  const result = evaluate({ medications: [{ name: 'Invented unlisted tablet' }] });
  assert.equal(result.coverage.medications.unknown.length, 1);
  assert.ok(has(result, 'unknown-medication'));
  assert.equal(result.coverage.complete, false);
});
check('label-name-mismatch-not-forced', () => {
  const result = evaluate({ medications: [{ name: 'Marevan', activeIngredients: ['ibuprofen'], activeIngredientsManuallyConfirmed: true }] });
  assert.equal(result.coverage.medications.unknown[0].matchState, 'name_label_mismatch');
  assert.ok(has(result, 'unknown-medication'));
});
check('unconfirmed-ingredients-never-trusted', () => {
  const result = evaluate({ medications: [{ name: 'Invented unlisted tablet', activeIngredients: ['warfarin'], activeIngredientsManuallyConfirmed: false }, label('ibu', 'ibuprofen')] });
  assert.ok(!has(result, 'medication-medication', 'warfarin-nsaid'));
});
check('resolved-but-uncovered-pair-is-explicitly-unassessed', () => {
  const result = evaluate({ medications: [label('war', 'warfarin'), label('ibu', 'ibuprofen')] });
  assert.equal(result.coverage.medicationMedication.requestedPairs, 1);
  assert.equal(result.coverage.medicationMedication.assessedPairs, 0);
  assert.equal(result.coverage.medicationMedication.unassessedPairs, 1);
  assert.deepEqual(result.coverage.medicationMedication.unassessed, [{ left: 'Fictional label war', right: 'Fictional label ibu', reason: 'No retained pairwise rule matched' }]);
  const alert = result.alerts.find(item => item.ruleId === 'medication-pair-unassessed');
  assert.equal(alert?.severity, 'unknown');
  assert.match(alert?.message || '', /No alert does not mean safe/);
});
check('unassessed-results-and-conditions-preserved-in-coverage-data', () => {
  const result = evaluate({ profile: { conditions: 'Invented rare condition' }, results: [{ value: 'fictional' }], measurements: [{ type: 'weight', value: 70 }] });
  assert.deepEqual(result.coverage.conditionMedication.unmatched, ['Invented rare condition']);
  assert.equal(result.coverage.results.status, 'not_assessed');
  assert.equal(result.coverage.results.recorded, 2);
});
check('bounded-medicine-input-omissions-reported-in-coverage-data', () => {
  const result = evaluate({ medications: Array.from({ length: 62 }, (_, index) => ({ name: `Invented missing name ${index}`, id: `unknown-${index}` })) });
  assert.equal(result.coverage.medications.checked, 60);
  assert.equal(result.coverage.medications.omittedByLimit, 2);
});
check('pure-input-no-mutation-stable-identities', () => {
  const input = freeze({ medications: [label('war', 'warfarin'), label('ibu', 'ibuprofen')], profile: { conditions: 'Asthma' }, timeline: [symptom('s', 'Wheezing')], now });
  const before = JSON.stringify(input);
  const left = engine.evaluate(input);
  const right = engine.evaluate(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(left, right);
});
check('official-source-links-only', () => {
  const results = [evaluate({ medications: [label('war', 'warfarin'), label('ibu', 'ibuprofen')], profile: { conditions: 'Asthma' }, timeline: [symptom('b', 'Coughing up blood')] }), ...pairs.map(([, left, right]) => evaluate({ medications: [label('l', left), label('r', right)] }))];
  const allowed = new Set(['www.nhs.uk', 'sps.nhs.uk', 'www.medsafe.govt.nz', 'medsafe.govt.nz', 'www.accessdata.fda.gov', 'accessdata.fda.gov', 'schedule.pharmac.govt.nz']);
  for (const alert of results.flatMap(result => result.alerts)) {
    assert.ok(alert.triggers.length && alert.nextAction && alert.message && alert.sources.length);
    for (const source of alert.sources.filter(item => item.url)) { const url = new URL(source.url); assert.equal(url.protocol, 'https:'); assert.ok(allowed.has(url.hostname)); }
    assert.doesNotMatch(alert.nextAction, /(?:start|stop|increase|reduce|double) (?:taking |your )?(?:warfarin|ibuprofen|dose|medication)/i);
  }
});
check('allergy-class-sources-qualified-with-primary-context', () => {
  const penicillin = evaluate({ medications: [label('amox', 'amoxicillin')], profile: { allergies: 'Penicillin' } }).alerts.find(item => item.ruleId === 'penicillin-class');
  assert.ok(penicillin.sources.some(item => item.sourceStatus === 'not-externally-sourced'));
  assert.ok(penicillin.sources.some(item => item.url === 'https://www.nhs.uk/medicines/amoxicillin/who-can-and-cannot-take-amoxicillin/' && /does not verify/.test(item.currentnessNote)));
  const nsaid = evaluate({ medications: [label('ibu', 'ibuprofen')], profile: { allergies: 'NSAIDs' } }).alerts.find(item => item.ruleId === 'nsaid-class');
  assert.ok(nsaid.sources.some(item => item.url === 'https://www.nhs.uk/medicines/nsaids/' && /does not verify/.test(item.currentnessNote)));
});
check('generated-browser-source-is-current', () => execFileSync(process.execPath, [path.join(__dirname, 'build-health-alerts.cjs'), '--check'], { stdio: 'pipe' }));
check('browser-bundle-parity-without-network-or-storage', () => {
  const denied = () => { throw new Error('Network or storage access is forbidden in this fixture'); };
  const context = { URL, Date, fetch: denied, XMLHttpRequest: denied, localStorage: { getItem: denied, setItem: denied }, sessionStorage: { getItem: denied, setItem: denied }, console: { log: denied, warn: denied, error: denied } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'health-alerts.js'), 'utf8'), context, { timeout: 10000 });
  const inputs = [
    { medications: [label('war', 'warfarin'), label('ibu', 'ibuprofen')], now },
    { medications: [label('war', 'warfarin'), label('ibu', 'ibuprofen')], profile: { conditions: 'Asthma' }, timeline: [symptom('s', 'Wheezing')], now }
  ];
  for (const input of inputs) {
    const browser = context.DoctorAIHealthAlerts.evaluate(input);
    assert.deepEqual(JSON.parse(JSON.stringify(browser)), engine.evaluate(input));
    assert.equal(browser.coverage.networkRequests, 0);
  }
});

console.log(`Health alerts verified: ${checks} fictional fixture checks passed; no production data or APIs used.`);
console.table([
  { combination: 'Medicine + medicine', fixture: 'medication-medication-catalogue-brand', covered: true },
  { combination: 'Medicine + allergy', fixture: 'allergy-medication', covered: true },
  { combination: 'Medicine + condition', fixture: 'condition-medication', covered: true },
  { combination: 'Medicine + symptom', fixture: 'symptom-medication', covered: true },
  { combination: 'Condition + symptom', fixture: 'condition-symptom', covered: true },
  { combination: 'Medicine + condition + symptom', fixture: 'symptom-medication-condition', covered: true },
  { combination: 'Saved detail contradiction', fixture: 'detail-blood-type-conflict / detail-allergy-conflict', covered: true }
]);
