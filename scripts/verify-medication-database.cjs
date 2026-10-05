'use strict';

const assert = require('node:assert/strict');
const { review, resolveMedication } = require('../server-src/medication/safety-engine.cjs');

function expectRule(medications, ruleId) {
  const result = review({ medications });
  assert.equal(result.status, 'red', `${medications.join(' + ')} should require review`);
  const alert = result.alerts.find(item => item.ruleId === ruleId);
  assert.ok(alert, `${ruleId} should be reported`);
  assert.equal(alert.recordVersion, 1, `${ruleId} should have a versioned record`);
  assert.ok(alert.source?.url, `${ruleId} should link to its source`);
  assert.ok(alert.evidenceSummary, `${ruleId} should explain the linked evidence`);
}

expectRule(['warfarin', 'ibuprofen'], 'warfarin-nsaid');
expectRule(['Nurofen', 'Coumadin'], 'warfarin-nsaid');
expectRule(['GTN', 'sildenafil'], 'pde5-nitrate');
expectRule(['phenelzine', 'sertraline'], 'ssri-maoi');
expectRule(['co-trimoxazole', 'methotrexate'], 'methotrexate-cotrimoxazole');
expectRule(['ibuprofen', 'warfarin'], 'warfarin-nsaid');

assert.equal(resolveMedication('Nurofen 200 mg').ingredients[0]?.id, 'ibuprofen');
assert.equal(resolveMedication('Nurofen 200 mg').strength.status, 'unverified', 'Brand alias matches must not imply the numeric strength was verified.');
assert.equal(resolveMedication({name:'Marevan',dose:'1 mg'}).strength.status, 'listed_match');
assert.equal(resolveMedication({name:'Marevan',dose:'99 mg'}).strength.status, 'unverified', 'A strength absent from the catalogue must remain unverified.');
assert.equal(resolveMedication('acetaminophen').ingredients[0]?.id, 'paracetamol');
assert.ok(review({ medications: ['Panadol', 'paracetamol'] }).alerts.some(alert => alert.type === 'duplicate-ingredient'));
assert.ok(review({ medications: ['amoxicillin'], allergies: ['penicillin'] }).alerts.some(alert => alert.type === 'allergy'));
assert.ok(review({ medications: ['ibuprofen'], allergies: ['NSAID'] }).alerts.some(alert => alert.type === 'allergy'));
const labelConfirmedPair = review({medications:[
  {name:'Marevan',dose:'1 mg',activeIngredients:['warfarin'],activeIngredientsConfirmed:true},
  {name:'Nurofen',dose:'2000 mg',activeIngredients:['ibuprofen'],activeIngredientsConfirmed:true}
]});
assert.equal(labelConfirmedPair.status,'red');
assert.ok(labelConfirmedPair.alerts.some(alert=>alert.ruleId==='warfarin-nsaid'));
assert.equal(labelConfirmedPair.coverage.confirmedLabels,2);
assert.equal(labelConfirmedPair.coverage.strengthListed,1);
assert.equal(labelConfirmedPair.coverage.strengthUnverified,1);
assert.equal(labelConfirmedPair.coverage.doseAssessment,'not_performed');
assert.ok(labelConfirmedPair.alerts.some(alert=>alert.type==='strength-review' && /no dose-level check/i.test(alert.message)));
const mismatchedLabel = review({medications:[{name:'Nurofen',dose:'200 mg',activeIngredients:['paracetamol'],activeIngredientsConfirmed:true}]});
assert.equal(mismatchedLabel.coverage.resolved,0,'A name/label discrepancy must withhold ingredient-based results.');
assert.equal(mismatchedLabel.resolved[0].status,'ingredient_mismatch');
const unconfirmedTerms = review({medications:[{name:'unlisted tablet',activeIngredients:['warfarin'],activeIngredientsConfirmed:false}]});
assert.equal(unconfirmedTerms.coverage.unknown,1,'Unconfirmed label text must not resolve an unknown medicine.');
assert.ok(review({medications:[{name:'Nurofen',dose:'200 mg',activeIngredients:['ibuprofen'],activeIngredientsConfirmed:true},{name:'ibuprofen',activeIngredients:['ibuprofen'],activeIngredientsConfirmed:true}]}).alerts.some(alert=>alert.type==='duplicate-ingredient'));

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
assert.equal(noKnownAlert.ruleset.version,'2026.10.05-r1');
assert.equal(noKnownAlert.ruleset.recordSchemaVersion,1);
assert.equal(noKnownAlert.ruleset.interactionRuleCount,13);

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
  activeEntitlement: core.activeEntitlement,
  reportError: core.reportError
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
let providerFailureReported = false;
core.reportError = event => { if (event === 'medication_safety_provider_error') providerFailureReported = true; };
const handler = require('../api/medication/safety.js');
function call(method, body) {
  const result = {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
  return handler({method,body},result).then(() => result);
}
(async () => {
  const serviceFailureCases = [];
  for (const body of [null, 'null', '{', {}, [], {medications:[]}, {medications:['']}, {medications:[{}]}, {medications:Array(31).fill('Warfarin'),consent:true}, {medications:['Warfarin'],allergies:'penicillin',consent:true}]) assert.equal((await call('POST',body)).statusCode,400);
  assert.equal((await call('GET',{})).statusCode,405);
  let beforeEntitlement = entitlementCalls;
  account = null;
  let r = await call('POST',{consent:true,medications:['Marevan']});
  assert.equal(r.statusCode,401);assert.equal(r.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal(r.body.errorCode,'authentication_required');
  assert.equal(entitlementCalls,beforeEntitlement,'Unauthenticated requests must stop before entitlement lookup.');

  account = { sub: 'synthetic-test-account', email: 'synthetic@example.invalid' };
  storageReady = false;
  beforeEntitlement = entitlementCalls;
  r = await call('POST',{consent:true,medications:['Marevan']});
  assert.equal(r.statusCode,503);assert.equal(entitlementCalls,beforeEntitlement,'Unconfigured storage must fail closed before entitlement lookup.');
  assert.equal(r.body.errorCode,'secure_storage_unavailable');

  storageReady = true;
  for (const inactive of [null, {tier:'free',exp:Math.floor(Date.now()/1000)+600}, {tier:'pro'}, {tier:'pro',exp:'invalid'}, {tier:'pro',exp:Math.floor(Date.now()/1000)-1}, {tier:'pro',exp:Math.floor(Date.now()/1000)+600,revokedAt:Date.now()}]) {
    entitlement = inactive;
    r = await call('POST',{consent:true,medications:['Marevan']});
    assert.equal(r.statusCode,403,'Missing, non-Pro, expired and revoked entitlements must fail closed.');
    assert.equal(r.body.errorCode,'pro_entitlement_required');
  }

  entitlement = {tier:'pro',exp:Math.floor(Date.now()/1000)+600};
  entitlementError = true;
  r = await call('POST',{consent:true,medications:['Marevan']});
  assert.equal(r.statusCode,503,'Entitlement service failures must fail closed.');
  assert.equal(r.headers['Cache-Control'],'no-store, max-age=0');
  serviceFailureCases.push({name:'entitlement service outage',status:r.statusCode});
  entitlementError = false;

  r = await call('POST',{medications:['Marevan','Nurofen']});
  assert.equal(r.statusCode,400);assert.equal(r.body.errorCode,'consent_required');assert.match(r.body.error,/consent/i,'Consent must be explicit at the server boundary.');
  r = await call('POST',{consent:true,medications:['Marevan','Nurofen']});
  assert.equal(r.statusCode,200);assert.equal(r.body.status,'red');assert.equal(r.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal(r.body.coverage.completeForRequest,false);
  assert.equal(r.body.provider.id,'doctorai-local-pharmac-rules');
  const labelPayload={consent:true,medications:[{name:'Marevan',dose:'1 mg',activeIngredients:['warfarin'],activeIngredientsConfirmed:true},{name:'Nurofen',dose:'200 mg',activeIngredients:['ibuprofen']}]};
  assert.equal((await call('POST',labelPayload)).statusCode,400,'The endpoint must reject ingredient text without an explicit confirmation flag.');
  const checked=await call('POST',{...labelPayload,medications:labelPayload.medications.map((item,index)=>index===1?{...item,activeIngredientsConfirmed:true}:item)});
  assert.equal(checked.statusCode,200);assert.equal(checked.body.coverage.confirmedLabels,2);assert.equal(checked.body.coverage.doseAssessment,'not_performed');
  assert.equal((await call('POST',{...labelPayload,medications:[{...labelPayload.medications[0],privateNotes:'must not be accepted'}]})).statusCode,400,'No extra private record fields may be sent.');

  const failedHandler=handler.createMedicationSafetyHandler({provider:{id:'synthetic-provider-failure',version:'test',interfaceVersion:1,review:async()=>{throw new Error('synthetic local rule failure');}}});
  const failedResponse={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
  await failedHandler({method:'POST',body:{consent:true,medications:['Marevan']}},failedResponse);
  assert.equal(failedResponse.statusCode,503);assert.equal(failedResponse.body.status,'provider_unavailable');assert.equal(failedResponse.body.errorCode,'provider_unavailable');assert.equal(failedResponse.headers['Cache-Control'],'no-store, max-age=0');
  assert.equal(providerFailureReported,true,'provider outages should be recorded without returning a partial result');
  serviceFailureCases.push({name:'local rules provider exception',status:failedResponse.statusCode});
  assert.deepEqual(serviceFailureCases.map(item => item.status),[503,503]);
  console.log(`Endpoint verification passed: ${serviceFailureCases.length} synthetic entitlement/provider service failures returned no-store 503 with no partial result; synthetic auth/secure-storage/active-Pro/consent gates, expired/revoked access, malformed/oversized list rejection and sourced alerts also passed.`);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => {
  core.identityFromRequest = originalCore.identityFromRequest;
  core.storageConfigured = originalCore.storageConfigured;
  core.activeEntitlement = originalCore.activeEntitlement;
  core.reportError = originalCore.reportError;
});
