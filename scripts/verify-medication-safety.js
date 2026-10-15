'use strict';

const assert = require('node:assert/strict');
const { review } = require('../server-src/medication/safety-engine.cjs');

const interaction = review({ medications: ['Marevan', 'Nurofen'] });
assert.equal(interaction.status, 'red');
assert.ok(interaction.alerts.some(alert => alert.ruleId === 'warfarin-nsaid'));
assert.equal(interaction.coverage.completeForRequest, false, 'A matched pair must not be described as a complete safety review');

const allergy = review({ medications: ['amoxicillin'], allergies: ['penicillin'] });
assert.equal(allergy.status, 'red');
assert.ok(allergy.alerts.some(alert => alert.type === 'allergy' && alert.ruleId === 'penicillin-class'));

for (const wording of [
  'no penicillin allergy',
  'not allergic to penicillin',
  'family history of penicillin allergy',
  'possible penicillin allergy',
  'uncertain penicillin allergy',
  'not sure whether penicillin allergy is present',
  'penicillin allergy?',
  'penicillin allergy ruled out'
]) {
  const result = review({ medications: ['amoxicillin'], allergies: [wording] });
  assert.equal(result.alerts.some(alert => alert.type === 'allergy'), false, `${wording} must not be treated as a positive personal allergy`);
  assert.equal(result.status, 'unknown', 'Limited coverage must remain unknown without a positive alert.');
  assert.equal(result.coverage.completeForRequest, false, 'A nonaffirmative allergy statement must not imply complete coverage.');
}

const mixedAllergyWording = review({ medications: ['amoxicillin', 'ibuprofen'], allergies: ['no penicillin allergy but ibuprofen rash'] });
assert.equal(mixedAllergyWording.alerts.some(alert => alert.ruleId === 'penicillin-class'), false, 'A negated first clause must not create a penicillin alert.');
assert.ok(mixedAllergyWording.alerts.some(alert => alert.type === 'allergy' && alert.message.includes('ibuprofen')), 'A positive clause after “but” must remain eligible for a direct ingredient alert.');

const uncoveredCondition = review({ medications: ['paracetamol'], conditions: ['kidney disease'] });
assert.equal(uncoveredCondition.status, 'unknown');
assert.equal(uncoveredCondition.coverage.completeForRequest, false);
assert.ok(uncoveredCondition.alerts.some(alert => alert.title === 'Condition risks are not covered'));

const unknownMedicine = review({ medications: ['synthetic unlisted tablet'] });
assert.equal(unknownMedicine.status, 'unknown');
assert.equal(unknownMedicine.coverage.unknown, 1);
assert.equal(unknownMedicine.coverage.completeForRequest, false);
assert.match(unknownMedicine.disclaimer, /Coverage remains limited/i);
assert.doesNotMatch(unknownMedicine.disclaimer, /No.*alerts?.*safe/i);

const noKnownAlert = review({ medications: ['paracetamol', 'cetirizine'] });
assert.equal(noKnownAlert.status, 'unknown');
assert.equal(noKnownAlert.coverage.completeForRequest, false);
assert.match(noKnownAlert.disclaimer, /does not mean safe/i);

console.log('Limited local medication check verified with synthetic names, allergies and conditions; uncovered scope stays unknown.');
