'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('health-hub.html');
const js = read('health-hub.js');
const worker = read('service-worker.js');
const main = ['health', 'scan', 'add', 'diary', 'alerts'];
const matches = expression => [...html.matchAll(expression)].map(match => match[1]);
assert.deepEqual(matches(/data-view-panel="([^"]+)"/g).sort(), [...main].sort(), 'Exactly five main sections are required.');
const ids = matches(/\bid="([^"]+)"/g);
assert.equal(new Set(ids).size, ids.length, 'Retained controls must have unique DOM IDs.');
assert.deepEqual(matches(/<h1\b[^>]*>([^<]+)<\/h1>/g), ['My Health','Scan Medication','Add Health Details','My Diary','Alerts'], 'Each main section has its own requested heading.');
const extractElement = (marker, tag) => {
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'Required element exists: ' + marker);
  const elements = new RegExp('</?' + tag + '\\b[^>]*>', 'g');
  elements.lastIndex = start;
  let depth = 0;
  for (let match; (match = elements.exec(html));) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, elements.lastIndex);
  }
  assert.fail('Element has an unmatched closing boundary: ' + marker);
};
const mainSection = view => {
  const opening = html.match(new RegExp('<section\\b[^>]*\\bdata-view-panel="' + view + '"[^>]*>'))?.[0];
  assert.ok(opening, 'Main section exists: ' + view);
  return extractElement(opening, 'section');
};
const sections = Object.fromEntries(main.map(view => [view, mainSection(view)]));
const primary = html.match(/<nav class="primary-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(primary, 'Desktop primary navigation exists.');
assert.deepEqual([...primary.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]), main, 'Desktop tabs use the requested order.');
const mobile = html.match(/<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(mobile, 'Mobile primary navigation exists.');
assert.deepEqual([...mobile.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]), main, 'Mobile has the same five tabs.');
for (const nested of ['ask','profile','medications','documents','symptoms','appointments','results','timeline']) {
  assert.ok(html.includes(`data-hub-panel="${nested}"`), `Useful ${nested} feature remains accessible inside a main tab.`);
}
for (const [view, features] of Object.entries({ health:['details','ask','profile'], add:['quick-add','medications','documents'], diary:['symptoms','appointments','results','timeline'] })) {
  for (const feature of features) assert.ok(sections[view].includes('data-hub-panel="' + feature + '"'), feature + ' belongs inside ' + view + '.');
}
assert.ok(!/data-(?:view|hub)-panel="(?:today|briefing)"|data-hub-panel-target="(?:today|briefing)"|id="view-today"/.test(html), 'Today/briefing must not survive as a standalone or nested overview page.');
assert.ok(!/personal-overview-card|quick-access-orbit|colour-hero-live|overview-strip/.test(html), 'Retired overview hero, duplicate card, orbit and statistics page are absent.');
const details = extractElement('<div class="hub-panel" id="hub-panel-details"', 'div');
assert.ok(details.includes('<details class="health-reminders-disclosure">'), 'Useful reminders remain as a native collapsed disclosure within My Health details.');
for (const target of ['data-open-today-plan','id="today-medication-list"','id="today-appointment-preview"','id="refill-overview-value"','id="today-task-list"','data-open-summary']) {
  assert.ok(details.includes(target), 'My Health retains the useful reminder/preparation target: ' + target);
}
const settings = extractElement('<section class="hub-panel profile-view" id="view-profile"', 'section');
assert.ok(settings.includes('<details class="panel-card memory-card memory-disclosure" id="health-memory-details">'), 'Optional Health Memory is a genuine disclosure under Settings.');
assert.ok(settings.includes('id="health-memory-toggle"') && settings.includes('id="memory-approved-list"'), 'Settings retains the consent control and approved context.');
assert.ok(!details.includes('id="health-memory-details"'), 'Memory settings must not duplicate the main My Health details.');
assert.match(js, /today:\s*\['health',\s*'details'\]/, 'Legacy Today links resolve to My Health details.');
assert.match(js, /health:\s*\['details',\s*'ask',\s*'profile'\]/, 'Health has no hidden overview destination.');
assert.ok(sections.scan.includes('data-open-medication-scanner') && sections.scan.includes('data-modal="medication"'), 'Scan is an actual page with capture and manual-entry actions.');
assert.ok(sections.add.includes('class="add-details-grid"') && sections.add.includes('data-modal="health"'), 'Add is an actual page with working health-entry targets.');
assert.ok(sections.diary.includes('id="symptom-list"') && sections.diary.includes('id="upcoming-appointments-list"'), 'My Diary retains meaningful record lists, not just a destination selector.');
assert.ok(!/data-view-panel="(?:today|ask|profile|symptoms|medications|appointments|results|timeline|documents)"/.test(html), 'Legacy features are not standalone main pages.');
assert.ok(!/href="\/research"/.test(primary + mobile), 'Research is not a main tab.');
for (const id of ['alerts-list','alerts-status','alerts-count']) assert.ok(html.includes(`id="${id}"`), `${id} exists.`);
assert.ok(html.includes('/health-alerts.js?v='), 'The local alert engine is loaded.');
assert.ok(js.includes('DoctorAIHealthAlerts.evaluate'), 'Saved records are checked.');
assert.ok(js.includes('renderHealthAlerts();'), 'The alert list refreshes when records render.');
assert.ok(js.includes('data-refresh-alerts'), 'Manual alert refresh has a handler.');
assert.ok(!html.includes('id="home-prescription-alert"'), 'Alerts must not display the unrelated consented server-check status banner.');
assert.ok(sections.alerts.includes('does not continuously monitor your health') && sections.alerts.includes('No alert does not mean safe.'), 'Alerts disclose monitoring and coverage limits.');
assert.ok(worker.includes('/health-alerts.js?v='), 'The alert engine is in the app shell cache.');
assert.ok(html.includes('data-medication-image-consent'), 'Scanner consent remains explicit.');
assert.ok(js.includes('stopMedicationScannerCamera'), 'Camera cleanup remains available.');
assert.ok(js.includes('/api/stripe/entitlement'), 'Pro entitlement remains server-authoritative.');
assert.ok(js.includes('approvedChatMemory()'), 'Saved chat context retains its consent boundary.');
for (const script of matches(/<script[^>]+src="\/?([^":]+\.js(?:\?[^" ]+)?)"/g)) assert.ok(fs.existsSync(path.join(root,script.split('?')[0])), `Referenced script exists: ${script}`);
console.log('Exactly five destinations, retired overview removal, nested feature placement, inline reminders, Settings consent, Alerts integration and Pro/scanner boundaries verified.');
