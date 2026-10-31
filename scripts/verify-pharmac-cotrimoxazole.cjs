'use strict';
// Synthetic records and pinned public catalogue terms only; no provider calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const seed = require('../data/medication/medication-safety.seed.json');
const catalogue = require('../data/medication/nz-pharmac-medicines.json');
const engine = require('../server-src/medication/safety-engine.cjs');
const source = fs.readFileSync(require.resolve('../server-src/medication/safety-engine.cjs'), 'utf8');
const sourceRows = catalogue.products.filter(p => /\[Co-trimoxazole\]/i.test(p.chemical || ''));
assert.equal(sourceRows.length, 5, 'Pinned Pharmac snapshot must supply the bracketed synonym');
assert.ok(sourceRows.every(p => p.ingredientsComplete && [...p.ingredients].sort().join('|') === 'sulfamethoxazole|trimethoprim'));
for (const name of ['Co-trimoxazole', 'Cotrimoxazole', 'co trimoxazole']) {
  const result = engine.resolveMedication(name);
  assert.equal(result.status, 'resolved');
  assert.equal(result.identityOnly, true, 'A source term must never become a confirmed package');
  assert.equal(result.labelIngredientsConfirmed, undefined);
  assert.deepEqual(result.ingredients.map(x => x.id).sort(), ['sulfamethoxazole', 'trimethoprim']);
  assert.equal(result.source.publisher, 'Pharmac Pharmaceutical Schedule');
  assert.equal(result.source.effectiveDate, '2026-10-01');
  for (const names of [[name, 'Marevan'], ['Marevan', name]]) {
    const check = engine.review({ medications: names });
    assert.ok(check.alerts.some(a => a.ruleId === 'warfarin-sulfamethoxazole' && a.severity === 'high'));
    assert.ok(check.alerts.some(a => a.ruleId === 'medication-pair-partial' && a.coverageState === 'partial'));
    assert.equal(check.coverage.completeForRequest, false);
    assert.match(check.disclaimer, /Coverage remains limited/);
  }
}
for (const name of ['Co-trimoxazole extra', 'trimoxazole', 'Bactrim', 'fictional unknown medicine']) {
  assert.equal(engine.resolveMedication(name).status, 'unknown', `${name} must not be guessed`);
  assert.ok(!engine.review({ medications: ['Marevan', name] }).alerts.some(a => a.ruleId === 'warfarin-sulfamethoxazole'));
}
const mismatch = engine.review({ medications: ['Marevan', { name: 'Co-trimoxazole', activeIngredients: ['trimethoprim'], activeIngredientsConfirmed: true }] });
assert.equal(mismatch.resolved[1].status, 'ingredient_mismatch');
assert.ok(!mismatch.alerts.some(a => a.ruleId === 'warfarin-sulfamethoxazole'));
const confirmed = engine.resolveMedication({ name: 'Co-trimoxazole', activeIngredients: ['trimethoprim', 'sulfamethoxazole'], activeIngredientsConfirmed: true });
assert.equal(confirmed.labelIngredientsConfirmed, true);
assert.equal(confirmed.basis, 'catalogue_and_confirmed_label');
const dose = engine.resolveMedication({ name: 'Co-trimoxazole', dose: '999 mg' });
assert.equal(dose.strength.status, 'unverified');
function withExtra(candidate) {
  const local = { exports: {} };
  const fakeCatalogue = { ...catalogue, products: [...catalogue.products, candidate] };
  const load = id => id.includes('medication-safety.seed') ? seed : id.includes('nz-pharmac-medicines') ? fakeCatalogue : (() => { throw Error(id); })();
  vm.runInNewContext(source, { module: local, require: load, console });
  return local.exports;
}
for (const [description, extra] of [
  ['conflicting candidate', { ...sourceRows[0], name: 'Fictional conflicting formulation', ingredients: ['trimethoprim'], ingredientsComplete: true }],
  ['incomplete candidate', { ...sourceRows[0], name: 'Fictional incomplete formulation', ingredients: ['trimethoprim'], ingredientsComplete: false }]
]) {
  const other = withExtra(extra);
  assert.equal(other.resolveMedication('Co-trimoxazole').status, 'unknown', description + ' must fail closed');
  assert.ok(!other.review({ medications: ['Marevan', 'Co-trimoxazole'] }).alerts.some(a => a.ruleId === 'warfarin-sulfamethoxazole'));
}
console.log('Pharmac Co-trimoxazole synonym: 5 source rows, punctuation variants, supported warning, partial coverage, confirmation, mismatch, negatives and ambiguous/incomplete candidates passed.');
