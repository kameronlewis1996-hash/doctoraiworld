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
const code = source.slice(source.indexOf('  function selectedSafetyMedications('), source.indexOf('  async function runMedicationSafetyCheck('));
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.checked=false;this.dataset={};this.value='';}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;this.textContent='';}
  focus(){this.focused=true;}
}
const output = new Element();const consent = new Element();consent.checked = true;
const state = {medications:[{name:'Marevan',dose:'private dose',notes:'private note'},{name:'Nurofen'}],profile:{allergies:'penicillin',conditions:'kidney disease',symptoms:'private symptom'}};
const signature = JSON.stringify(state.medications.map(item=>[String(item.id||''),String(item.name||''),String(item.startDate||''),String(item.endDate||'')]));
const selectedChoices = [{value:'0',checked:true},{value:'1',checked:true}];
const picker = new Element('section');picker.dataset.signature=signature;picker.querySelectorAll=()=>selectedChoices;
const refreshPickerSignature=()=>{picker.dataset.signature=JSON.stringify(state.medications.map(item=>[String(item.id||''),String(item.name||''),String(item.startDate||''),String(item.endDate||'')]));};
const panel = {querySelector:s=>s.includes('safety-medication-selection')?picker:s.includes('consent')?consent:output,querySelectorAll:()=>selectedChoices,insertBefore(){}};
const button = {closest:()=>panel,disabled:false};
let sent;let signIns=0;let pro=true;let requests=0;
const context = vm.createContext({capturePersonContext:()=>({}),personContextIsCurrent:()=>true,document:{createElement:tag=>new Element(tag),createTextNode:t=>({textContent:t})},URL,state,authUser:{id:'synthetic-test-user'},hasProAccess:()=>pro,openGoogleSignIn:()=>{signIns+=1;},splitDetails:s=>s.split(';').filter(Boolean),fetch:async(url,options)=>{
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
  assert.deepEqual(sent,{consent:true,medications:['Marevan','Nurofen'],allergies:['penicillin'],conditions:['kidney disease']});
  assert.equal(consent.checked,false);assert.equal(button.disabled,false);assert.ok(selectedChoices.every(choice=>choice.checked===false),'One-time medicine selections must be cleared after the request.');
  const allText = el=>[el.textContent,...(el.children||[]).map(allText)].join(' ');
  assert.match(allText(output),/potential issues/);assert.match(allText(output),/3[,.]?419/);assert.match(allText(output),/13 curated interaction rules/);assert.match(allText(output),/does not endorse/);assert.match(allText(output),/does not mean safe/i);
  selectedChoices.forEach(choice=>{choice.checked=true;});sent=null;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.equal(consent.focused,true);
  consent.checked=true;state.medications[1].name='';refreshPickerSignature();await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.match(output.textContent,/No partial list/);
  state.medications[1].name='Nurofen';refreshPickerSignature();pro=false;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.match(output.textContent,/Pro/);
  pro=true;context.authUser=null;await context.runLocalMedicationSafetyCheck(button);assert.equal(sent,null);assert.equal(signIns,1);
  context.authUser={id:'synthetic-test-user'};consent.checked=true;
  context.fetch=async()=>{throw new Error('Synthetic network failure');};
  await context.runLocalMedicationSafetyCheck(button);
  assert.match(allText(output),/Synthetic network failure/);
  assert.equal(button.disabled,false);assert.equal(consent.checked,false);
  context.renderLocalMedicationDatabaseResult(output,require('../server-src/medication/safety-engine.cjs').review({medications:['paracetamol','cetirizine']}));
  assert.match(allText(output),/limited check/i);assert.match(allText(output),/does not mean safe/i);
  const engine=require('../server-src/medication/safety-engine.cjs');const originalReview=engine.review;
  engine.review=()=>{throw new Error('The safety engine must not run without consent.');};
  const routePath=require.resolve('../api/medication/safety.js');delete require.cache[routePath];const gatedHandler=require(routePath);
  for (const body of [{medications:['amoxicillin']},{consent:false,medications:['amoxicillin']}]) {
    const response={statusCode:200,status(n){this.statusCode=n;return this;},setHeader(){},json(value){this.body=value;return this;}};
    await gatedHandler({method:'POST',body,headers:{}},response);assert.equal(response.statusCode,400);assert.match(response.body.error,/Confirm/i);
  }
  engine.review=originalReview;delete require.cache[routePath];
  console.log('Local UI→API→database→result verification passed with a synthetic account: consent, Pro/sign-in gates, exact payload privacy, sourced warnings, catalogue attribution and no partial lists.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>Object.assign(core,originalCore));
