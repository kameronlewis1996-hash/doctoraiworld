'use strict';

const assert = require('node:assert/strict');
const seed = require('../data/medication/medication-safety.seed.json');
const exclusions = require('../docs/medication-provenance-exclusions.json');
const { review, resolveMedication } = require('../server-src/medication/safety-engine.cjs');
const { decision, isCcByRecord } = require('./medication-provenance-policy.cjs');

assert.equal(seed.datasetVersion, '2026.10.15-r149');
assert.equal(seed.ruleset.provenanceFiltered, true);
assert.equal(seed.ruleset.interactionRuleCount, 2);
assert.equal(seed.ruleset.combinationRuleCount, 1);
assert.equal(seed.ruleset.conditionRuleCount, 0);
assert.equal(seed.ruleset.allergyRuleCount, 2);
assert.deepEqual(seed.interactionRules.map(rule => rule.id).sort(), ['oral-anticoagulant-ssri', 'warfarin-sulfamethoxazole']);
assert.deepEqual(seed.combinationRules.map(rule => rule.id), ['ras-inhibitor-diuretic-nsaid-aki']);
assert.equal(seed.contraindicationRules.length, 0);
assert.deepEqual(seed.allergyRules.map(rule => rule.id).sort(), ['nsaid-class', 'penicillin-class']);

for (const rule of [...seed.interactionRules, ...seed.combinationRules]) {
  assert.equal(decision(rule).keep, true, `${rule.id} must pass the release rights gate`);
  assert.ok(isCcByRecord(rule.source), `${rule.id} must have complete CC BY 4.0 attribution`);
  assert.ok((rule.source.additionalSources || []).every(isCcByRecord), `${rule.id} supplemental sources must independently meet the rights gate`);
  assert.ok(Number.isSafeInteger(rule.recordVersion) && rule.recordVersion >= 1);
  assert.ok(rule.reviewed && rule.evidenceSummary);
}
for (const rule of seed.allergyRules) {
  assert.equal(decision(rule).keep, true, `${rule.id} must pass the internal-rule exception`);
  assert.equal(rule.source.kind, 'internal-rule');
  assert.equal(rule.source.sourceStatus, 'not-externally-sourced');
  assert.ok(rule.source.attribution);
}
assert.ok(exclusions.exclusions.interactionRules.some(rule => rule.id === 'warfarin-nsaid'));
assert.deepEqual(Object.fromEntries(Object.entries(exclusions.exclusions).map(([key, list]) => [key, list.length])), {
  interactionRules: 1115, combinationRules: 17, contraindicationRules: 133, allergyRules: 4
});

function expectRule(medications, ruleId, expectedStatus) {
  const result = review({ medications });
  assert.equal(result.status, expectedStatus, `${medications.join(' + ')} should report the retained rule`);
  const alert = result.alerts.find(item => item.ruleId === ruleId);
  assert.ok(alert, `${ruleId} must be reported`);
  assert.ok(alert.source?.url && alert.evidenceSummary);
  assert.ok(Number.isSafeInteger(alert.recordVersion) && alert.recordVersion >= 1);
  assert.equal(result.coverage.completeForRequest, false);
  return result;
}
expectRule(['Marevan', 'Trisul'], 'warfarin-sulfamethoxazole', 'red');
expectRule(['Marevan', 'sertraline'], 'oral-anticoagulant-ssri', 'orange');
expectRule(['lisinopril', 'hydrochlorothiazide', 'ibuprofen'], 'ras-inhibitor-diuretic-nsaid-aki', 'red');

const uncovered = review({ medications: ['warfarin', 'ibuprofen'] });
assert.deepEqual(uncovered.resolved.map(item => item.status), ['resolved', 'resolved'], 'Both ingredient names should resolve before pair coverage is evaluated');
assert.equal(uncovered.status, 'unknown');
assert.equal(uncovered.coverage.completeForRequest, false);
assert.equal(uncovered.coverage.interactionRuleCount, 2);
assert.equal(uncovered.coverage.interactionCoverage, 'limited');
assert.ok(!uncovered.alerts.some(alert => alert.ruleId === 'warfarin-nsaid'));
assert.ok(uncovered.alerts.some(alert => alert.type === 'interaction-coverage' && alert.severity === 'unknown' && /unassessed/i.test(alert.message) && /No alert does not mean safe/i.test(alert.message)));
assert.match(uncovered.disclaimer, /Coverage remains limited/i);

const multiple = review({ medications: ['warfarin', 'ibuprofen', 'sertraline'] });
assert.equal(multiple.coverage.completeForRequest, false);
assert.ok(multiple.alerts.some(alert => alert.type === 'interaction-coverage' && alert.severity === 'unknown'));
assert.ok(multiple.coverage.unassessedPairs >= 1);
const unknownMedicine = review({ medications: ['fictional unlisted tablet', 'warfarin'] });
assert.equal(unknownMedicine.coverage.unknown, 1);
assert.equal(unknownMedicine.status, 'unknown');
assert.ok(unknownMedicine.alerts.some(alert => alert.type === 'unknown' || alert.type === 'interaction-coverage'));

const incompleteConditions = review({ medications: ['paracetamol'], conditions: ['kidney disease'] });
assert.equal(incompleteConditions.coverage.conditionRuleCount, 0);
assert.equal(incompleteConditions.coverage.completeForRequest, false);
assert.ok(incompleteConditions.alerts.some(alert => alert.title === 'Condition coverage is limited'));

const duplicate = review({ medications: ['Panadol', 'paracetamol'] });
assert.ok(duplicate.alerts.some(alert => alert.type === 'duplicate-ingredient'));
assert.equal(duplicate.coverage.completeForRequest, false);
const allergy = review({ medications: ['amoxicillin'], allergies: ['penicillin'] });
assert.ok(allergy.alerts.some(alert => alert.type === 'allergy' && alert.ruleId === 'penicillin-class'));
const negatedAllergy = review({ medications: ['amoxicillin'], allergies: ['No penicillin allergy'] });
assert.ok(!negatedAllergy.alerts.some(alert => alert.type === 'allergy'));

assert.equal(resolveMedication('Nurofen 200 mg').ingredients[0]?.id, 'ibuprofen');
assert.equal(resolveMedication('Trisul').ingredients.map(item => item.id).sort().join(','), 'sulfamethoxazole,trimethoprim');
assert.equal(resolveMedication('Paracetamol + Codeine (Relieve)').ingredients.map(item => item.id).sort().join(','), 'paracetamol,pharmac-codeine-phosphate');
assert.equal(resolveMedication('Micreme H').ingredients.map(item => item.id).sort().join(','), 'pharmac-hydrocortisone,pharmac-miconazole');
assert.equal(resolveMedication('Nurofen 200 mg').strength.status, 'unverified');
assert.equal(resolveMedication({ name: 'Marevan', dose: '99 mg' }).strength.status, 'unverified');

console.log('Rights-filtered medication database verified: 5 retained prompts; excluded pairs and incomplete coverage remain unknown.');