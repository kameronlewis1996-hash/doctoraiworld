'use strict';
// Synthetic fixtures only. Tests presentation of existing clinical results.
const assert = require('node:assert/strict');
const { describe, render } = require('../health-alert-status.js');
const { createHealthAlertsEngine } = require('../server-src/health/alerts-engine.cjs');
const engine = createHealthAlertsEngine(require('../server-src/medication/safety-engine.cjs'));
const evaluate = input => engine.evaluate({ ...input, now: '2026-10-11T12:00:00Z' });
const label = (id, ingredient) => ({ id, name: `Fictional ${id}`, activeIngredients: [ingredient], activeIngredientsManuallyConfirmed: true });
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const known = evaluate({ medications: [label('one', 'paracetamol')] });
check('recognised medicine with no notices is limited green', () => {
  assert.equal(describe(known).level, 'green');
  assert.match(describe(known).note, /No alert does not mean safe/);
});
check('empty records never imply clearance', () => assert.equal(describe(evaluate({})).level, 'neutral'));
check('unrecognised medicine needs review', () => assert.equal(describe(evaluate({ medications: [{id:'unknown',name:'Invented unmapped medicine'}] })).level, 'orange'));
check('actual interaction retains professional-review instruction', () => {
  const status = describe(evaluate({ medications: [label('one','warfarin'),label('two','ibuprofen')] }));
  assert.equal(status.level, 'red'); assert.equal(status.title, 'Contact a professional');
});
check('actual urgent symptom keeps urgent wording', () => {
  const status = describe(evaluate({timeline:[{id:'s',type:'symptom',source:'symptom-diary',title:'Severe difficulty breathing',date:'2026-10-10'}]}));
  assert.equal(status.level,'red'); assert.equal(status.title,'Urgent medical help');
});
check('conflicting details need review', () => assert.equal(describe(evaluate({profile:{bloodType:'O+'},memoryDetails:['Blood type: AB negative']})).level,'orange'));
check('missing or malformed result never becomes green', () => {
  for (const result of [null, {}, {alerts:[]}, {alerts:{},coverage:{}}, {alerts:[],coverage:null}]) assert.equal(describe(result).level,'neutral');
  for (const field of ['requested','resolved','checked']) for (const bad of [undefined, NaN, Infinity,-1,'1']) {
    const value=structuredClone(known);value.coverage.medications[field]=bad;
    assert.notEqual(describe(value).level,'green');
  }
});
check('unsupported or omitted records prevent green', () => {
  for (const patch of [{results:{recorded:1}},{symptoms:{recorded:1,undated:1}},{conditionMedication:{unmatched:['Unmapped condition']}},{symptoms:{omittedByLimit:1}}]) {
    const value=structuredClone(known);Object.assign(value.coverage,patch);assert.equal(describe(value).level,'orange');
  }
});
check('unknown severity cannot imply clearance, highest urgency wins', () => {
  const value=structuredClone(known);value.alerts=[{severity:'new-severity'}];assert.equal(describe(value).level,'orange');
  value.alerts.push({severity:'high'},{severity:'urgent'});assert.equal(describe(value).title,'Urgent medical help');
});
check('both locations update and stale green clears after failure', () => {
  const nodes=Array.from({length:2},()=>({dataset:{},parts:{},querySelector(key){return this.parts[key] ||= {};},setAttribute(key,value){this[key]=value;}}));
  const doc={querySelectorAll:selector=>selector==='[data-alert-summary]'?nodes:[]}; render(known,doc);
  nodes.forEach(n=>assert.equal(n.dataset.alertLevel,'green'));render(null,doc);
  nodes.forEach(n=>{assert.equal(n.dataset.alertLevel,'neutral');assert.match(n['aria-label'],/Checks unavailable/);assert.equal(n.parts['[data-alert-symbol]'].textContent,'?');});
});
console.log(`Alert status verified: ${checks} checks passed.`);
