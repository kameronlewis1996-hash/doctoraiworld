'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('research.html');
const source = read('research.js');
const template = read('medication-list-template.html');

assert.doesNotMatch(html, /best paper|every paper keeps.*limitations visible/i);
assert.match(html, /up to 30 returned Europe PMC records/);
assert.match(html, /not a study-quality rating or clinical review/);
assert.match(html, /seven days, expanding to 30 days if empty/);
assert.match(html, /Study-specific limitations are not assessed here/);
assert.match(html, /research\.js\?v=10/);

// Exercise the production card renderers with fictional metadata, without network requests.
const results = { innerHTML: '', setAttribute() {} };
const context = { results, heading: { textContent: '' }, URLSearchParams, AbortController };
vm.createContext(context);
const start = source.indexOf('  const escape =');
const end = source.indexOf('  const renderError =');
assert.ok(start >= 0 && end > start, 'Production card renderer boundaries exist.');
vm.runInContext(source.slice(start, end) + '\nglobalThis.cards = { highlightMarkup, render, selectHighlight };', context);
const fixture = {
  title: 'Fictional <example>', journal: 'Synthetic journal', date: '2026-10-20',
  abstract: 'Fictional abstract for interface testing only.', authors: 'Example author',
  citations: 0, openAccess: false, url: 'https://example.test/fictional-paper'
};
const highlight = context.cards.highlightMarkup(fixture);
assert.match(highlight, /Fictional &lt;example&gt;/);
assert.match(highlight, /Synthetic journal/);
assert.match(highlight, /2026-10-20/);
assert.match(highlight, /Limitations not assessed/);
assert.match(highlight, /Read the full paper/);
assert.ok(highlight.indexOf('Limitations not assessed') < highlight.indexOf('Read the original paper'));
context.cards.render([fixture, { ...fixture, title: 'Second fictional example' }]);
assert.equal((results.innerHTML.match(/Limitations not assessed/g) || []).length, 2, 'Every populated search card carries the reading limitation.');
assert.match(results.innerHTML, /Fictional &lt;example&gt;/);
assert.doesNotMatch(results.innerHTML, /<h3>Fictional <example>/);
assert.equal(context.cards.selectHighlight([fixture, { ...fixture, title: 'Citation signal', citations: 20 }]).title, 'Citation signal');
assert.equal(context.cards.selectHighlight([fixture, { ...fixture, title: 'Date tie breaker', date: '2026-10-21' }]).title, 'Date tie breaker');
assert.match(source, /pick\.fallback \? 'Past 30 days' : 'Past seven days'/);
// The notice is a div so the existing abstract paragraph line-clamp cannot hide it.
assert.match(highlight, /<div class="paper-reading-note">/);

assert.doesNotMatch(template, /limited database check|<strong>Last checked:<\/strong>/i);
assert.match(template, /My list last updated:<\/strong> ____________________/);
assert.match(template, /Appointment date:<\/strong> ____________________/);
assert.match(template, /Medicine-name catalogue source date: 1 October 2026/);
assert.match(template, /not the date your own medication list was updated or reviewed/);
assert.match(template, /separately consented check against a small set of DoctorAI-hosted curated rules/);
assert.match(template, /Unmatched medicines and risks outside these rules remain unassessed/);
assert.match(template, /href="\/privacy">medication-check privacy and coverage details/);
assert.match(read('privacy.html'), /DoctorAI-hosted curated rules/);
assert.match(read('subscription.js'), /item\.amount === 2900 && item\.currency === 'NZD'/);
assert.match(read('subscription.js'), /item\.amount === 699 && item\.currency === 'NZD'/);
assert.match(read('server-src/stripe/plan-catalog.cjs'), /currency: 'nzd', unitAmount: 2900/);
const subscription = read('subscription.html');
assert.match(subscription, /data-plan="weekly"/);
assert.match(subscription, /<h3>Files and label scanning<\/h3>/);
assert.doesNotMatch(subscription, /<h3>Always-ready care<\/h3>/);
assert.match(subscription, /Free: organise medicines and questions, then build a visit brief from details you choose\./);
assert.match(subscription, /consent-based medicine-label text extraction you review before saving/);
assert.doesNotMatch(subscription, /document (?:text )?extraction|document OCR/i, 'General document uploads must not be described as OCR.');
assert.match(subscription, /<meta property="og:image:alt" content="DoctorAI Personal Health Hub graphic/);
assert.match(subscription, /<meta name="twitter:image:alt" content="DoctorAI Personal Health Hub graphic/);
assert.match(subscription, /DoctorAI does not diagnose, prescribe or replace professional care/);
assert.doesNotMatch(read('staff.html'), /four fictional sample records/, 'The production release excludes the separate fictional staff-pair demo.');
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  const page = read(name);
  if (/<meta property="og:image" content=/.test(page)) assert.match(page, /<meta property="og:image:alt" content=/, `${name} must describe its Open Graph image.`);
  if (/<meta name="twitter:image" content=/.test(page)) assert.match(page, /<meta name="twitter:image:alt" content=/, `${name} must describe its Twitter image.`);
}
assert.match(read('health-hub.html'), /<meta property="og:image:alt" content="DoctorAI Personal Health Hub graphic/);
assert.match(read('health-hub.html'), /<meta name="twitter:image:alt" content="DoctorAI Personal Health Hub graphic/);
assert.match(read('terms.html'), /<meta property="og:image:alt" content="DoctorAI Personal Health Hub graphic/);
assert.match(read('sitemap.xml'), /<loc>https:\/\/www\.doctoraiworld\.com\/about<\/loc>/);
assert.match(read('sitemap.xml'), /<url><loc>https:\/\/www\.doctoraiworld\.com\/subscription<\/loc><lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/lastmod><\/url>/);
console.log('Public copy consistency passed: content claims match supported features; social images have text alternatives; discoverable trust and subscription routes are listed with accurate update dates.');
