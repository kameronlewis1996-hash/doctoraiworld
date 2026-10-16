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
const known = evaluate({ medications: [label('one', 'paracetamol')], profile: { noKnownAllergies: true, conditions: 'No known conditions' }, timeline: [{id:'old-symptom',type:'symptom',source:'symptom-diary',title:'Old headache',date:'2026-10-01'}] });
check('recognised medicine without a notice stays neutral under very limited coverage', () => {
  assert.equal(describe(known).level, 'neutral');
  assert.equal(describe(known).symbol, '?');
  assert.equal(describe(known).title, 'Some details unassessed');
  assert.match(describe(known).note, /very limited/i);
  assert.match(describe(known).note, /No alert does not mean safe/);
});
check('resolved warfarin and ibuprofen remain unassessed and never green', () => {
  const result = evaluate({ medications: [label('war','warfarin'),label('ibu','ibuprofen')], profile: { noKnownAllergies: true, conditions: 'No known conditions' }, timeline: [{id:'old-symptom',type:'symptom',source:'symptom-diary',title:'Old headache',date:'2026-10-01'}] });
  assert.equal(result.coverage.medicationMedication.requestedPairs, 1);
  assert.equal(result.coverage.medicationMedication.assessedPairs, 0);
  assert.equal(result.coverage.medicationMedication.unassessedPairs, 1);
  assert.ok(result.alerts.some(alert => alert.ruleId === 'medication-pair-unassessed' && alert.severity === 'unknown'));
  assert.equal(describe(result).level, 'orange');
  assert.equal(describe(result).title, 'Medicine pair unassessed');
  assert.match(describe(result).note, /1 of 1 saved medicine pairs/);
});
check('empty records never imply clearance', () => assert.equal(describe(evaluate({})).level, 'neutral'));
check('incomplete records remain neutral rather than green', () => assert.equal(describe(evaluate({ medications: [label('one', 'paracetamol')] })).level, 'neutral'));
check('uncertain allergy is visibly unassessed without implying a clinical alert', () => {
  const status = describe(evaluate({ medications: [label('one','paracetamol')], profile: { allergies: 'possible penicillin allergy', conditions: 'No known conditions' }, timeline: [{id:'old-symptom',type:'symptom',source:'symptom-diary',title:'Old headache',date:'2026-10-01'}] }));
  assert.equal(status.level, 'neutral'); assert.equal(status.title, 'Some details unassessed');
});
check('unrecognised medicine notice is orange with no safety claim', () => {
  const result = evaluate({ medications: [{id:'unknown',name:'Invented unmapped medicine'}] });
  assert.ok(result.alerts.length > 0);
  assert.equal(describe(result).level, 'orange');
});
check('retained interaction keeps professional-review status', () => {
  const status = describe(evaluate({ medications: [label('one','warfarin'),label('two','sulfamethoxazole')] }));
  assert.equal(status.level, 'red'); assert.equal(status.title, 'Contact a professional');
});
check('actual urgent symptom keeps urgent wording', () => {
  const status = describe(evaluate({timeline:[{id:'s',type:'symptom',source:'symptom-diary',title:'Severe difficulty breathing',date:'2026-10-10'}]}));
  assert.equal(status.level,'red'); assert.equal(status.title,'Urgent medical help');
});
check('conflicting details need review', () => assert.equal(describe(evaluate({profile:{bloodType:'O+'},memoryDetails:['Blood type: AB negative']})).level,'orange'));
check('missing or malformed result never becomes green', () => {
  for (const result of [null, {}, {alerts:[]}, {alerts:{},coverage:{}}, {alerts:[],coverage:null}]) assert.equal(describe(result).level,'neutral');
  const missingCoverage = structuredClone(known); delete missingCoverage.coverage.missing; assert.equal(describe(missingCoverage).level, 'neutral');
  const missingAllergyCount = structuredClone(known); delete missingAllergyCount.coverage.allergyMedication.excludedOrUncertain; assert.equal(describe(missingAllergyCount).level, 'neutral');
  for (const field of ['requested','resolved','checked']) for (const bad of [undefined, NaN, Infinity,-1,'1']) {
    const value=structuredClone(known);value.coverage.medications[field]=bad;
    assert.notEqual(describe(value).level,'green');
  }
});
check('unsupported or omitted records prevent green', () => {
  const mutations = [
    coverage => { coverage.missing = ['allergies']; },
    coverage => { coverage.results.recorded = 1; },
    coverage => { coverage.symptoms.recorded = 1; coverage.symptoms.undated = 1; },
    coverage => { coverage.conditionMedication.unmatched = ['Unmapped condition']; },
    coverage => { coverage.symptoms.omittedByLimit = 1; }
  ];
  for (const mutate of mutations) {
    const value=structuredClone(known);mutate(value.coverage);assert.equal(describe(value).level,'neutral');
  }
});
check('unknown severity cannot imply clearance, highest urgency wins', () => {
  const value=structuredClone(known);value.alerts=[{severity:'new-severity'}];assert.equal(describe(value).level,'orange');
  value.alerts.push({severity:'high'},{severity:'urgent'});assert.equal(describe(value).title,'Urgent medical help');
});
check('both locations update and stale green clears after failure', () => {
  const nodes=Array.from({length:2},()=>({dataset:{},parts:{},querySelector(key){return this.parts[key] ||= {};},setAttribute(key,value){this[key]=value;}}));
  const doc={querySelectorAll:selector=>selector==='[data-alert-summary]'?nodes:[]}; render(known,doc);
  nodes.forEach(n=>assert.equal(n.dataset.alertLevel,'neutral'));render(null,doc);
  nodes.forEach(n=>{assert.equal(n.dataset.alertLevel,'neutral');assert.match(n['aria-label'],/Checks unavailable/);assert.equal(n.parts['[data-alert-symbol]'].textContent,'?');});
});
function presentationDOM() {
  const summaries = Array.from({ length: 2 }, () => ({
    dataset: {}, parts: {}, attributes: {},
    querySelector(selector) { return this.parts[selector] ||= {}; },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  // The third summary is the compact banner shown outside Today and Medicines.
  summaries.push({
    dataset: { alertThemeBanner: '' }, hidden: true, parts: {}, attributes: {},
    querySelector(selector) { return this.parts[selector] ||= {}; },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const todayButtons = Array.from({ length: 3 }, () => ({
    children: [], attributes: {},
    querySelector(selector) { return selector === '.hub-alert-nav-symbol' ? this.children[0] || null : null; },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  const body = { dataset: { hubTheme: 'health', activeFeature: 'medications', hubPanel: 'medications' } };
  const doc = {
    body,
    querySelectorAll(selector) {
      if (selector === '[data-alert-summary]') return summaries;
      if (selector.includes('[data-view="today"]')) return todayButtons;
      return [];
    },
    createElement(tagName) {
      assert.equal(tagName, 'em', 'Status symbols must remain separate from the span/i icon hydrator.');
      return { dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    }
  };
  return { doc, body, summaries, todayButtons };
}
function assertPresentation(dom, result, expectedLevel, expectedTitle) {
  render(result, dom.doc);
  const status = describe(result);
  assert.equal(status.level, expectedLevel);
  assert.equal(status.title, expectedTitle);
  assert.equal(dom.body.dataset.healthAlertLevel, expectedLevel, 'The backdrop must follow the current result.');
  assert.deepEqual(dom.body.dataset, {
    hubTheme: 'health', activeFeature: 'medications', hubPanel: 'medications', healthAlertLevel: expectedLevel
  }, 'Alert presentation must preserve the selected category and medication panel.');
  for (const summary of dom.summaries) {
    assert.equal(summary.dataset.alertLevel, expectedLevel);
    assert.equal(summary.parts['[data-alert-title]'].textContent, expectedTitle);
    assert.equal(summary.parts['[data-alert-note]'].textContent, status.note);
    assert.equal(summary.parts['[data-alert-symbol]'].textContent, status.symbol);
    assert.equal(summary.attributes['aria-label'], `Alerts: ${status.title}. ${status.note} Open alerts.`);
    if ('alertThemeBanner' in summary.dataset) assert.equal(summary.hidden, expectedLevel !== 'orange' && expectedLevel !== 'red', 'Only actionable alert states should reveal the contextual banner.');
  }
  for (const button of dom.todayButtons) {
    assert.equal(button.children.length, 1, 'Repeated updates must reuse each Today status symbol.');
    const symbol = button.children[0];
    assert.equal(symbol.className, 'hub-alert-nav-symbol');
    assert.equal(symbol.attributes['aria-hidden'], 'true');
    assert.equal(symbol.dataset.alertLevel, expectedLevel);
    assert.equal(symbol.textContent, status.symbol);
    const empty = expectedLevel === 'neutral' && ['No current medicines', 'Add details to check'].includes(status.title);
    assert.equal(symbol.hidden, empty);
    assert.equal(button.attributes['aria-label'], empty ? 'Today' : `Today. ${expectedLevel === 'neutral' ? 'Status' : 'Alerts'}: ${status.title}. ${status.note}`);
  }
}
check('aurora severity state updates with real current results and resets after failure', () => {
  const dom = presentationDOM();
  assertPresentation(dom, evaluate({}), 'neutral', 'No current medicines');
  assertPresentation(dom, known, 'neutral', 'Some details unassessed');
  assertPresentation(dom, evaluate({ medications: [label('war', 'warfarin'), label('sulfa', 'sulfamethoxazole')] }), 'red', 'Contact a professional');
  assertPresentation(dom, null, 'neutral', 'Checks unavailable');
});
check('urgent results retain stronger instructions within the red theme and clear when records empty', () => {
  const dom = presentationDOM();
  assertPresentation(dom, evaluate({ medications: [label('war', 'warfarin'), label('sulfa', 'sulfamethoxazole')] }), 'red', 'Contact a professional');
  assertPresentation(dom, evaluate({ timeline: [{ id: 'urgent', type: 'symptom', source: 'symptom-diary', title: 'Severe difficulty breathing', date: '2026-10-10' }] }), 'red', 'Urgent medical help');
  assertPresentation(dom, evaluate({}), 'neutral', 'No current medicines');
});
console.log(`Alert status verified: ${checks} checks passed.`);
