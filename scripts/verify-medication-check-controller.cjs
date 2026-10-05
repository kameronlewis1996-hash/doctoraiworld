'use strict';
const assert=require('node:assert/strict');
const {Controller,issues,MAX_AGE}=require('../medication-check-controller.js');
const {review}=require('../server-src/medication/safety-engine.cjs');
const version=require('../data/medication/medication-safety.seed.json').ruleset.version;
const clone=value=>JSON.parse(JSON.stringify(value));
const base={owner:'fictional-account-a',profileIdentity:'fictional-profile-a',allowed:true,storageAllowed:true,rulesVersion:version,payload:{medications:[{name:'ibuprofen',dose:'200 mg'},{name:'warfarin',dose:'1 mg'}],allergies:[],conditions:[]}};
(async()=>{
let saved=null,calls=0,now=1_800_000_000_000;
const options={load:()=>saved,save:r=>{saved=clone(r);},remove:()=>{saved=null;},now:()=>now,request:async p=>{calls++;assert.equal(p.consent,true);return review(p);}};
let controller=new Controller(options);
await controller.update(clone(base));assert.equal(calls,0);
await controller.setConsent(true);assert.equal(calls,0,'Checkbox alone must not send terms');
await controller.run();assert.equal(calls,1);assert.equal(controller.snapshot().status,'complete');assert.ok(issues(controller.snapshot().result).some(a=>a.ruleId==='warfarin-nsaid'));
await controller.update(clone(base));assert.equal(calls,1,'Opening an unchanged view must reuse the current check');
assert.ok(!JSON.stringify(saved).includes(base.owner),'Saved metadata must not expose the account identity');
controller=new Controller(options);await controller.update(clone(base));assert.equal(calls,1,'Reload must restore a current account/profile/input/rules-bound result');
let changed=clone(base);changed.payload.medications[0].dose='400 mg';await controller.update(changed);assert.equal(calls,2,'Dose change must recheck after activation');
changed.payload.allergies=['NSAID'];await controller.update(clone(changed));assert.equal(calls,3);
changed.payload.conditions=['fictional condition'];await controller.update(clone(changed));assert.equal(calls,4);
await controller.setConsent(false);await controller.update({...changed,payload:{...changed.payload,allergies:[]}});assert.equal(calls,4);assert.equal(controller.snapshot().result,null);assert.equal(saved,null);
await controller.setConsent(true);await controller.run();assert.equal(calls,5);
await controller.update({...changed,profileIdentity:'fictional-profile-b'});assert.equal(calls,5);assert.equal(controller.snapshot().consent,false);assert.equal(controller.snapshot().result,null);
await controller.setConsent(true);await controller.run();assert.equal(calls,6);
await controller.update({...changed,owner:'fictional-account-b',profileIdentity:'fictional-profile-b'});assert.equal(calls,6);assert.equal(controller.snapshot().consent,false);assert.equal(controller.snapshot().result,null);
controller=new Controller(options);await controller.update(clone(base));await controller.setConsent(true);await controller.run();const beforeExpiry=calls;
now+=MAX_AGE+1;controller=new Controller(options);await controller.update(clone(base));assert.equal(calls,beforeExpiry+1,'A stale result must be rechecked, not displayed as current');
now+=MAX_AGE+1;const sameInstanceExpiry=calls;await controller.update(clone(base));assert.equal(calls,sameInstanceExpiry+1,'An open controller must recheck after its result expires');
await controller.update({...base,allowed:false});assert.equal(controller.snapshot().result,null);assert.equal(controller.snapshot().status,'unavailable');
// Startup must wait for authoritative private profile data without discarding an eligible saved check.
controller=new Controller(options);await controller.update(clone(base));await controller.setConsent(true);await controller.run();const beforeStartup=calls;
const starting=new Controller(options);await starting.update({...base,profileIdentity:'',allowed:false,rulesVersion:''});await starting.update({...base,profileIdentity:'',allowed:false});await starting.update(clone(base));assert.equal(calls,beforeStartup);assert.equal(starting.snapshot().status,'complete');
const metadataMissing=new Controller(options);await metadataMissing.update({...base,rulesVersion:''});assert.equal(metadataMissing.snapshot().status,'unavailable');assert.match(metadataMissing.snapshot().error,/version could not be verified/);
const rulesChanged=new Controller({...options,request:async p=>{calls++;const result=clone(review(p));result.ruleset.version='synthetic-next-version';return result;}});await rulesChanged.update(clone(base));const priorVersionCalls=calls;await rulesChanged.update({...base,rulesVersion:'synthetic-next-version'});assert.equal(calls,priorVersionCalls+1);assert.equal(rulesChanged.snapshot().result.ruleset.version,'synthetic-next-version');
const incomplete=new Controller({request:async p=>{const result=review(p);result.resolved.pop();return result;}});await incomplete.update(clone(base));await incomplete.setConsent(true);await incomplete.run();assert.equal(incomplete.snapshot().status,'unavailable');assert.equal(incomplete.snapshot().result,null);
// A late response cannot survive a medication change, revocation, or account switch.
for(const mutation of ['edit','revoke','account']){
let releases=[];let count=0;
const racer=new Controller({request:p=>{count++;return new Promise(resolve=>releases.push(()=>resolve(review(p))));}});
await racer.update({...base,storageAllowed:false});await racer.setConsent(true);const old=racer.run();const duplicate=racer.run();assert.equal(count,1);
if(mutation==='revoke')await racer.setConsent(false);
else if(mutation==='account')await racer.update({...base,owner:'different-fictional-account',storageAllowed:false});
else {const updating=racer.update({...base,storageAllowed:false,payload:{...base.payload,medications:[{name:'paracetamol',dose:'500 mg'}]}});for(let n=0;n<100&&count<2;n++)await new Promise(r=>setTimeout(r,5));assert.equal(count,2);releases[1]();await updating;}
releases[0]();await old;await duplicate;
if(mutation==='edit'){assert.equal(racer.snapshot().result.resolved.length,1);assert.equal(issues(racer.snapshot().result).length,0);}else assert.equal(racer.snapshot().result,null);
}
const failing=new Controller({request:async()=>{throw new Error('Synthetic unavailable');}});await failing.update({...base,storageAllowed:false});await failing.setConsent(true);await failing.run();assert.equal(failing.snapshot().status,'unavailable');assert.equal(failing.snapshot().result,null);await failing.update({...base,storageAllowed:false});assert.equal(failing.snapshot().status,'unavailable','An unchanged open must not erase the failure or retry repeatedly');
for(const names of [['ibuprofen','warfarin'],['Nurofen','Marevan']]){const r=review({medications:names});assert.equal(r.status,'red');assert.ok(issues(r).some(a=>a.ruleId==='warfarin-nsaid'));assert.doesNotMatch(r.disclaimer,/no.*alerts?.*safe/i);}
for(const name of ['fictional unknown medicine','Nurofen Cold & Flu']){const r=review({medications:[name,'warfarin']});assert.equal(r.status,'unknown');assert.ok(r.coverage.unknown>0);assert.equal(issues(r).length,0);}
const session=new Controller({...options});await session.update({...base,storageAllowed:false});await session.setConsent(true);await session.run();assert.equal(saved,null,'Device-storage opt-out must not persist results or consent');
console.log('Medication check controller passed: generic/brand warnings, unknown coverage, explicit consent, activation, change-triggered checks, reload/staleness, Pro/account/profile isolation, revocation, errors, duplicate requests and stale-response races.');
})().catch(e=>{console.error(e);process.exitCode=1;});
