'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handler = require('../api/medication/safety.js');
const engine = require('../server-src/medication/safety-engine.cjs');
const core = require('../server-src/_lib/doctorai-core.cjs');
const originalCore = Object.fromEntries(['identityFromRequest', 'storageConfigured', 'activeEntitlement', 'rateLimit'].map(key => [key, core[key]]));
core.identityFromRequest = async () => ({ email: 'audit@example.invalid', sub: 'synthetic-audit' });
core.storageConfigured = () => true;
core.activeEntitlement = async () => ({ tier: 'pro' });
core.rateLimit = async () => ({ allowed: true });
const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
const start = source.indexOf('  function selectedSafetyMedications(');
const end = source.indexOf('  async function handleClick(', start);
assert.ok(start >= 0 && end > start, 'Local medication UI function boundaries must be present.');
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.textContent = ''; this.checked = false; this.disabled = false; this.dataset = {}; this.value = ''; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; this.textContent = ''; }
  focus() { this.focused = true; }
}
const output = new Element();
const consent = new Element();
consent.checked = true;
const state = { medications: [{ name: 'Marevan', dose: 'private dose', notes: 'private note' }, { name: 'Nurofen' }], profile: { allergies: 'penicillin', conditions: 'kidney disease', symptoms: 'private symptom' } };
const signature = () => JSON.stringify(state.medications.map(item => [String(item?.id || ''), String(item?.name || ''), String(item?.startDate || ''), String(item?.endDate || '')]));
const selectedChoices = [{ value: '0', checked: true }, { value: '1', checked: true }];
const picker = new Element('section'); picker.dataset.signature = signature(); picker.querySelectorAll = () => selectedChoices;
const panel = { querySelector: selector => selector.includes('safety-medication-selection') ? picker : selector.includes('consent') ? consent : output,
  querySelectorAll: () => selectedChoices, insertBefore() {} };
const button = { closest: () => panel, disabled: false };
let sent; let requests = 0; let signIns = 0; let pro = true; let contextCurrent = true;
const context = vm.createContext({
  capturePersonContext: () => ({ profileId: 'self', marker: 'synthetic' }), personContextIsCurrent: () => contextCurrent,
  document: { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) },
  window: { setTimeout, clearTimeout }, AbortController, URL, state, authUser: { id: 'synthetic-test-user' },
  hasProAccess: () => pro, openGoogleSignIn: () => { signIns += 1; }, splitDetails: value => String(value).split(';').filter(Boolean),
  showToast() {}, renderLocalMedicationDatabaseResult: undefined,
  fetch: async (url, options) => {
    assert.equal(url, '/api/medication/safety'); assert.equal(options.credentials, 'same-origin'); requests += 1;
    sent = JSON.parse(options.body);
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: options.method, body: sent }, response);
    return { ok: response.code === 200, json: async () => response.body };
  }
});
vm.runInContext(source.slice(start, end), context);
(async () => {
  await Promise.all([context.runLocalMedicationSafetyCheck(button), context.runLocalMedicationSafetyCheck(button)]);
  assert.equal(requests, 1, 'Concurrent submissions must send one request.');
  assert.deepEqual(sent, { consent: true, medications: ['Marevan', 'Nurofen'], allergies: ['penicillin'], conditions: ['kidney disease'] }, 'Only explicitly disclosed names, allergy terms and condition terms are sent.');
  assert.equal(consent.checked, false); assert.equal(button.disabled, false);
  assert.ok(selectedChoices.every(choice => choice.checked === false), 'One-time medicine choices are cleared after the request.');
  const allText = element => [element.textContent, ...(element.children || []).map(allText)].join(' ');
  assert.match(allText(output), /potential issues|limited check/i);
  assert.match(allText(output), /3,419/); assert.match(allText(output), /1,444/); assert.match(allText(output), /1,224/);
  assert.match(allText(output), /1,136/); assert.match(allText(output), /131 incompletely mapped/);
  assert.match(allText(output), /13 curated interaction rules/); assert.match(allText(output), /2 allergy classes/); assert.match(allText(output), /0 condition rules/);
  assert.match(allText(output), /does not endorse/i); assert.match(allText(output), /does not mean safe/i);

  selectedChoices.forEach(choice => { choice.checked = true; });
  consent.checked = false; await context.runLocalMedicationSafetyCheck(button);
  assert.equal(requests, 1, 'No consent sends no request.'); assert.equal(consent.focused, true);
  consent.checked = true; state.medications[1].name = ''; picker.dataset.signature = signature();
  selectedChoices.forEach(choice => { choice.checked = true; }); await context.runLocalMedicationSafetyCheck(button);
  assert.equal(requests, 1, 'An incomplete list is not partially sent.'); assert.match(output.textContent, /No partial list/i);
  state.medications[1].name = 'Nurofen'; picker.dataset.signature = signature(); selectedChoices.forEach(choice => { choice.checked = true; });
  pro = false; await context.runLocalMedicationSafetyCheck(button); assert.equal(requests, 1); assert.match(output.textContent, /Pro/i);
  pro = true; context.authUser = null; await context.runLocalMedicationSafetyCheck(button); assert.equal(requests, 1); assert.equal(signIns, 1);

  context.authUser = { id: 'synthetic-test-user' }; consent.checked = true; selectedChoices.forEach(choice => { choice.checked = true; });
  context.fetch = async () => { throw new Error('Synthetic network failure'); };
  await context.runLocalMedicationSafetyCheck(button);
  assert.match(allText(output), /Synthetic network failure/); assert.equal(button.disabled, false); assert.equal(consent.checked, false);

  const unknown = engine.review({ medications: ['synthetic unmatched medicine'] });
  context.renderLocalMedicationDatabaseResult(output, unknown);
  assert.match(allText(output), /unmatched medicines and risks outside/i);
  assert.match(allText(output), /not matched; clashes are unknown/i);
  assert.match(allText(output), /does not mean safe/i);
  const routePath = require.resolve('../api/medication/safety.js');
  const originalReview = engine.review;
  engine.review = () => { throw new Error('The local rules must not run without consent.'); };
  delete require.cache[routePath]; const gatedHandler = require(routePath);
  for (const body of [{ medications: ['amoxicillin'] }, { consent: false, medications: ['amoxicillin'] }]) {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, setHeader() {}, json(value) { this.body = value; return this; } };
    await gatedHandler({ method: 'POST', body, headers: {} }, response);
    assert.equal(response.statusCode, 400); assert.match(response.body.error, /Confirm/i);
  }
  engine.review = originalReview; delete require.cache[routePath];
  console.log('Local medication UI→API→catalogue verification passed: one-time consent, sign-in/Pro gates, minimal synthetic payload, no duplicate/partial sends, fail-closed unmatched status, sourced coverage and no-alert caution.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => Object.assign(core, originalCore));
