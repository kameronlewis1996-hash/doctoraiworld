'use strict';

// Exercises the real presentation function with fake DOM sinks. All records
// and adversarial values below are synthetic; nothing is read from a browser,
// account, network, or production store.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHealthAlertsEngine } = require('../server-src/health/alerts-engine.cjs');
const medicationEngine = require('../server-src/medication/safety-engine.cjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
const functionStart = source.indexOf('  function renderHealthAlerts() {');
const functionEnd = source.indexOf('\n  function renderAll() {', functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'The actual renderHealthAlerts function must be present.');
const rendererSource = source.slice(functionStart, functionEnd).trim();
const escapeDeclaration = source.match(/^\s*const escapeHTML = .*;$/m)?.[0];
assert.ok(escapeDeclaration, 'The actual health-hub HTML escaping helper must be present.');
const escapeExpression = escapeDeclaration.replace(/^\s*const escapeHTML = /, '').replace(/;$/, '');

let checks = 0;
const check = (name, callback) => {
  callback();
  checks += 1;
  console.log(`✓ ${name}`);
};

const node = initialHTML => ({
  innerHTML: initialHTML || '',
  textContent: '',
  clearCalls: 0,
  replaceChildren() {
    this.innerHTML = '';
    this.clearCalls += 1;
  }
});

function harness({ result, evaluate, missingEngine = false } = {}) {
  const nodes = {
    '#alerts-list': node(),
    '#alerts-status': node(),
    '#alerts-count': node(),
    '#alerts-controls': node()
  };
  const context = vm.createContext({
    window: {
      DoctorAIHealthAlerts: missingEngine ? null : { evaluate: evaluate || (() => result) },
      DoctorAIIcons: { hydrate() {} }
    },
    document: {},
    state: { profile: {}, medications: [], timeline: [], measurements: [], memoryDetails: [] },
    medicationCheckController: { snapshot: () => null },
    $: selector => nodes[selector] || null,
    iconMarkup: name => `<i data-test-icon="${name}"></i>`
  });
  context.escapeHTML = vm.runInContext(`(${escapeExpression})`, context);
  const render = vm.runInContext(`(${rendererSource})`, context, { timeout: 1000 });
  return { render, nodes, context };
}

const payloads = {
  title: `<script>title()</script>&"'`,
  message: `<img src=x onerror="message()"> &`,
  triggerLabel: `<b>medicine</b> &`,
  triggerValue: `Tablet <svg onload=trigger()> & "`,
  nextAction: `<a href="javascript:next()">change medicine</a> &`,
  sourceTitle: `<iframe src=x>source</iframe> &`,
  sourceNote: `<small onmouseover=source()> &`,
  sourceCheckedOn: `<time onload=checked()> &`,
  sourcePublisher: `<b>Backup source</b> &`,
  ruleId: `rule-<img src=x onerror=rule()>`,
  unknownMedicine: `<img src=x onerror=unknown()> &`,
  unmatchedCondition: `<svg onload=condition()> &`,
  unmatchedSymptom: `<script>symptom()</script> &`,
  limitation: `<marquee onstart=limit()> &`,
  missingField: `allergies & <img src=x onerror=missing()>`,
  cataloguePublisher: `<b>Schedule source</b> &`,
  attribution: `Attribution <em>terms</em> &`,
  licence: `Licence <i>notice</i> &`,
  catalogueDisclaimer: `Catalogue <script>disclaimer()</script> &`
};

const adversarialResult = {
  alerts: [{
    severity: `critical<script>`,
    title: payloads.title,
    message: payloads.message,
    triggers: [{ kind: 'medication', label: payloads.triggerLabel, value: payloads.triggerValue }],
    nextAction: payloads.nextAction,
    ruleId: payloads.ruleId,
    sources: [
      { title: payloads.sourceTitle, url: 'https://source.example/rule?a=1&b=2', checkedOn: payloads.sourceCheckedOn, currentnessNote: payloads.sourceNote },
      { title: `Unsafe JavaScript source &`, url: 'javascript:alert(1)', sourceStatus: 'synthetic' },
      { title: 'Plain HTTP source', url: 'http://insecure.example/path', sourceStatus: 'synthetic' },
      { publisher: payloads.sourcePublisher, sourceStatus: 'synthetic' }
    ]
  }],
  coverage: {
    medications: {
      requested: 5, checked: 4, resolved: 3,
      excludedInactiveOrOutOfDate: 1, omittedByLimit: 1,
      unknown: [{ name: payloads.unknownMedicine }]
    },
    medicationMedication: { ruleCount: 12, limitation: 'Dose, route and timing are not assessed.' },
    allergyMedication: { recorded: 3, affirmative: 1, excludedOrUncertain: 1, omittedByLimit: 1, limitation: 'Allergy rules are limited.' },
    conditionMedication: { recorded: 2, affirmative: 1, omittedByLimit: 1, unmatched: [payloads.unmatchedCondition], limitation: 'Condition rules are limited.' },
    symptoms: {
      recorded: 4, recent: 2, matched: 1, excludedHistoricalOrInactive: 1,
      undated: 1, omittedByLimit: 1, unmatched: [payloads.unmatchedSymptom],
      limitation: 'Only selected symptom phrases are checked.'
    },
    symptomMedication: { limitation: 'Only selected symptom and medicine contexts are checked.' },
    conditionSymptoms: { limitation: 'Only a narrow condition and symptom context is checked.' },
    healthDetails: { limitation: 'Only selected saved detail conflicts are checked.' },
    results: { limitation: 'Measurements and results are not interpreted.' },
    missing: [payloads.missingField],
    limitation: payloads.limitation,
    contextRulesetVersion: 'synthetic-rules-v1',
    contextEvidenceCheckedOn: '2026-10-11',
    catalogue: {
      publisher: payloads.cataloguePublisher,
      sourceUrl: 'https://catalogue.example/list?x=1&y=2',
      attribution: payloads.attribution,
      effectiveDate: '2026-10-01',
      licence: { name: payloads.licence, url: 'javascript:alert(2)', source: 'https://licence.example/source' },
      disclaimer: payloads.catalogueDisclaimer
    }
  }
};

check('real renderer reports the count, title, trigger, and next action', () => {
  const { render, nodes, context } = harness({ result: adversarialResult });
  render();
  assert.equal(nodes['#alerts-count'].textContent, '1 notice to review');
  const html = nodes['#alerts-list'].innerHTML;
  for (const text of ['hub-alert-title', 'What triggered this', 'Next step']) assert.ok(html.includes(text));
  for (const key of ['title', 'triggerValue', 'nextAction']) assert.ok(html.includes(context.escapeHTML(payloads[key])), `${key} must appear in escaped alert content.`);
});

check('severity is allowlisted before it reaches markup or icon selection', () => {
  const { render, nodes } = harness({ result: adversarialResult });
  render();
  assert.match(nodes['#alerts-list'].innerHTML, /data-severity="info"/);
  assert.match(nodes['#alerts-list'].innerHTML, /data-test-icon="info"/);
  assert.doesNotMatch(nodes['#alerts-list'].innerHTML, /critical|<script>/i);
});

check('alert text, source text, coverage values, unmatched entries, and attribution are escaped', () => {
  const { render, nodes, context } = harness({ result: adversarialResult });
  render();
  const alertHTML = nodes['#alerts-list'].innerHTML;
  const coverageHTML = nodes['#alerts-controls'].innerHTML;
  for (const key of ['title', 'message', 'triggerLabel', 'triggerValue', 'nextAction', 'sourceTitle', 'sourceNote', 'sourceCheckedOn', 'sourcePublisher', 'ruleId']) {
    assert.ok(alertHTML.includes(context.escapeHTML(payloads[key])), `${key} must be escaped in the alert output.`);
  }
  for (const key of ['unknownMedicine', 'unmatchedCondition', 'unmatchedSymptom', 'limitation', 'missingField', 'cataloguePublisher', 'attribution', 'licence', 'catalogueDisclaimer']) {
    assert.ok(coverageHTML.includes(context.escapeHTML(payloads[key])), `${key} must be escaped in the coverage output.`);
  }
  assert.doesNotMatch(alertHTML + coverageHTML, /<script\b|<img\b|<iframe\b|<marquee\b|<small onmouseover|<time onload|<b>(?:medicine|Backup source|Schedule source)/i);
});

check('only HTTPS source URLs become links', () => {
  const { render, nodes } = harness({ result: adversarialResult });
  render();
  const html = nodes['#alerts-list'].innerHTML + nodes['#alerts-controls'].innerHTML;
  const hrefs = [...html.matchAll(/\bhref="([^"]*)"/g)].map(match => match[1]);
  assert.equal(hrefs.length, 2, 'The secure alert source and catalogue source should be linked.');
  for (const href of hrefs) assert.match(href, /^https:\/\//i);
  assert.doesNotMatch(html, /href="(?:javascript|http):/i);
  assert.match(html, /Unsafe JavaScript source &amp;/);
  assert.match(html, /Plain HTTP source/);
  assert.match(html, /rel="noopener noreferrer"/);
});

check('all recorded omission, exclusion, and undated counts appear in the coverage disclosure', () => {
  const { render, nodes } = harness({ result: adversarialResult });
  render();
  const html = nodes['#alerts-controls'].innerHTML;
  for (const evidence of [
    '5 entries recorded; 4 assessed for catalogue matching; 3 recognised. 1 inactive or out-of-date entries excluded; 1 omitted by the input limit.',
    '3 allergy entries recorded; 1 affirmative; 1 excluded or uncertain; 1 omitted by the input limit.',
    '2 condition entries recorded; 1 affirmative; 1 omitted by the input limit.',
    '4 entries recorded; 2 recent; 1 matched. 1 historical or inactive entries excluded; 1 undated; 1 omitted by the input limit.'
  ]) assert.ok(html.includes(evidence), `Coverage disclosure must include: ${evidence}`);
});

check('catalogue attribution and effective date render in the coverage disclosure', () => {
  const { render, nodes } = harness({ result: adversarialResult });
  render();
  const html = nodes['#alerts-controls'].innerHTML;
  assert.match(html, /hub-alert-catalogue/);
  assert.match(html, /Effective 2026-10-01/);
  assert.match(html, /catalogue\.example\/list\?x=1&amp;y=2/);
});

check('actual engine structured licence and dated source evidence render', () => {
  const actualEngine = createHealthAlertsEngine(medicationEngine);
  const { render, nodes } = harness({ evaluate: input => actualEngine.evaluate({
    ...input,
    profile: { conditions: ['asthma'] },
    medications: [
      { id: 'synthetic-warfarin', name: 'Warfarin' },
      { id: 'synthetic-sulfamethoxazole', name: 'Sulfamethoxazole' }
    ]
  }) });
  render();
  const alertHTML = nodes['#alerts-list'].innerHTML;
  const coverageHTML = nodes['#alerts-controls'].innerHTML;
  assert.match(alertHTML, /Source checked: 2026-10-13/);
  assert.match(coverageHTML, /<a href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"[^>]*>CC BY 4\.0<\/a>/);
  assert.match(coverageHTML, /Context source URLs checked 2026-10-11/);
});

check('adversarial structured licence URLs are escaped and never linked', () => {
  const { render, nodes, context } = harness({ result: adversarialResult });
  render();
  const html = nodes['#alerts-controls'].innerHTML;
  assert.ok(html.includes(context.escapeHTML(payloads.licence)));
  assert.doesNotMatch(html, /href="(?:javascript|http):/i);
});

check('actual engine empty output is framed as limited and does not imply safety', () => {
  const actualEngine = createHealthAlertsEngine(medicationEngine);
  const { render, nodes } = harness({ evaluate: input => actualEngine.evaluate(input) });
  render();
  assert.equal(nodes['#alerts-count'].textContent, '0 notices to review');
  assert.match(nodes['#alerts-list'].innerHTML, /No matching notices in the limited checks/);
  assert.match(nodes['#alerts-list'].innerHTML, /This result does not confirm safety/);
  assert.match(nodes['#alerts-controls'].innerHTML, /No alert does not mean safe/);
  assert.match(nodes['#alerts-status'].textContent, /Coverage remains limited/);
});

check('actual engine record values are escaped by the real renderer', () => {
  const actualEngine = createHealthAlertsEngine(medicationEngine);
  const { render, nodes, context } = harness({ evaluate: input => actualEngine.evaluate({ ...input, medications: [{ id: 'fake-1', name: payloads.unknownMedicine }] }) });
  render();
  assert.ok(nodes['#alerts-list'].innerHTML.includes(context.escapeHTML(payloads.unknownMedicine)));
  assert.ok(nodes['#alerts-controls'].innerHTML.includes(context.escapeHTML(payloads.unknownMedicine)));
  assert.doesNotMatch(nodes['#alerts-list'].innerHTML + nodes['#alerts-controls'].innerHTML, /<img\b/i);
});

check('missing engine clears stale alert list and coverage controls', () => {
  const { render, nodes } = harness({ missingEngine: true });
  nodes['#alerts-list'].innerHTML = '<article>OLD ALERT</article>';
  nodes['#alerts-controls'].innerHTML = '<details>OLD PRIVATE MEDICINE</details>';
  render();
  assert.equal(nodes['#alerts-list'].innerHTML, '');
  assert.equal(nodes['#alerts-controls'].innerHTML, '');
  assert.equal(nodes['#alerts-list'].clearCalls, 1);
  assert.equal(nodes['#alerts-controls'].clearCalls, 1);
  assert.equal(nodes['#alerts-count'].textContent, 'Checks unavailable');
  assert.match(nodes['#alerts-status'].textContent, /have not been assessed/);
});

check('throwing engine clears stale alert list and coverage controls', () => {
  const { render, nodes } = harness({ evaluate: () => { throw new Error('synthetic failure'); } });
  nodes['#alerts-list'].innerHTML = '<article>OLD ALERT</article>';
  nodes['#alerts-controls'].innerHTML = '<details>OLD PRIVATE MEDICINE</details>';
  render();
  assert.equal(nodes['#alerts-list'].innerHTML, '');
  assert.equal(nodes['#alerts-controls'].innerHTML, '');
  assert.equal(nodes['#alerts-list'].clearCalls, 1);
  assert.equal(nodes['#alerts-controls'].clearCalls, 1);
  assert.equal(nodes['#alerts-count'].textContent, 'Checks unavailable');
  assert.match(nodes['#alerts-status'].textContent, /No current alert result is available/);
});

console.log(`Alert presentation verified: ${checks} checks passed using the actual renderer and synthetic local fixtures.`);
