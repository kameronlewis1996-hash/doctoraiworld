'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('health-hub.html');
const js = read('health-hub.js');
const worker = read('service-worker.js');
const main = ['today', 'health', 'visit-prep', 'profile'];
const secondary = ['scan', 'add', 'diary', 'alerts'];
const views = [...main, ...secondary];
const matches = expression => [...html.matchAll(expression)].map(match => match[1]);
assert.deepEqual(matches(/data-view-panel="([^"]+)"/g).sort(), [...views].sort(), 'Four main destinations and four retained secondary views are required.');
const ids = matches(/\bid="([^"]+)"/g);
assert.equal(new Set(ids).size, ids.length, 'Retained controls must have unique DOM IDs.');
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
const viewSection = view => {
  const opening = html.match(new RegExp('<section\\b[^>]*\\bdata-view-panel="' + view + '"[^>]*>'))?.[0];
  assert.ok(opening, 'Destination section exists: ' + view);
  return extractElement(opening, 'section');
};
const sections = Object.fromEntries(views.map(view => [view, viewSection(view)]));
for (const view of views) {
  const headings = [...sections[view].matchAll(/<h1\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(headings.length, 1, `The ${view} destination has one primary heading.`);
  assert.ok(headings[0][2].replace(/<[^>]*>/g, '').trim(), `The ${view} heading is not empty.`);
  const labelledBy = sections[view].match(/^<section\b[^>]*\baria-labelledby="([^"]+)"/)?.[1];
  assert.equal(headings[0][1], labelledBy, `The ${view} section is labelled by its visible heading.`);
}
const primary = html.match(/<nav class="primary-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(primary, 'Desktop primary navigation exists.');
assert.deepEqual([...primary.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]), main, 'Desktop tabs use the requested order.');
const mobile = html.match(/<nav class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(mobile, 'Mobile primary navigation exists.');
assert.deepEqual([...mobile.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]), main, 'Mobile has the same four main destinations.');
const category = html.match(/<nav class="category-bar"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert.ok(category, 'Compact main navigation exists.');
assert.deepEqual([...category.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]), main, 'Compact navigation preserves the four main destinations and their order.');
for (const nested of ['ask','medications','documents','symptoms','appointments','results','timeline']) {
  assert.ok(html.includes(`data-hub-panel="${nested}"`), `Useful ${nested} feature remains accessible inside its destination.`);
}
for (const [view, features] of Object.entries({ health:['details','ask'], add:['quick-add','medications','documents'], diary:['symptoms','appointments','results','timeline'] })) {
  for (const feature of features) assert.ok(sections[view].includes('data-hub-panel="' + feature + '"'), feature + ' belongs inside ' + view + '.');
}
assert.ok(!/data-view-panel="briefing"|data-hub-panel="(?:today|briefing|profile)"|data-hub-panel-target="(?:today|briefing|profile)"/.test(html), 'Today and Profile are main destinations, without duplicate nested overview or settings pages.');
assert.ok(!/personal-overview-card|quick-access-orbit|colour-hero-live|overview-strip/.test(html), 'Retired overview hero, duplicate card, orbit and statistics page are absent.');
const details = extractElement('<div class="hub-panel" id="hub-panel-details"', 'div');
assert.ok(details.includes('<details class="health-reminders-disclosure">'), 'Useful reminders remain as a native collapsed disclosure within My Health details.');
for (const target of ['data-open-today-plan','id="today-medication-list"','id="today-appointment-preview"','id="refill-overview-value"','id="today-task-list"','data-open-summary']) {
  assert.ok(details.includes(target), 'My Health retains the useful reminder/preparation target: ' + target);
}
const settings = sections.profile;
assert.ok(settings.includes('<details class="panel-card memory-card memory-disclosure" id="health-memory-details">'), 'Optional Health Memory is a genuine disclosure in standalone Profile.');
assert.ok(settings.includes('id="health-memory-toggle"') && settings.includes('id="memory-approved-list"'), 'Profile retains the consent control and approved context.');
assert.ok(settings.includes('data-open-profile') && settings.includes('data-show-privacy'), 'Profile retains account settings and privacy controls.');
assert.ok(!details.includes('id="health-memory-details"'), 'Memory settings must not duplicate the main My Health details.');
assert.match(js, /health:\s*\['details',\s*'ask'\]/, 'My Health keeps details and Ask; Profile remains standalone.');
const routeStart = js.indexOf('const viewNames =');
const routeEnd = js.indexOf('const storagePrefix =', routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart, 'Actual route definitions can be exercised without starting the app.');
const resolveRoute = vm.runInNewContext(js.slice(routeStart, routeEnd) + '\nresolveHubRoute;', {}, { timeout: 1000 });
const routeFixtures = {
  today: ['today',''], health: ['health','details'], 'visit-prep': ['visit-prep',''], profile: ['profile',''],
  scan: ['scan',''], add: ['add','quick-add'], diary: ['diary','symptoms'], alerts: ['alerts',''],
  ask: ['health','ask'], medications: ['add','medications'], documents: ['add','documents'],
  symptoms: ['diary','symptoms'], appointments: ['diary','appointments'], results: ['diary','results'], timeline: ['diary','timeline'],
  memory: ['profile',''], summary: ['visit-prep',''], visit: ['visit-prep','']
};
for (const [name, [view, panel]] of Object.entries(routeFixtures)) {
  assert.deepEqual(JSON.parse(JSON.stringify(resolveRoute(name))), { view, panel }, `The actual ${name} route preserves its intended destination.`);
}
assert.deepEqual(JSON.parse(JSON.stringify(resolveRoute('unknown-route'))), { view:'today', panel:'' }, 'An unknown route returns to Today.');
assert.deepEqual(JSON.parse(JSON.stringify(resolveRoute('profile','details'))), { view:'profile', panel:'' }, 'Profile cannot reopen the retired nested details route.');
for (const view of secondary) {
  const returnPath = sections[view].match(/<nav\b[^>]*class="hub-path"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(returnPath && /<button\b[^>]*data-view="health"/.test(returnPath), `The ${view} view has an actual return-to-My-health button.`);
}
const showStart = js.indexOf('function showView(');
const showEnd = js.indexOf('function renderTodayMedications(', showStart);
assert.ok(showStart >= 0 && showEnd > showStart, 'Actual navigation presentation and canonical links can be exercised.');
const routeViews = Object.fromEntries(views.map(view => [view, {
  dataset: { viewPanel:view }, classList: { toggle() {} }, querySelectorAll: () => [],
  heading: { textContent:'' }, path: secondary.includes(view) ? { textContent:'' } : null,
  querySelector(selector) { return selector === ':scope > .page-heading h1' ? this.heading : selector === '.hub-path-copy' ? this.path : null; }
}]));
const routeLocation = { hash:'' };
const routeHistory = { state:null, pushState(state, title, hash) { this.state=state; routeLocation.hash=hash; }, replaceState(state, title, hash) { this.state=state; routeLocation.hash=hash; } };
const navigationContext = {
  currentView:'today', currentHubPanel:'', document:{ body:{dataset:{}}, title:'', querySelectorAll:() => [], querySelector(selector) { const view=selector.match(/^\[data-view-panel="([^"]+)"\]$/)?.[1]; return routeViews[view] || null; } },
  els:{views:Object.values(routeViews)}, location:routeLocation, history:routeHistory,
  sessionStorage:{setItem() {}}, refreshMedicationCheckContext:() => Promise.resolve(), prefersReducedMotion:() => true,
  window:{scrollTo() {},dispatchEvent() {}}, CustomEvent:class { constructor(type, options) { this.type=type; this.detail=options.detail; } }
};
vm.createContext(navigationContext);
vm.runInContext(js.slice(routeStart, routeEnd) + '\n' + js.slice(showStart, showEnd) + '\nthis.routeNavigate=showView;', navigationContext, { timeout:1000 });
const canonicalFixtures = [
  ['today','#today'], ['health','#health'], ['visit-prep','#visit-prep'], ['profile','#profile'],
  ['scan','#scan'], ['add','#add'], ['diary','#symptoms'], ['alerts','#alerts'],
  ['ask','#ask'], ['medications','#medications'], ['documents','#documents'], ['symptoms','#symptoms'],
  ['appointments','#appointments'], ['results','#results'], ['timeline','#timeline']
];
for (const [name, hash] of canonicalFixtures) {
  navigationContext.routeNavigate(name, true, false);
  assert.equal(routeLocation.hash, hash, `The actual ${name} navigation writes a copyable section alias.`);
  assert.deepEqual(JSON.parse(JSON.stringify(resolveRoute(hash.slice(1)))), JSON.parse(JSON.stringify(resolveRoute(name))), `A copied ${name} link restores the same section without history state.`);
}
assert.equal(routeViews.diary.path.textContent, 'My health / Diary / History', 'The return path identifies the selected nested Diary section.');
navigationContext.routeNavigate('medications', true, false);
assert.equal(routeViews.add.path.textContent, 'My health / Medicines', 'The medicine path uses the actual selected nested section.');
navigationContext.routeNavigate('ask', true, false);
assert.equal(navigationContext.document.title, 'Ask DoctorAI · DoctorAI Personal Health Hub', 'Ask has a matching document title.');
const storageStart = js.indexOf('function renderStorageStatus(');
const storageEnd = js.indexOf('function accountSyncScope(', storageStart);
assert.ok(storageStart >= 0 && storageEnd > storageStart, 'Actual privacy status rendering is available.');
for (const fixture of [
  { id:'anonymous-choice', allowed:false, choice:'', user:null, sync:'not-signed-in', enabled:true, device:'Choose storage', account:'Not signed in' },
  { id:'session-without-local-storage', allowed:false, choice:'session', user:null, sync:'not-signed-in', enabled:true, device:'This session only', account:'Not signed in' },
  { id:'device-choice', allowed:true, choice:'yes', user:null, sync:'not-signed-in', enabled:true, device:'Keep between visits', account:'Not signed in' },
  { id:'sign-in-pending', allowed:false, choice:'session', user:null, sync:'not-signed-in', enabled:true, verification:'pending', device:'This session only', account:'Checking sign-in' },
  { id:'sign-in-failed', allowed:true, choice:'yes', user:null, sync:'not-signed-in', enabled:true, verification:'failed', device:'Keep between visits', account:'Sign-in not confirmed' },
  { id:'signed-in-checking', allowed:false, choice:'session', user:{name:'Fictional user'}, sync:'checking', enabled:true, device:'This session only', account:'Checking private account sync' },
  { id:'signed-in-ready', allowed:false, choice:'session', user:{name:'Fictional user'}, sync:'ready', enabled:true, dataReady:true, device:'This session only', account:'Private account sync active' },
  { id:'signed-in-ready-without-data', allowed:false, choice:'session', user:{name:'Fictional user'}, sync:'ready', enabled:true, dataReady:false, device:'This session only', account:'Account sync not confirmed' },
  { id:'signed-in-failure', allowed:true, choice:'yes', user:{name:'Fictional user'}, sync:'unconfirmed', enabled:true, device:'Keep between visits', account:'Account sync not confirmed' },
  { id:'signed-in-storage-unavailable', allowed:false, choice:'session', user:{name:'Fictional user'}, sync:'ready', enabled:false, device:'This session only', account:'Account sync unavailable' }
]) {
  const nodes = { '#hub-device-storage-state':{textContent:''}, '#hub-account-sync-state':{textContent:''}, '#hub-account-sync-note':{textContent:''} };
  const context = { $:selector => nodes[selector] || null, localStorageAllowed:fixture.allowed, deviceStorageChoice:fixture.choice, authUser:fixture.user, accountSyncState:fixture.sync, cloudSyncEnabled:fixture.enabled, accountSessionVerification:fixture.verification || 'verified', medicationAccountDataReady:fixture.dataReady === true, localStorage:{getItem() { throw new Error('Status must use current app state, not reread storage.'); }} };
  vm.runInNewContext(js.slice(storageStart, storageEnd) + '\nrenderStorageStatus();', context, { timeout:1000 });
  assert.equal(nodes['#hub-device-storage-state'].textContent, fixture.device, `${fixture.id}: the device status follows the current choice.`);
  assert.equal(nodes['#hub-account-sync-state'].textContent, fixture.account, `${fixture.id}: signed-in and unconfirmed sync states stay distinct.`);
  assert.ok(nodes['#hub-account-sync-note'].textContent, `${fixture.id}: account sync has explanatory text.`);
}
const scopeStart = js.indexOf('function accountSyncScope(');
const scopeEnd = js.indexOf('function setSyncStatus(', scopeStart);
assert.ok(scopeStart >= 0 && scopeEnd > scopeStart, 'Actual account response status guard is available.');
const scopeContext = { authUser:{sub:'fictional-a',email:'A@example.test'}, accountSessionRevision:1, accountSyncState:'checking', renderCount:0 };
scopeContext.renderStorageStatus = () => { scopeContext.renderCount += 1; };
vm.createContext(scopeContext);
vm.runInContext(js.slice(scopeStart, scopeEnd) + '\nthis.responseScope=accountSyncScope;this.responseStatus=setAccountSyncState;', scopeContext, { timeout:1000 });
const firstAccountScope = scopeContext.responseScope();
scopeContext.authUser = {sub:'fictional-b',email:'b@example.test'};
scopeContext.accountSessionRevision = 2;
scopeContext.responseStatus('ready', firstAccountScope);
assert.equal(scopeContext.accountSyncState, 'checking', 'An old account response cannot mark the new account synced.');
assert.equal(scopeContext.renderCount, 0, 'An old account response cannot refresh the new account status display.');
const secondAccountScope = scopeContext.responseScope();
scopeContext.responseStatus('ready', secondAccountScope);
assert.equal(scopeContext.accountSyncState, 'ready', 'The current account response can confirm its own sync status.');
assert.equal(scopeContext.renderCount, 1, 'A current account response refreshes the status display.');
scopeContext.accountSyncState = 'checking';
scopeContext.accountSessionRevision += 1;
scopeContext.responseStatus('unconfirmed', secondAccountScope);
assert.equal(scopeContext.accountSyncState, 'checking', 'A stale response from an earlier session of the same account is ignored.');
const revisedScope = scopeContext.responseScope();
scopeContext.responseStatus('unconfirmed', revisedScope);
assert.equal(scopeContext.accountSyncState, 'unconfirmed', 'The current session can report a failed sync response.');
scopeContext.authUser = null;
scopeContext.accountSyncState = 'not-signed-in';
scopeContext.responseStatus('ready', revisedScope);
assert.equal(scopeContext.accountSyncState, 'not-signed-in', 'A late signed-in response cannot restore status after sign-out.');
assert.ok(sections.today.includes('data-modal="medication"') && sections.today.includes('data-open-medication-scanner'), 'Today exposes actual manual medication entry and the existing scanner action.');
assert.match(sections.today, /<button\b[^>]*data-open-medication-scanner[^>]*>[\s\S]*?Pro[\s\S]*?<\/button>/, 'Today identifies the scanner as a Pro action.');
assert.ok(sections.today.includes('data-view="medications"') && sections.today.includes('data-view="visit-prep"'), 'Today connects its medicine card and appointment preparation to the retained tools.');
assert.ok(sections['visit-prep'].includes('data-open-summary'), 'Visit prep opens the existing brief builder.');
for (const target of ['data-care-summary-form','care-summary-reviewed','data-print-care-summary','data-copy-care-summary']) assert.ok(js.includes(target), `The reviewed brief flow retains ${target}.`);
assert.ok(sections.scan.includes('data-open-medication-scanner') && sections.scan.includes('data-modal="medication"'), 'Scan is an actual page with capture and manual-entry actions.');
assert.ok(sections.add.includes('class="add-details-grid"') && sections.add.includes('data-modal="health"'), 'Add is an actual page with working health-entry targets.');
assert.ok(sections.diary.includes('id="symptom-list"') && sections.diary.includes('id="upcoming-appointments-list"'), 'My Diary retains meaningful record lists, not just a destination selector.');
assert.ok(!/data-view-panel="(?:ask|symptoms|medications|appointments|results|timeline|documents)"/.test(html), 'Nested tools do not become extra main destinations.');
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
assert.ok(html.includes('id="storage-consent"') && html.includes('data-device-storage-allow') && html.includes('data-device-storage-session'), 'Both device/session storage choices remain available.');
assert.ok(html.includes('data-google-signin') && js.includes('/api/auth/google'), 'Google sign-in retains the existing UI and auth route.');
assert.ok(js.includes('stopMedicationScannerCamera'), 'Camera cleanup remains available.');
assert.ok(js.includes('/api/stripe/entitlement'), 'Pro entitlement remains server-authoritative.');
assert.ok(js.includes('approvedChatMemory()'), 'Saved chat context retains its consent boundary.');
for (const script of matches(/<script[^>]+src="\/?([^":]+\.js(?:\?[^" ]+)?)"/g)) assert.ok(fs.existsSync(path.join(root,script.split('?')[0])), `Referenced script exists: ${script}`);
console.log('Four main destinations and four secondary views verified: 20 resolver fixtures, 15 actual canonical-link fixtures, return paths, 10 real privacy-status scenarios and account/session response race guards; Today medicine actions, reviewed visit brief, unique IDs, consent/auth and clinical Alerts boundaries preserved.');
