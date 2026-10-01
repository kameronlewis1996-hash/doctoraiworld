'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handler = require('../api/medication/safety.js');
const core = require('../server-src/_lib/doctorai-core.cjs');
const originalCore = Object.fromEntries(['identityFromRequest','storageConfigured','activeEntitlement','rateLimit'].map(key=>[key,core[key]]));
core.identityFromRequest = async () => ({email:'audit@example.invalid',sub:'synthetic-audit'});
core.storageConfigured = () => true;
core.activeEntitlement = async () => ({tier:'pro'});
core.rateLimit = async () => ({allowed:true});
const source = fs.readFileSync(require.resolve('../health-hub.js'),'utf8');
const code = source.slice(source.indexOf('  function renderLocalMedicationDatabaseResult('), source.indexOf('  async function runMedicationSafetyCheck('));
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.checked=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;this.textContent='';}
  focus(){this.focused=true;}
}
const output = new Element();const consent = new Element();consent.checked = true;
const panel = {querySelector:s=>s.includes('consent')?consent:output};
const button = {closest:()=>panel,disabled:false};
const state = {medications:[{name:'Marevan',dose:'private dose',notes:'private note'},{name:'Nurofen'}],profile:{allergies:'penicillin',conditions:'kidney disease',symptoms:'private symptom'}};
let sent;let signIns=0;let pro=true;let requests=0;
const context = vm.createContext({document:{createElement:tag=>new Element(tag),createTextNode:t=>({textContent:t})},state,authUser:{id:'synthetic-test-user'},hasProAccess:()=>pro,openGoogleSignIn:()=>{signIns+=1;},splitDetails:s=>s.split(';').filter(Boolean),fetch:async(url,options)=>{
  assert.equal(url,'/api/medication/safety');assert.equal(options.credentials,'same-origin');
  requests+=1;
  sent=JSON.parse(options.body);
  const response={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;}};
  await handler({method:options.method,body:sent},response);
  return {ok:response.code===200,json:async()=>response.body};
}});
vm.runInContext(code,context);
(async()=>{
  await Promise.all([context.runLocalMedicationSafetyCheck(button),context.runLocalMedicationSafetyCheck(button)]);
  assert.equal(requests,1,'Concurrent submissions must send only one request.');
  assert.deepEqual(sent,{medications:['Marevan','Nurofen'],allergies:['penicillin'],conditions:['kidney disease']});
  assert.equal(consent.checked,false);assert.equal(button.disabled,false);
  const allText = el=>[el.textContent,...(el.children||[]).map(allText)].join(' ');
  assert.match(allText(output),/potential issues/);assert.match(allText(output),/3[,.]?419/);assert.match(allText(output),/13 curated interaction rules/);assert.match(allText(output),/does not endorse/);assert.match(allText(output),/does not mean safe/i);
  sent=null;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.equal(consent.focused,true);
  consent.checked=true;state.medications[1].name='';await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.match(output.textContent,/No partial list/);
  state.medications[1].name='Nurofen';pro=false;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.match(output.textContent,/Pro/);
  pro=true;context.authUser=null;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.equal(signIns,1);
  context.authUser={id:'synthetic-test-user'};consent.checked=true;
  context.fetch=async()=>{throw new Error('Synthetic network failure');};
  await context.runLocalMedicationSafetyCheck(button);
  assert.match(allText(output),/Synthetic network failure/);
  assert.equal(button.disabled,false);assert.equal(consent.checked,false);
  context.renderLocalMedicationDatabaseResult(output,require('../server-src/medication/safety-engine.cjs').review({medications:['paracetamol','cetirizine']}));
  assert.match(allText(output),/limited check/i);assert.match(allText(output),/does not mean safe/i);
  console.log('Local UI→API→database→result verification passed with a synthetic account: consent, Pro/sign-in gates, exact payload privacy, sourced warnings, catalogue attribution and no partial lists.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>Object.assign(core,originalCore));
