'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'health-hub.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'health-tool-landing.css'), 'utf8');
const start = js.indexOf('    // Presentation only: use the existing verified account state');
assert.ok(start > 0);
const end = js.indexOf("    const liveStatus = $('#auth-status-live');", start);
const actualPresentation = js.slice(start, end);
for (const state of ['checking', 'unavailable', 'signed-in', 'signed-out']) {
  const groups = ['signed-in', 'signed-out'].map(value => ({ dataset: { healthLandingAccount: value }, hidden: false }));
  const status = { hidden: false, textContent: '' };
  vm.runInNewContext(actualPresentation, { state, document: { querySelectorAll: () => groups }, $: () => status });
  for (const group of groups) assert.equal(group.hidden, group.dataset.healthLandingAccount !== state);
  assert.equal(status.hidden, ['signed-in', 'signed-out'].includes(state));
  if (state === 'checking') assert.match(status.textContent, /Checking/);
  if (state === 'unavailable') assert.match(status.textContent, /unavailable/);
}
const health = html.slice(html.indexOf('id="view-health"'), html.indexOf('id="view-visit-prep"'));
const navigation = health.match(/<nav class="hub-panel-nav"[\s\S]*?<\/nav>/)[0];
assert.deepEqual([...navigation.matchAll(/data-hub-panel-target="([^"]+)"/g)].map(m => m[1]), ['details','medications','documents','results','timeline','ask']);
const routeStart=js.indexOf('const viewNames ='), routeEnd=js.indexOf('const storagePrefix =',routeStart);
const resolveRoute=vm.runInNewContext(js.slice(routeStart,routeEnd)+';resolveHubRoute;');
assert.deepEqual(JSON.parse(JSON.stringify(resolveRoute('health','medications'))), {view:'medications',panel:'medications'}, 'The retained medicine shortcut resolves to the standalone primary destination.');
for (const route of ['details','medications','documents','results','timeline','ask']) assert.ok(html.includes(`data-hub-panel="${route}"`));
assert.equal((navigation.match(/data-doctorai-icon=/g)||[]).length,6);
assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /:focus-visible/);
assert.match(css, /min-height: 105px/);
assert.match(html, /data-health-landing-account="signed-out" hidden/);
assert.match(html, /data-health-landing-account="signed-in" hidden/);
const bottom = html.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)[0];
assert.deepEqual([...bottom.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]),['health','medications','visit-prep','profile']);
const landingAsset = html.match(/health-tool-landing\.css\?v=\d+/)?.[0];
assert.ok(landingAsset);
assert.ok(fs.readFileSync(path.join(root,'service-worker.js'),'utf8').includes(landingAsset), 'Worker caches the exact referenced landing version.');
console.log('Health tool landing: actual account presentation checked in four states; six existing routes/icons, four bottom tabs, touch/focus CSS and cache inclusion verified. Source/VM checks only, not browser QA.');

assert.ok(landingAsset);
assert.match(css, /background-size: 100% 100%/);
assert.match(css, /--aurora-glass: #d9edfa80/);
assert.match(css, /@media \(forced-colors: active\)/);
assert.doesNotMatch(css, /background: #ffffffed/);
console.log('Aurora revision: transparent landing, blue glass tokens, full-height atmosphere and versioned assets verified.');

