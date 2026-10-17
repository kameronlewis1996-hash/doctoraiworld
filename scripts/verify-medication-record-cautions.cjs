'use strict';

// Fictional records only. Exercise the actual browser helpers without storage,
// authentication, network requests, or a clinical medicine assessment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { currentMedicines } = require('../medication-records.js');
const healthAlerts = require('../health-alerts.js');
const terminology = require('../term-catalogues.js');
const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function between(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Production helpers are present: ${start.trim()}`);
  return source.slice(first, last);
}

const splitDetails = source.match(/^  const splitDetails = .+$/m)?.[0];
assert.ok(splitDetails, 'Use the browser profile detail splitter.');
const context = vm.createContext({
  state: { medications: [], profile: {} },
  window: { DoctorAITerminology: terminology },
  currentMedicationRecords: () => currentMedicines(context.state.medications, new Date(2026, 9, 17, 12))
});
vm.runInContext([
  splitDetails,
  between('  function normalizeMedicationKey(', '  function renderTasks('),
  between('  function medicationTextKey(', '  function medicationSafetyMarkup(')
].join('\n'), context, { filename: 'health-hub.js:medication-record-cautions' });

const medicine = (extra = {}) => ({
  id: 'fictional-amber', name: 'Fictional amber tablet', dose: '10 mg',
  activeIngredients: [], activeIngredientsManuallyConfirmed: false, ...extra
});
const possibleReaction = (extra = {}) => ({
  id: 'custom:fictional-amber', substance: 'Fictional amber tablet',
  reactionId: 'custom:observation', reaction: 'Fictional observation',
  certainty: 'suspected', source: 'user', medicationId: 'fictional-amber', ...extra
});

function evaluate(medications, profile = {}, target = medications[0] || medicine()) {
  context.state = { medications, profile: { conditions: '', notes: '', allergies: '', ...profile } };
  const before = clone(context.state);
  const result = clone({
    alerts: context.medicationSafetyAlerts(target),
    notes: context.medicationProfileNoteMatches(target),
    reactions: context.medicationRecordedReactions(target)
  });
  assert.deepEqual(context.state, before, 'Reading cautions, notes and reactions must preserve every saved field.');
  return result;
}

let checks = 0;
function check(description, run) { run(); checks += 1; }
function noCautions(result, description) { assert.deepEqual(result.alerts, [], description); }
function allergyCaution(result) {
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].severity, 'caution');
  assert.match(result.alerts[0].title, /allergy|reaction/i);
  assert.match(result.alerts[0].source, /saved health profile/i);
}

check('neutral full-name profile notes are retrievable without a safety caution', () => {
  const result = evaluate([medicine()], {
    conditions: 'Fictional amber tablet discussed at a routine appointment',
    notes: 'I keep Fictional amber tablet in the original package.'
  });
  noCautions(result);
  assert.ok(result.notes.length > 0, 'A neutral medicine mention remains accessible as saved profile text.');
  assert.match(JSON.stringify(result.notes), /original package|routine appointment/);
  assert.deepEqual(result.reactions, []);
});

check('profile note matching respects whole normalized phrases', () => {
  const result = evaluate([medicine()], { notes: 'Fictional amber tablets are mentioned here.' });
  noCautions(result);
  assert.deepEqual(result.notes, [], 'A partial word must not attach the profile note to this medicine.');
});

check('partial-word legacy allergy labels do not create a caution', () => {
  for (const allergies of ['amb', 'Fictional amber tablets']) {
    noCautions(evaluate([medicine()], { allergies }), allergies);
  }
});

check('whole-phrase allergy matching preserves a brand name with saved strength text', () => {
  for (const [name, allergies] of [
    ['FictionalMed', 'FictionalMed 10mg tablet'],
    ['FictionalMed 10mg tablet', 'FictionalMed']
  ]) {
    allergyCaution(evaluate([medicine({ name })], { allergies }));
  }
  for (const [name, allergies] of [
    ['FictionalMed', 'FictionalMedication'],
    ['FictionalMedication', 'FictionalMed'],
    ['FictionalMed', 'FictionalMedication 10mg tablet']
  ]) {
    noCautions(evaluate([medicine({ name })], { allergies }), 'A shared letter prefix is not a whole-name phrase match.');
  }
});

check('an exact normalized legacy allergy retains its unverified caution', () => {
  allergyCaution(evaluate([medicine()], { allergies: '  FICTIONAL AMBER TABLET (fictional observation)  ' }));
});

check('a raw legacy allergy remains available when the structured collection is empty', () => {
  allergyCaution(evaluate([medicine()], {
    allergies: 'Fictional amber tablet', allergyEntries: []
  }));
});

check('an exact structured confirmed allergy retains a caution', () => {
  allergyCaution(evaluate([medicine()], {
    allergyEntries: [possibleReaction({ certainty: 'confirmed', substance: '  FICTIONAL AMBER TABLET  ' })]
  }));
});

check('an explicitly linked possible reaction stays informational', () => {
  const recorded = possibleReaction();
  const result = evaluate([medicine()], { allergyEntries: [recorded] });
  noCautions(result, 'A possible reaction must not enter the local orange caution path.');
  assert.equal(result.reactions.length, 1);
  assert.equal(result.reactions[0].reaction, recorded.reaction);
  assert.equal(result.reactions[0].certainty, 'suspected');
  assert.equal(result.reactions[0].source, 'user');
  assert.equal(result.reactions[0].medicationId, 'fictional-amber');
});

check('neutral notes and possible reactions do not change the separate health-alert result', () => {
  const medications = [medicine()];
  const now = new Date('2026-10-17T12:00:00Z');
  const review = profile => healthAlerts.evaluate({ medications, profile, now });
  const baseline = review({});
  const neutral = review({ notes: 'Fictional amber tablet is in my saved list.' });
  const possible = review({
    notes: 'Fictional amber tablet is in my saved list.',
    allergyEntries: [possibleReaction()],
    allergies: terminology.compatibilityFields([], [possibleReaction()]).allergies
  });
  const signature = result => result.alerts.map(alert => `${alert.type}|${alert.severity}|${alert.title}`);
  assert.deepEqual(signature(neutral), signature(baseline));
  assert.deepEqual(signature(possible), signature(baseline));
  assert.equal(possible.coverage.allergyMedication.affirmative, 0);
  assert.ok(baseline.alerts.some(alert => alert.type === 'unknown-medication'), 'Unknown product coverage remains visible independently of notes.');
});

check('structured suspected certainty takes precedence over a stale compatibility string', () => {
  noCautions(evaluate([medicine()], {
    allergies: 'Fictional amber tablet', allergyEntries: [possibleReaction()]
  }));
});

check('a confirmed allergy remains a caution alongside a possible reaction for the same substance', () => {
  const result = evaluate([medicine()], { allergyEntries: [
    possibleReaction(),
    possibleReaction({ id: 'custom:confirmed-amber', certainty: 'confirmed', medicationId: '' })
  ] });
  allergyCaution(result);
  assert.equal(result.reactions.length, 1);
  assert.equal(result.reactions[0].certainty, 'suspected');
});

check('unrelated raw legacy allergy and linked possible reaction both remain available', () => {
  const amber = medicine();
  const blue = medicine({ id: 'fictional-blue', name: 'Fictional blue capsule' });
  const medications = [amber, blue];
  const profile = { allergies: 'Fictional blue capsule', allergyEntries: [possibleReaction()] };
  allergyCaution(evaluate(medications, profile, blue));
  const result = evaluate(medications, profile, amber);
  noCautions(result);
  assert.equal(result.reactions.length, 1);
  assert.equal(result.reactions[0].medicationId, amber.id);
});

check('a possible reaction cannot attach through an absent or different record link', () => {
  for (const medicationId of ['', 'fictional-other']) {
    const result = evaluate([medicine()], { allergyEntries: [possibleReaction({ medicationId })] });
    noCautions(result);
    assert.deepEqual(result.reactions, []);
  }
});

check('a linked possible reaction still requires the complete normalized saved name', () => {
  for (const substance of ['amber', 'Fictional amber tablet plus']) {
    const result = evaluate([medicine()], { allergyEntries: [possibleReaction({ substance })] });
    noCautions(result);
    assert.deepEqual(result.reactions, []);
  }
  const result = evaluate([medicine()], { allergyEntries: [possibleReaction({ substance: '  FICTIONAL AMBER TABLET  ' })] });
  assert.equal(result.reactions.length, 1, 'Case and surrounding whitespace do not change an explicit link.');
});

check('renaming a saved medicine does not relink the older possible reaction', () => {
  const result = evaluate([medicine({ name: 'Fictional blue capsule' })], { allergyEntries: [possibleReaction()] });
  noCautions(result);
  assert.deepEqual(result.reactions, []);
});

check('a confirmed combination ingredient can match beyond the first label ingredient', () => {
  allergyCaution(evaluate([medicine({
    activeIngredients: ['fictional first ingredient', 'fictional second ingredient'],
    activeIngredientsManuallyConfirmed: true
  })], { allergies: 'Fictional second ingredient' }));
});

check('unconfirmed ingredient text cannot create an allergy caution', () => {
  for (const confirmation of [{}, { activeIngredientsManuallyConfirmed: false }, { activeIngredientsConfirmed: true }]) {
    noCautions(evaluate([medicine({ activeIngredients: ['fictional second ingredient'], ...confirmation })], {
      allergies: 'Fictional second ingredient'
    }));
  }
});

check('duplicate and repeated confirmed ingredient cautions remain available', () => {
  let first = medicine();
  let result = evaluate([first, medicine({ id: 'fictional-duplicate' })], {}, first);
  assert.ok(result.alerts.some(alert => /duplicate/i.test(alert.title)));
  first = medicine({ activeIngredients: ['fictional shared ingredient'], activeIngredientsManuallyConfirmed: true });
  result = evaluate([first, medicine({
    id: 'fictional-blue', name: 'Fictional blue capsule',
    activeIngredients: ['fictional shared ingredient'], activeIngredientsManuallyConfirmed: true
  })], {}, first);
  assert.ok(result.alerts.some(alert => /repeated.*ingredient/i.test(alert.title)));
});

check('empty, removed and inactive medicine records produce no attached cautions or reactions', () => {
  const profile = { allergies: 'Fictional amber tablet', allergyEntries: [possibleReaction()] };
  const removed = medicine();
  let result = evaluate([], profile, removed);
  noCautions(result);
  assert.deepEqual(result.reactions, []);
  for (const inactive of [{ status: 'stopped' }, { active: false }, { deleted: true }, { endDate: '2026-10-16' }]) {
    const record = medicine(inactive);
    result = evaluate([record], profile, record);
    noCautions(result);
    assert.deepEqual(result.reactions, []);
  }
});

check('unknown medicine identity and saved provenance are preserved during presentation', () => {
  const record = medicine({
    matchState: 'unknown', scanFieldsReviewed: false,
    review: { fields: { name: { status: 'extracted', confidence: 'not_reported' } } },
    source: { kind: 'user-entered', status: 'unverified' }, notes: 'Fictional medicine note'
  });
  const result = evaluate([record], { notes: 'Fictional amber tablet is in my saved list.' });
  noCautions(result);
  assert.deepEqual(result.reactions, []);
  assert.equal(record.matchState, 'unknown');
  assert.equal(record.review.fields.name.confidence, 'not_reported');
  assert.equal(record.scanFieldsReviewed, false);
});

console.log(`Medication record cautions verified: ${checks} focused synthetic checks passed.`);
