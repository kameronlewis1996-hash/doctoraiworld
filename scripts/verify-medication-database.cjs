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
assert.equal(noKnownAlert.status, 'unknown');
assert.equal(noKnownAlert.coverage.terminologyComplete, true);
assert.equal(noKnownAlert.coverage.completeForRequest, false);
assert.match(noKnownAlert.disclaimer, /does not mean safe/i);

console.log('Medication database verification passed: curated interaction pairs, reversed ordering, aliases, duplicates, combination-brand fail-closed resolution, unknown coverage, and no-alert disclaimer');

// NZ terminology integrity and all published records: a conflicting identity
// remains unknown; never return a convenient partial ingredient set.
const nz = require('../data/medication/nz-pharmac-medicines.json');
const ids = new Set(nz.ingredients.map(i => i.id));
assert.equal(ids.size, nz.ingredients.length);
assert.equal(new Set(nz.products.map(p => p.id)).size, nz.products.length);
assert.ok(nz.products.length > 3000);
let mapped = 0;
for (const product of nz.products) {
  assert.ok(product.ingredients.every(id => ids.has(id)), product.name);
  const result = resolveMedication(product.name);
  if (!product.ingredientsComplete) assert.equal(result.status, 'unknown', product.name);
  if (result.status === 'resolved') {
    assert.equal(product.ingredientsComplete, true);
    assert.deepEqual(result.ingredients.map(i => i.id).sort(), [...new Set(product.ingredients)].sort(), product.name);
    mapped += 1;
  }
}
assert.ok(mapped > 3000);
for (const [name, expected] of [
  ['Marevan', ['warfarin']], ['Setrona', ['sertraline']],
  ['Trisul', ['trimethoprim','sulfamethoxazole']],
  ['Augmentin', ['amoxicillin','pharmac-clavulanic-acid']],
  ['Jardiamet', ['pharmac-empagliflozin','metformin']],
  ['Galvumet', ['pharmac-vildagliptin','metformin']],
  ['Coumadin 1.5 mg', ['warfarin']]
]) assert.deepEqual(resolveMedication(name).ingredients.map(i => i.id).sort(), expected.sort(), name);
assert.equal(resolveMedication('Douglas').status, 'unknown', 'Manufacturer name is ambiguous');
assert.equal(review({medications: ['']}).coverage.unknown, 1);
assert.equal(review({medications: ['']}).coverage.resolved, 0);
assert.ok(review({medications: ['Trisul','TMP']}).alerts.some(a => a.type === 'duplicate-ingredient'));
assert.ok(review({medications: ['Augmentin'],allergies: ['penicillin']}).alerts.some(a => a.type === 'allergy'));
for (const [meds, rule] of [
  [['Methotrexate','TMP'],'methotrexate-cotrimoxazole'],
  [['Priadel','Ibuprofen'],'lithium-nsaid'],
  [['Lithium carbonate','Lisinopril'],'lithium-ace-inhibitor'],
  [['Lithium carbonate','Losartan'],'lithium-arb'],
  [['Lithium carbonate','Hydrochlorothiazide'],'lithium-thiazide-diuretic'],
  [['Spironolactone','Lisinopril'],'spironolactone-ace-inhibitor'],
  [['Spironolactone','Losartan'],'spironolactone-arb'],
  [['Simvastatin','Clarithromycin'],'simvastatin-interacting-inhibitor'],
  [['Tramadol','Setrona'],'serotonergic-opioid-antidepressant'],
  [['Tramadol','Phenelzine'],'serotonergic-opioid-maoi']
]) { expectRule(meds, rule); expectRule(meds.slice().reverse(), rule); }
console.log(`NZ catalogue verification passed: ${mapped} mapped product/formulations, combinations, ambiguous names, duplicates and 13 sourced interaction rules.`);

const handler = require('../api/medication/safety.js');
function call(method, body) {
  const result = {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
  return handler({method,body},result).then(() => result);
}
(async () => {
  for (const body of [null, 'null', '{', {}, [], {medications:[]}, {medications:['']}, {medications:[{}]}, {medications:Array(51).fill('Warfarin')}, {medications:['Warfarin'],allergies:'penicillin'}]) assert.equal((await call('POST',body)).statusCode,400);
  assert.equal((await call('GET',{})).statusCode,405);
  const r = await call('POST',{medications:['Marevan','Nurofen']});
  assert.equal(r.statusCode,200);assert.equal(r.body.status,'red');assert.equal(r.headers['Cache-Control'],'no-store');
  assert.equal(r.body.coverage.completeForRequest,false);
  console.log('Endpoint verification passed: malformed/blank/oversized lists rejected without partial checks, no-store, and sourced alerts.');
})().catch(error => { console.error(error); process.exitCode=1; });
