'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../server-src/_lib/doctorai-core.cjs');
const originalCore = {
  identityFromRequest: core.identityFromRequest,
  storageConfigured: core.storageConfigured,
  activeEntitlement: core.activeEntitlement
};
core.identityFromRequest = async () => ({ sub: 'synthetic-ui-account', email: 'synthetic@example.invalid' });
core.storageConfigured = () => true;
core.activeEntitlement = async () => ({ tier: 'pro', exp: Math.floor(Date.now() / 1000) + 600 });
const handler = require('../api/medication/safety.js');
const source = fs.readFileSync(require.resolve('../health-hub.js'),'utf8');
const code = source.slice(source.indexOf('  function renderLocalMedicationDatabaseResult('), source.indexOf('  async function handleClick('));
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.checked=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;this.textContent='';}
  focus(){this.focused=true;}
}
const output = new Element();const consent = new Element();consent.checked = true;
const panel = {querySelector:s=>s.includes('consent')?consent:output};
const button = {closest:()=>panel,disabled:false};
const state = {medications:[{name:'Marevan',dose:'1 mg',activeIngredients:['warfarin'],activeIngredientsManuallyConfirmed:true,notes:'private note'},{name:'Nurofen',dose:'200 mg',activeIngredients:['ibuprofen'],activeIngredientsManuallyConfirmed:false}],profile:{allergies:'penicillin',conditions:'kidney disease',symptoms:'private symptom'}};
let sent;let signIns=0;let pro=true;
const context = vm.createContext({document:{createElement:tag=>new Element(tag),createTextNode:t=>({textContent:t})},URL,state,authUser:{id:'synthetic-test-user'},hasProAccess:()=>pro,openGoogleSignIn:()=>{signIns+=1;},splitDetails:s=>s.split(';').filter(Boolean),fetch:async(url,options)=>{
  assert.equal(url,'/api/medication/safety');assert.equal(options.credentials,'same-origin');
  sent=JSON.parse(options.body);
  const response={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;}};
  await handler({method:options.method,body:sent},response);
  return {ok:response.code===200,json:async()=>response.body};
}});
vm.runInContext(code,context);
(async()=>{
  await context.runLocalMedicationSafetyCheck(button);
  assert.deepEqual(sent,{consent:true,medications:[{name:'Marevan',dose:'1 mg',activeIngredients:['warfarin'],activeIngredientsConfirmed:true},{name:'Nurofen',dose:'200 mg'}],allergies:['penicillin'],conditions:['kidney disease']});
  assert.equal(consent.checked,false);assert.equal(button.disabled,false);
  const allText = el=>[el.textContent,...(el.children||[]).map(allText)].join(' ');
  assert.match(allText(output),/potential issues/);assert.match(allText(output),/3[,.]?419/);assert.match(allText(output),/13 curated interaction rules/);assert.match(allText(output),/does not endorse/);assert.match(allText(output),/does not mean safe/i);
  sent=null;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.equal(consent.focused,true);
  consent.checked=true;state.medications[1].name='';await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.match(output.textContent,/No partial list/);
  state.medications[1].name='Nurofen';pro=false;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.match(output.textContent,/Pro/);
  pro=true;context.authUser=null;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.equal(signIns,1);

  let concurrentFetches=0;let releaseRequest;
  context.authUser={id:'synthetic-test-user'};consent.checked=true;
  context.fetch=async(url,options)=>{
    concurrentFetches+=1;
    sent=JSON.parse(options.body);
    return new Promise(resolve=>{releaseRequest=async()=>{
      const response={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;}};
      await handler({method:options.method,body:sent},response);
      resolve({ok:response.code===200,json:async()=>response.body});
    };});
  };
  const running=context.runLocalMedicationSafetyCheck(button);
  await Promise.resolve();
  await context.runLocalMedicationSafetyCheck(button);
  assert.equal(concurrentFetches,1,'A double activation must not start a second request.');
  assert.equal(button.disabled,true,'The check action stays disabled while its request is pending.');
  await releaseRequest();
  await running;
  assert.equal(button.disabled,false,'The action is restored after the request completes.');
  console.log('Local UI→API→database→result verification passed with a synthetic account: consent, Pro/sign-in gates, dose and confirmed-ingredient payload privacy, sourced warnings, no partial lists and duplicate-click protection.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  core.identityFromRequest = originalCore.identityFromRequest;
  core.storageConfigured = originalCore.storageConfigured;
  core.activeEntitlement = originalCore.activeEntitlement;
});
