'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
const extract = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Production function boundaries exist: ${start}`);
  return source.slice(from, to);
};
const helpers = extract('  const briefDate = ', '  function openPersonalOverview(')
  + extract('  const symptomSeverity = ', '  const symptomLogDescription = ')
  + extract('  function buildCareSummaryGroups(', '  function setModal(');
const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const fixture = today => ({
  profile: { allergies: 'Peanuts — swelling, rash', conditions: 'Asthma; review date unknown', notes: 'Needs written instructions <script>unsafe()</script>' },
  medications: [{ name: 'Fictional tablet', dose: '5 mg', instructions: 'As recorded', scanFieldsReviewed: true }],
  appointments: [{ title: 'Fictional consultation', date: today, provider: 'Fictional clinician' }],
  measurements: [{ type: 'temperature', value: 0, unit: '°C', date: today }],
  timeline: [
    { type: 'symptom', name: 'Recent symptom', severity: 1, date: today },
    { type: 'symptom', name: 'Old symptom', date: '2000-01-01' },
    { type: 'symptom', name: 'Future symptom', date: '2099-01-01' },
    { type: 'symptom', name: 'Undated symptom' },
    { type: 'symptom', name: 'Invalid-date symptom', date: '2026-02-30' }
  ]
});

function verifyWorkflowVM() {
  const preview = { innerHTML: '', get innerText() { return this.innerHTML.replace(/<[^>]*>/g, '\n'); } }, buttons = [{ disabled: false }, { disabled: false }];
  const checkbox = { checked: false, listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; } };
  const editor = { value: '', listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; } };
  let modalMarkup = '', printed = '', printRoot = null, afterprint;
  const copies = [], notices = [];
  const values = { since: '2026-10-13', focus: 'Review breathing', questions: 'What should I record?', appointment: '' };
  let groups, selected = new Set(['4:0', '6:0']);
  const choices = () => groups.flatMap((group,g) => group.items.map((value,i) => {
    const input = { value: `${g}:${i}`, checked: selected.has(`${g}:${i}`) };
    return { hidden: false, dataset: { briefDate: group.dates?.[i] || '' }, hasAttribute: () => Boolean(group.dates), querySelector: () => input };
  }));
  let formChoices;
  const form = {
    elements: { since: { value: values.since }, focus: { focus() {} } },
    querySelectorAll(selector) {
      if (selector === '.care-summary-choice') return formChoices;
      if (selector === '.care-summary-choice:not([hidden]) input:checked') return formChoices.filter(item => !item.hidden && item.querySelector().checked).map(item => item.querySelector());
      if (selector === 'fieldset') return [];
      throw new Error('Unexpected form selector: ' + selector);
    },
    querySelector: () => ({ hidden: false, textContent: '' })
  };
  const sandbox = vm.createContext({
    escapeHTML, careSummaryDraft: null,
    $: selector => selector === '#care-summary-reviewed' ? preview : selector === '[data-care-summary-confirm]' ? checkbox : selector === '[data-care-summary-text]' ? editor : null,
    els: { modalBody: { querySelectorAll: () => buttons } },
    FormData: class { get(key) { return values[key]; } },
    setModal(title, eyebrow, html) { modalMarkup = html; },
    showToast: text => notices.push(text),
    navigator: { clipboard: { writeText: async text => copies.push(text) } },
    iconMarkup: () => '',
    document: {
      createElement: () => ({ innerHTML: '', remove() { printRoot = null; } }),
      body: { append(root) { printRoot = root; }, classList: { add() {}, remove() {} } }
    },
    window: { addEventListener(name, handler) { if (name === 'afterprint') afterprint = handler; }, print() { printed = printRoot.innerHTML; afterprint(); } },
    fetch() { throw new Error('Visit brief unexpectedly made a network request'); }
  });
  vm.runInContext(helpers, sandbox);
  const copyHandler = extract("    if (event.target.closest('[data-copy-care-summary]')) {", "    if (event.target.closest('[data-open-profile]'))");
  vm.runInContext(`function copyCareSummary() { const event = { preventDefault() {}, target: { closest: () => true } }; ${copyHandler} }`, sandbox);
  groups = sandbox.buildCareSummaryGroups(fixture('2026-10-13'));
  formChoices = choices();
  sandbox.careSummaryDraft = { groups, appointments: [], html: '', text: '' };
  sandbox.reviewCareSummary(form);
  assert.ok(buttons.every(button => button.disabled), 'Copy and print are disabled before patient review');
  assert.match(preview.innerHTML, /Patient review pending/);
  assert.doesNotMatch(preview.innerHTML, /Asthma|Fictional tablet/);
  assert.match(preview.innerHTML, /Peanuts — swelling, rash/);
  assert.doesNotMatch(preview.innerHTML, /<script>/);
  sandbox.copyCareSummary();
  assert.equal(copies.length, 0, 'Copying cannot bypass pending review');
  checkbox.checked = true; checkbox.listeners.change();
  assert.ok(buttons.every(button => !button.disabled), 'Explicit patient review enables export');
  assert.match(preview.innerHTML, /Patient reviewed/);
  assert.ok(sandbox.careSummaryDraft.reviewedAt);
  editor.listeners.input({ target: { value: 'My edited priority\nA changed question <img src=x onerror=unsafe()>' } });
  assert.equal(checkbox.checked, false);
  assert.equal(sandbox.careSummaryDraft.reviewedAt, '');
  assert.ok(buttons.every(button => button.disabled), 'Any edit requires a fresh review');
  assert.doesNotMatch(preview.innerHTML, /<img/);
  sandbox.reviewCareSummary(form);
  assert.equal(sandbox.careSummaryDraft.text, 'My edited priority\nA changed question <img src=x onerror=unsafe()>', 'Unchanged choices preserve edited brief text');
  assert.equal(sandbox.careSummaryDraft.form, form, 'The existing selection form is retained');
  selected = new Set(['5:0']); formChoices = choices();
  sandbox.reviewCareSummary(form);
  assert.match(preview.innerHTML, /Asthma/);
  assert.doesNotMatch(preview.innerHTML, /Peanuts|A changed question/);
  assert.match(modalMarkup, /Earlier edits for reference/);
  assert.match(sandbox.careSummaryDraft.previousEditedText, /A changed question/, 'Changing selections retains earlier edits outside the exported brief');
  sandbox.printCareSummary();
  assert.equal(printed, '', 'Printing cannot bypass pending review');
  checkbox.checked = true; checkbox.listeners.change();
  sandbox.printCareSummary();
  assert.equal(printed, preview.innerHTML, 'Print exports exactly the reviewed preview');
  assert.equal(printRoot, null, 'Print DOM is removed after printing');
  assert.doesNotMatch(printed, /A changed question|Earlier edits for reference|Copy visit brief/);
  sandbox.copyCareSummary();
  assert.equal(copies.length, 1);
  assert.equal(copies[0], preview.innerText, 'The clipboard receives only the reviewed preview, excluding reference edits and controls');
  assert.doesNotMatch(copies[0], /A changed question|Earlier edits for reference|Copy visit brief/);
  const reviewedPrint = printed;
  sandbox.refreshCareSummaryReview(false);
  sandbox.printCareSummary();
  assert.equal(printed, reviewedPrint, 'Revoking review blocks another print');
  sandbox.copyCareSummary();
  assert.equal(copies.length, 1, 'Revoking review blocks another clipboard export');
  editor.listeners.input({ target: { value: '' } });
  checkbox.checked = true; checkbox.listeners.change();
  assert.equal(sandbox.careSummaryDraft.reviewedAt, '', 'An empty edited brief cannot be approved');
  assert.ok(buttons.every(button => button.disabled));
  console.log('Visit brief workflow verification passed: explicit review, edit invalidation and preservation, changed-choice backup, escaped edits and print boundaries.');
}

(async () => {
  const sandbox = vm.createContext({ escapeHTML });
  vm.runInContext(helpers, sandbox);
  const today = '2026-10-13';
  let groups = sandbox.buildCareSummaryGroups(fixture(today));
  const select = keys => new Set(keys);
  let content = sandbox.buildCareSummaryContent(groups, select(['4:0', '5:0', '6:0']), { focus: 'First priority\nSecond priority', questions: 'My question', since: today }, null, today);
  assert.match(content.text, /Peanuts — swelling, rash/);
  assert.match(content.text, /Asthma; review date unknown/);
  assert.doesNotMatch(content.text, /Fictional tablet|Recent symptom|Fictional consultation/);
  assert.match(content.text, /Source: Patient-entered health profile; date not recorded/);
  assert.match(content.text, /My priorities for this visit/);
  assert.match(content.text, /Questions to ask/);
  assert.ok(sandbox.buildCareSummaryContent(groups, select([]), {}, null, today).error, 'An empty selection does not invent a brief');
  assert.ok(sandbox.buildCareSummaryContent(groups, select([]), { focus: 'A\nB\nC\nD' }, null, today).error, 'No priority is silently dropped beyond three');
  const allSymptoms = select(groups[0].items.map((value,i) => `0:${i}`));
  content = sandbox.buildCareSummaryContent(groups, allSymptoms, { since: today }, null, today);
  assert.match(content.text, /Recent symptom/);
  assert.match(content.text, /Intensity: 1\/10/);
  assert.doesNotMatch(content.text, /Old symptom|Future symptom|Undated symptom|Invalid-date symptom/);
  content = sandbox.buildCareSummaryContent(groups, allSymptoms, {}, null, today);
  assert.match(content.text, /Old symptom/);
  assert.match(content.text, /Undated symptom · Date not recorded/);
  assert.match(content.text, /Invalid-date symptom · 2026-02-30/);
  assert.doesNotMatch(content.text, /Future symptom/);
  content = sandbox.buildCareSummaryContent(groups, select(['2:0']), {}, null, today);
  assert.match(content.text, /temperature · 0 · °C/);
  const snapshot = fixture(today); snapshot.profile = { allergies: '', conditions: '', notes: '' };
  groups = sandbox.buildCareSummaryGroups(snapshot);
  content = sandbox.buildCareSummaryContent(groups, select(['4:0', '5:0']), {}, null, today);
  assert.match(content.text, /status unknown/);
  assert.match(content.text, /does not mean no known allergies/);
  assert.equal(groups[6].items.length, 0, 'Missing profile notes are not fabricated');
  snapshot.profile.allergies = 'No known allergies, as reported';
  content = sandbox.buildCareSummaryContent(sandbox.buildCareSummaryGroups(snapshot), select(['4:0']), {}, null, today);
  assert.match(content.text, /No known allergies, as reported/);
  assert.doesNotMatch(content.text, /status unknown/, 'An explicit patient statement stays distinct from missing information');
  const markup = sandbox.careSummaryBodyMarkup('A <heading>\n<script>unsafe()</script> & "quoted"\n- A selected detail\n- Another selected detail');
  assert.match(markup, /<h2>A &lt;heading&gt;<\/h2>/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /<ul><li>A selected detail<\/li><li>Another selected detail<\/li><\/ul>/, 'Exported lists retain readable semantic structure');
  assert.ok(sandbox.buildCareSummaryContent(groups, select(['999:0', '4:999']), {}, null, today).error, 'Invalid selection IDs cannot invent facts');
  console.log('Visit brief verification passed: selected/omitted profile details, unknown versus explicit none, intact reactions, provenance, dates/future exclusion, zero values, priorities/questions and safe HTML.');
  verifyWorkflowVM();
})().catch(error => { console.error(error); process.exitCode = 1; });
