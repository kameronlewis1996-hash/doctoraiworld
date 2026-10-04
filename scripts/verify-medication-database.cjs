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

const core = require('../server-src/_lib/doctorai-core.cjs');
const originalCore = {
  identityFromRequest: core.identityFromRequest,
  storageConfigured: core.storageConfigured,
  activeEntitlement: core.activeEntitlement
};
let account = { sub: 'synthetic-test-account', email: 'synthetic@example.invalid' };
let storageReady = true;
let entitlement = { tier: 'pro', exp: Math.floor(Date.now() / 1000) + 600 };
let entitlementError = false;
let entitlementCalls = 0;
core.identityFromRequest = async () => account;
core.storageConfigured = () => storageReady;
core.activeEntitlement = async () => {
  entitlementCalls += 1;
  if (entitlementError) throw new Error('synthetic entitlement service outage');
  return entitlement;
};
const handler = require('../api/medication/safety.js');
function call(method, body) {
  const result = {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
  return handler({method,body},result).then(() => result);
}
(async () => {
  for (const body of [null, 'null', '{', {}, [], {medications:[]}, {medications:['']}, {medications:[{}]}, {medications:Array(31).fill('Warfarin'),consent:true}, {medications:['Warfarin'],allergies:'penicillin',consent:true}]) assert.equal((await call('POST',body)).statusCode,400);
  assert.equal((await call('GET',{})).statusCode,405);
  let beforeEntitlement = entitlementCalls;
  account = null;
  let r = await call('POST',{consent:true,medications:['Marevan']});
  assert.equal(r.statusCode,401);assert.equal(r.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal(entitlementCalls,beforeEntitlement,'Unauthenticated requests must stop before entitlement lookup.');

  account = { sub: 'synthetic-test-account', email: 'synthetic@example.invalid' };
  storageReady = false;
  beforeEntitlement = entitlementCalls;
  r = await call('POST',{consent:true,medications:['Marevan']});
  assert.equal(r.statusCode,503);assert.equal(entitlementCalls,beforeEntitlement,'Unconfigured storage must fail closed before entitlement lookup.');

  storageReady = true;
  for (const inactive of [null, {tier:'free',exp:Math.floor(Date.now()/1000)+600}, {tier:'pro'}, {tier:'pro',exp:'invalid'}, {tier:'pro',exp:Math.floor(Date.now()/1000)-1}, {tier:'pro',exp:Math.floor(Date.now()/1000)+600,revokedAt:Date.now()}]) {
    entitlement = inactive;
    r = await call('POST',{consent:true,medications:['Marevan']});
    assert.equal(r.statusCode,403,'Missing, non-Pro, expired and revoked entitlements must fail closed.');
  }

  entitlement = {tier:'pro',exp:Math.floor(Date.now()/1000)+600};
  entitlementError = true;
  r = await call('POST',{consent:true,medications:['Marevan']});
  assert.equal(r.statusCode,503,'Entitlement service failures must fail closed.');
  entitlementError = false;

  r = await call('POST',{medications:['Marevan','Nurofen']});
  assert.equal(r.statusCode,400);assert.match(r.body.error,/consent/i,'Consent must be explicit at the server boundary.');
  r = await call('POST',{consent:true,medications:['Marevan','Nurofen']});
  assert.equal(r.statusCode,200);assert.equal(r.body.status,'red');assert.equal(r.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal(r.body.coverage.completeForRequest,false);
  console.log('Endpoint verification passed: synthetic auth/secure-storage/active-Pro/consent gates, expired and revoked access rejected, malformed/oversized lists rejected without partial checks, no-store, and sourced alerts.');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => {
  core.identityFromRequest = originalCore.identityFromRequest;
  core.storageConfigured = originalCore.storageConfigured;
  core.activeEntitlement = originalCore.activeEntitlement;
});
