'use strict';

const assert = require('node:assert/strict');
const { review } = require('../server-src/medication/safety-engine.cjs');

const interaction = review({ medications: ['Marevan', 'Nurofen'] });
assert.equal(interaction.status, 'red');
assert.ok(interaction.alerts.some(alert => alert.ruleId === 'warfarin-nsaid'));
assert.equal(interaction.coverage.completeForRequest, false, 'A matched pair must not be described as a complete safety review');

const allergy = review({ medications: ['amoxicillin'], allergies: ['penicillin'] });
assert.equal(allergy.status, 'red');
assert.ok(allergy.alerts.some(alert => alert.type === 'allergy'));

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
