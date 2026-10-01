'use strict';

const assert = require('node:assert/strict');
const { review, resolveMedication } = require('../server-src/medication/safety-engine.cjs');

function expectRule(medications, ruleId) {
  const result = review({ medications });
  assert.equal(result.status, 'red', `${medications.join(' + ')} should require review`);
  assert.ok(result.alerts.some(alert => alert.ruleId === ruleId), `${ruleId} should be reported`);
}

expectRule(['warfarin', 'ibuprofen'], 'warfarin-nsaid');
expectRule(['Nurofen', 'Coumadin'], 'warfarin-nsaid');
expectRule(['GTN', 'sildenafil'], 'pde5-nitrate');
expectRule(['phenelzine', 'sertraline'], 'ssri-maoi');
expectRule(['co-trimoxazole', 'methotrexate'], 'methotrexate-cotrimoxazole');
expectRule(['ibuprofen', 'warfarin'], 'warfarin-nsaid');

assert.equal(resolveMedication('Nurofen 200 mg').ingredients[0]?.id, 'ibuprofen');
assert.equal(resolveMedication('acetaminophen').ingredients[0]?.id, 'paracetamol');
assert.ok(review({ medications: ['Panadol', 'paracetamol'] }).alerts.some(alert => alert.type === 'duplicate-ingredient'));
assert.ok(review({ medications: ['amoxicillin'], allergies: ['penicillin'] }).alerts.some(alert => alert.type === 'allergy'));
assert.ok(review({ medications: ['ibuprofen'], allergies: ['NSAID'] }).alerts.some(alert => alert.type === 'allergy'));

for (const name of ['Panadol Extra', 'Nurofen Cold & Flu', 'Panadol with caffeine']) {
  const match = resolveMedication(name);
  assert.equal(match.status, 'unknown', `${name} must not be reduced to one ingredient`);
  assert.deepEqual(match.ingredients, []);
}

const uncoveredCondition = review({ medications: ['paracetamol'], conditions: ['kidney disease'] });
assert.equal(uncoveredCondition.status, 'unknown');
assert.equal(uncoveredCondition.coverage.completeForRequest, false);
assert.ok(uncoveredCondition.alerts.some(alert => alert.title === 'Condition risks are not covered'));

const unknown = review({ medications: ['unlisted tablet'] });
assert.equal(unknown.status, 'unknown');
assert.equal(unknown.coverage.completeForRequest, false);
assert.ok(unknown.alerts.some(alert => alert.type === 'unknown'));

const noKnownAlert = review({ medications: ['paracetamol', 'cetirizine'] });
assert.equal(noKnownAlert.status, 'no-known-alerts');
assert.match(noKnownAlert.disclaimer, /does not mean safe/i);

console.log('Medication database verification passed: curated interaction pairs, reversed ordering, aliases, duplicates, combination-brand fail-closed resolution, unknown coverage, and no-alert disclaimer');


// Input boundaries, conservative normalization, and complete-list regression checks.
for (const name of [' NUROFEN® 200mg tablets ', 'ibuprofen 200 mg caps', 'ibuprofen 100mg/5ml oral suspension']) {
  assert.equal(resolveMedication(name).ingredients[0]?.id, 'ibuprofen');
}
assert.equal(resolveMedication('warfarin 0.5 mg tablets').strength, '0.5 mg');
for (const value of [null, 42, {}, '', 'w4rfarin', 'Panadol Extra 500mg tablets']) assert.equal(resolveMedication(value).status, 'unknown');
for (const body of [null, [], {}, { medications: [] }, { medications: [''] }, { medications: [null] }, { medications: ['warfarin'], allergies: 'none' }, { medications: Array(51).fill('warfarin') }]) assert.throws(() => review(body), TypeError);
const multi = review({ medications: ['paracetamol + ibuprofen', 'warfarin', 'Panadol'] });
assert.equal(multi.resolved[0].ingredients.length, 2);
assert.ok(multi.alerts.some(a => a.ruleId === 'warfarin-nsaid'));
assert.ok(multi.alerts.some(a => a.type === 'duplicate-ingredient'));
assert.equal(resolveMedication('ibuprofen + unknown-medicine').status, 'unknown');
const brands = review({ medications: ['Nurofen', 'Brufen'] });
assert.equal(brands.status, 'yellow');
assert.ok(brands.alerts.some(a => a.type === 'duplicate-ingredient' && a.level === 'YELLOW'));
const list = review({ medications: ['cetirizine', 'paracetamol', 'metformin', 'warfarin', 'ibuprofen', 'naproxen'] });
assert.equal(list.coverage.medicationPairsEvaluated, 15);
assert.equal(list.alerts.filter(a => a.ruleId === 'warfarin-nsaid').length, 2);
assert.ok(list.alerts.some(a => a.type === 'same-class'));
const interaction = list.alerts.find(a => a.ruleId === 'warfarin-nsaid');
assert.equal(interaction.level, 'RED');
assert.equal(interaction.severity, 'high');
assert.deepEqual(interaction.medicationIndexes, [3, 4]);
assert.ok(interaction.source && interaction.nextStep && interaction.activeIngredients.length === 2);
assert.equal(list.coverage.doseAssessment, 'Unable to determine from available data');
assert.equal(review({ medications: ['warfarin', 'unknown'] }).status, 'unknown');

(async () => {
  const handler = require('../api/medication/safety.js');
  for (const [method, body, expected] of [['POST', null, 400], ['POST', '{', 400], ['POST', { medications: Array(51).fill('warfarin') }, 400], ['POST', { medications: ['warfarin', 'ibuprofen'] }, 200], ['GET', {}, 405]]) {
    const response = { setHeader() {}, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method, body }, response);
    assert.equal(response.code, expected);
    if (expected === 400) assert.equal(response.body.alerts, undefined);
  }
  console.log('Expanded regression checks passed: normalization, multi-ingredient lists, all 15 pairs, severity, classes, malformed/oversized API inputs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
