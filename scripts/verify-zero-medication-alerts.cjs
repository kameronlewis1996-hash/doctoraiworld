'use strict';
const assert = require('node:assert/strict');
const { evaluate } = require('../health-alerts.js');
const { describe } = require('../health-alert-status.js');
const { currentMedicines } = require('../medication-records.js');
const { review } = require('../server-src/medication/safety-engine.cjs');
const { Controller } = require('../medication-check-controller.js');
const now = new Date(2026, 9, 16, 12);
const med = (id, name, extra = {}) => ({ id, name, ...extra });
const zeroCases = [
  {}, { profile: { allergies: 'penicillin' } }, { profile: { conditions: 'asthma' } },
  { medications: [med('old', 'Marevan', { status: 'stopped' }), med('old2', 'Trisul', { active: false })] },
  { medications: [med('ended', 'Marevan', { endDate: '2026-10-15' }), med('future', 'Trisul', { startDate: '2026-10-17' })] },
  { existingCheck: { result: { status: 'red', alerts: [{ type: 'interaction', severity: 'high' }] } } }
];
for (const input of zeroCases) {
  const result = evaluate({ ...input, now });
  assert.equal(result.coverage.medications.active, 0);
  assert.equal(result.coverage.medicationMedication.requestedPairs, 0);
  assert.deepEqual(result.alerts, [], 'No medicine inputs must not generate medicine alerts');
  assert.equal(describe(result).level, 'neutral');
  assert.equal(describe(result).title, 'No current medicines');
  assert.doesNotMatch(describe(result).note, /safe together|cleared|no risk/i);
}
for (const input of [{ medications: [] }, { medications: [], allergies: ['penicillin'], conditions: ['asthma'] }]) {
  const result = review(input);
  assert.deepEqual(result.alerts, [], 'An empty direct medicine check must not emit medicine coverage notices');
  assert.equal(result.coverage.completeForRequest, false);
  assert.equal(result.coverage.terminologyComplete, false);
}
const independent = evaluate({ now, profile: { conditions: 'asthma' }, timeline: [{ id: 'breathing', type: 'symptom', source: 'symptom-diary', title: 'Severe difficulty breathing', date: '2026-10-16' }] });
assert.equal(describe(independent).level, 'red');
assert.match(describe(independent).note, /from saved symptom entries/);
assert.ok(independent.alerts.some(alert => alert.type === 'urgent-symptom'));
assert.ok(independent.alerts.every(alert => !alert.triggers.some(trigger => trigger.kind === 'medication')));
const conflict = evaluate({ now, profile: { bloodType: 'O+' }, memoryDetails: ['Blood type: AB negative'] });
assert.equal(describe(conflict).level, 'orange', 'Independent conflicting records still need review');
const pair = [med('one', 'Marevan'), med('two', 'Trisul')];
const flagged = evaluate({ now, medications: pair });
assert.equal(describe(flagged).level, 'red');
assert.ok(flagged.alerts.some(alert => alert.ruleId === 'warfarin-sulfamethoxazole'));
assert.equal(describe(evaluate({ now, medications: [pair[0]] })).level, 'orange');
assert.equal(describe(evaluate({ now, medications: [] })).level, 'neutral');
assert.ok(!evaluate({ now, medications: [pair[0], { ...pair[1], status: 'stopped' }] }).alerts.some(alert => alert.ruleId === 'warfarin-sulfamethoxazole'));
const unknown = evaluate({ now, medications: [med('unknown', 'Invented unmapped medicine')] });
assert.equal(describe(unknown).level, 'orange');
assert.ok(unknown.alerts.some(alert => alert.type === 'unknown-medication'));
const boundary = [med('today', 'one', { startDate: '2026-10-16', endDate: '2026-10-16' }), med('taken', 'two', { status: 'taken' }), med('missed', 'three', { status: 'missed' }), med('old', 'four', { status: 'discontinued' })];
assert.deepEqual(currentMedicines(boundary, now).map(item => item.id), ['today', 'taken', 'missed']);

(async () => {
  let saved = null, calls = 0;
  const version = flagged.coverage.rulesetVersion;
  const payload = { medications: [], allergies: ['penicillin'], conditions: ['asthma'] };
  const context = { owner: 'synthetic-a', profileIdentity: 'synthetic-profile', payload, rulesVersion: version, allowed: true, storageAllowed: true, loginId: 'synthetic-login' };
  // Even a deliberately malformed persisted red result bound to the empty
  // signature must never be emitted or sent for another check.
  saved = { version: 1, ownerHash: context.owner, profileHash: context.profileIdentity, signature: JSON.stringify([payload, version]), rulesVersion: version, consent: true, active: true, checkedAt: Date.now(), result: { status: 'red', alerts: [{ severity: 'high' }], resolved: [], coverage: { requested: 0 }, ruleset: { version } } };
  const emitted = [];
  const controller = new Controller({ request: async () => { calls++; throw new Error('No empty request expected'); }, hash: async value => value, load: () => saved, save: value => { saved = value; }, remove: () => { saved = null; }, onChange: state => emitted.push(state) });
  await controller.update(context);
  assert.equal(controller.snapshot().result, null);
  assert.equal(controller.snapshot().status, 'not_checked');
  assert.equal(saved.result, null, 'The old severity is cleared while the account keeps its own consent choice');
  assert.equal(saved.checkStatus, 'not_checked');
  assert.equal(calls, 0);
  assert.ok(emitted.every(state => state.result === null));
  await controller.update({ ...context, owner: 'synthetic-b', profileIdentity: 'other-profile' });
  assert.equal(controller.snapshot().result, null);
  assert.equal(controller.snapshot().consent, false);
  console.log('Zero-medicine lifecycle verified: neutral empty/allergy/condition/stopped states, no empty coverage warnings, independent alerts retained, first/pair/delete transitions, unresolved identities and stale-cache/account isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
