'use strict';

const assert = require('node:assert/strict');
const { review } = require('../server-src/medication/safety-engine.cjs');

const interaction = review({ medications: ['Marevan', 'Nurofen'] });
assert.deepEqual(interaction.resolved.map(item => item.status), ['resolved', 'resolved']);
assert.equal(interaction.status, 'unknown');
assert.equal(interaction.coverage.requestedPairs, 1);
assert.equal(interaction.coverage.assessedPairs, 0);
assert.equal(interaction.coverage.unassessedPairs, 1);
assert.ok(interaction.alerts.some(alert => alert.type === 'interaction-coverage' && alert.severity === 'unknown' && /unassessed/i.test(alert.message)));
assert.equal(interaction.coverage.completeForRequest, false, 'A matched pair must not be described as a complete safety review');

const retainedInteraction = review({ medications: ['Marevan', 'Trisul'] });
assert.equal(retainedInteraction.status, 'red');
assert.ok(retainedInteraction.alerts.some(alert => alert.ruleId === 'warfarin-sulfamethoxazole'));

const allergy = review({ medications: ['amoxicillin'], allergies: ['penicillin'] });
assert.equal(allergy.status, 'red');
assert.ok(allergy.alerts.some(alert => alert.type === 'allergy'));

const uncoveredCondition = review({ medications: ['paracetamol'], conditions: ['kidney disease'] });
assert.equal(uncoveredCondition.status, 'unknown');
assert.equal(uncoveredCondition.coverage.completeForRequest, false);
assert.ok(uncoveredCondition.alerts.some(alert => alert.title === 'Condition coverage is limited'));

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

const resolvedButUnassessedPair = review({ medications: ['warfarin', 'ibuprofen'] });
assert.deepEqual(resolvedButUnassessedPair.resolved.map(item => item.status), ['resolved', 'resolved']);
assert.equal(resolvedButUnassessedPair.status, 'unknown');
assert.equal(resolvedButUnassessedPair.coverage.completeForRequest, false);
assert.ok(!resolvedButUnassessedPair.alerts.some(alert => alert.ruleId === 'warfarin-nsaid'));
assert.ok(resolvedButUnassessedPair.alerts.some(alert => alert.type === 'interaction-coverage' && alert.severity === 'unknown' && /unassessed/i.test(alert.message)));

console.log('Limited local medication check verified with synthetic names, allergies and conditions; uncovered scope stays unknown.');
