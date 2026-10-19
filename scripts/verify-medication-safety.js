'use strict';

const assert = require('node:assert/strict');
const { review } = require('../server-src/medication/safety-engine.cjs');
const pharmac = require('../data/medication/nz-pharmac-medicines.json');
const exclusions = require('../docs/medication-provenance-exclusions.json');

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
assert.ok(allergy.alerts.some(alert => alert.ruleId === 'penicillin-class'), 'The exact common class label still triggers the curated penicillin prompt');

const penicillinase = review({ medications: ['amoxicillin'], allergies: ['penicillinase'] });
assert.ok(!penicillinase.alerts.some(alert => alert.type === 'allergy'), 'A longer unrelated word must not match the penicillin class label');

const directIngredientAlias = review({ medications: ['amoxicillin'], allergies: ['amoxycillin'] });
assert.ok(directIngredientAlias.alerts.some(alert => alert.type === 'allergy'), 'An exact ingredient alias still matches a recorded allergy');

const directIngredientSubstring = review({ medications: ['amoxicillin'], allergies: ['amoxycillinase'] });
assert.ok(!directIngredientSubstring.alerts.some(alert => alert.type === 'allergy'), 'An ingredient alias embedded in a longer word must not match');

const nsaidClass = review({ medications: ['ibuprofen'], allergies: ['NSAIDs'] });
assert.ok(nsaidClass.alerts.some(alert => alert.ruleId === 'nsaid-class'), 'The exact common plural NSAID label still triggers its curated class prompt');

const nsaidSubstring = review({ medications: ['ibuprofen'], allergies: ['nonNSAIDish'] });
assert.ok(!nsaidSubstring.alerts.some(alert => alert.type === 'allergy'), 'A class label embedded in a longer token must not match');

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

const voltarenSuppository = pharmac.products.find(item => item.id === 'pharmac-27fe3db7fbaac919');
const ibuprofenTablet = pharmac.products.find(item => item.id === 'pharmac-34fe78bf9d3ca1b3');
assert.equal(voltarenSuppository.name, 'Voltaren — Diclofenac sodium — Suppos 100 mg');
assert.equal(voltarenSuppository.interactionRoute, 'systemic', 'The suppository is tagged systemic for rule scope, not administration verification');
assert.equal(ibuprofenTablet.interactionRoute, 'oral');
assert.deepEqual(voltarenSuppository.ingredients, ['diclofenac']);
assert.deepEqual(ibuprofenTablet.ingredients, ['ibuprofen']);
assert.equal(exclusions.exclusions.interactionRules.find(item => item.id === 'systemic-nonaspirin-nsaid-duplicate-toxicity')?.reason, 'reuse-status-unverified-or-conditional');

for (const labelConfirmed of [false, true]) {
  const pair = review({ medications: [
    { name: voltarenSuppository.name, ...(labelConfirmed ? { activeIngredients: ['Diclofenac sodium'], activeIngredientsConfirmed: true } : {}) },
    { name: ibuprofenTablet.name, ...(labelConfirmed ? { activeIngredients: ['Ibuprofen'], activeIngredientsConfirmed: true } : {}) }
  ] });
  assert.equal(pair.status, 'unknown', 'This exact pair must remain unknown, not green or a clinical warning');
  assert.equal(pair.coverage.requestedPairs, 1);
  assert.equal(pair.coverage.assessedPairs, 0);
  assert.equal(pair.coverage.unassessedPairs, 1);
  assert.deepEqual(pair.resolved.map(item => item.status), ['resolved', 'resolved']);
  assert.deepEqual(pair.resolved.map(item => item.possibleInteractionRoutes[0]), ['systemic', 'oral']);
  assert.ok(pair.alerts.some(item => item.type === 'interaction-coverage' && item.severity === 'unknown' && /This pair is unassessed/i.test(item.message)));
  assert.ok(!pair.alerts.some(item => ['interaction', 'contraindication'].includes(item.type)), 'Excluded NSAID duplicate evidence must not be activated');
}

console.log('Limited local medication check verified with synthetic names, allergies and conditions; uncovered scope stays unknown.');
