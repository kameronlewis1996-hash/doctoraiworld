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

for (const name of ['Panadol Extra', 'Nurofen Cold & Flu', 'Panadol with caffeine']) {
  const match = resolveMedication(name);
  assert.equal(match.status, 'unknown', `${name} must not be reduced to one ingredient`);
  assert.deepEqual(match.ingredients, []);
}

const unknown = review({ medications: ['unlisted tablet'] });
assert.equal(unknown.status, 'unknown');
assert.equal(unknown.coverage.completeForRequest, false);
assert.ok(unknown.alerts.some(alert => alert.type === 'unknown'));

const noKnownAlert = review({ medications: ['paracetamol', 'cetirizine'] });
assert.equal(noKnownAlert.status, 'no-known-alerts');
assert.match(noKnownAlert.disclaimer, /does not mean safe/i);

process.stdout.write('Medication database verification passed: curated interaction pairs, reversed ordering, aliases, duplicates, combination-brand fail-closed resolution, unknown coverage, and no-alert disclaimer.\\n');
