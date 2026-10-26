'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = ["about.html","appointment-checklist.html","download.html","health-hub.html","index.html","medication-list-template.html","mobile-auth.html","privacy.html","professional-brief-demo.html","research.html","staff.html","subscription.html","terms.html"];
const read = p => fs.readFileSync(path.join(root,p),'utf8');
for (const page of pages) {
  const html = read(page);
  assert.equal((html.match(/href="\/welcome-system\.css\?v=6"/g)||[]).length, 1, page + ': shared style version');
  assert.match(html, /<body[^>]*(doctorai-homepage|doctorai-public-page|doctorai-system-page|doctorai-about|appointment-guide|medication-guide|aurora-demo-page|data-hub-layout="reference")/, page + ': covered body');
}
const css = read('welcome-system.css');
const correction = css.slice(css.indexOf('/* Whole-site aurora system.'), css.indexOf('/* Personal Today suggestions'));
assert.ok(correction.startsWith('/* Whole-site aurora system.'));
assert.match(correction, /@media screen/);
assert.match(correction, /@media \(forced-colors: active\)/);
assert.match(correction, /background-size: 100% 100%/);
assert.match(correction, /--aurora-base: #dceefa/);
assert.match(correction, /background-image: var\(--welcome-atmosphere\)/);
assert.doesNotMatch(correction, /animation\s*:|transition\s*:|display\s*:|visibility\s*:|opacity\s*:/);
assert.doesNotMatch(correction, /\.hub-alert-card\s*\{|\.emergency-card\s*\{|\.checkout-dialog\s*\{/);
for(const selector of ['.pro-shell','main > .panel','.home-destination','.research-hero','.plan-card','.doctorai-site-footer','.today-focus-card','.reference-brief-card','.profile-shortcut-card','.library-card','.document-card','.result-list-card','.timeline-card','.diary-question-panel','.upcoming-card']) assert.ok(correction.includes(selector), selector);
const worker = read('service-worker.js');
assert.match(worker, /doctorai-shell-v196/);
for (const page of pages) assert.ok(worker.includes(read(page).match(/welcome-system\.css\?v=\d+/)[0]), page + ': exact shared asset in cache');
assert.ok(worker.includes(read('health-hub.html').match(/health-tool-landing\.css\?v=\d+/)[0]));
const hub = read('health-hub.html');
for(const route of ['health','visit-prep','profile','medications','documents','results','timeline','ask','alerts']) assert.ok(hub.includes('view-'+route), route);
console.log('Whole-site style: 13 first-party templates, app route inventory, shared style/cache versions, static motion and explicit non-clinical selector coverage verified. Source checks, not mobile visual QA.');

