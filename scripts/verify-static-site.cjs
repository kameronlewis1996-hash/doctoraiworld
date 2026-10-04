'use strict';
// Cross-platform replacement for asset/reference/CSP checks; clinical/provider
// and ownership behavior is exercised separately by the focused package suites.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = JSON.parse(read('vercel.json'));
const manifest = JSON.parse(read('manifest.webmanifest'));
const worker = read('service-worker.js');
const shell = new Set([...worker.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]));
const csp = config.headers.flatMap(item => item.headers).find(item => item.key === 'Content-Security-Policy').value;
assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
assert.match(csp, /script-src-attr 'none'/);
const rewrites = new Map(config.rewrites.filter(item => !item.source.includes(':')).map(item => [item.source, item.destination]));
const staticFile = pathname => {
  const direct = (rewrites.get(pathname) || pathname).replace(/^\//, '');
  if (fs.existsSync(path.join(root, direct)) && fs.statSync(path.join(root, direct)).isFile()) return direct;
  return config.cleanUrls && !path.extname(direct) ? direct + '.html' : direct;
};
const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));
let references = 0;
for (const file of pages) {
  const text = read(file);
  assert.match(text, /<html[^>]*lang=/i, file + ' needs a page language');
  assert.match(text, /<title>[^<]+<\/title>/i, file + ' needs a title');
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)/g)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|data:|#|\/api\/)/.test(reference)) continue;
    const url = new URL(reference, 'https://static.invalid/' + file);
    const target = staticFile(url.pathname);
    assert.ok(fs.existsSync(path.join(root, target)), `${file}: missing ${reference}`);
    const offlinePage = [...shell].some(item => item.startsWith('/') && staticFile(new URL(item, 'https://static.invalid').pathname) === file);
    if (offlinePage && /\.(?:js|css)$/.test(url.pathname)) assert.ok(shell.has(url.pathname + url.search), `${reference} is absent from the offline shell`);
    references++;
  }
  for (const [kind, regex] of [['script', /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi], ['style', /<style[^>]*>([\s\S]*?)<\/style>/gi]]) {
    for (const match of text.matchAll(regex)) {
      const hash = "'sha256-" + crypto.createHash('sha256').update(match[1]).digest('base64') + "'";
      const directive = csp.split(';').find(item => item.trim().startsWith(kind + '-src '));
      assert.ok(directive.includes(hash), `${file}: missing ${kind} CSP hash ${hash}`);
    }
  }
}
for (const reference of shell) {
  if (!reference.startsWith('/')) continue;
  const url = new URL(reference, 'https://static.invalid');
  const file = staticFile(url.pathname);
  assert.ok(fs.existsSync(path.join(root, file)), 'Offline shell contains missing asset: ' + reference);
}
assert.match(worker, /request\.method !== 'GET'.*url\.pathname\.startsWith\('\/api\/'\)/);
assert.ok(manifest.start_url);
for (const file of ['doctorai-public-logo-transparent.png', 'doctorai-head-logo-transparent.png', 'doctorai-app-icon.png']) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(![65536, 131072].includes(bytes.length), 'Truncated PNG: ' + file);
}
for (const file of ['api/chat.js', 'api/medication/_handlers/scan.js']) assert.match(read(file), /store:\s*false/);
const hub = read('health-hub.js');
assert.doesNotMatch(hub, /Tesseract|cdn\.jsdelivr\.net/);
assert.match(hub, /data-scan-review-required/);
assert.match(hub, /data-briefing-consent/);
assert.doesNotMatch(hub, /\/api\/medication\/(?:ingredient-search|nzf-interactions|nzf-product-search|safety-check)|buildDrugBankSafetyPayload|data-medication-barcode/);
assert.match(hub, /data-run-local-medication-safety-check/);
for (const file of ['api/medication/_handlers/ingredient-search.js', 'api/medication/_handlers/nzf-interactions.js', 'api/medication/_handlers/nzf-product-search.js', 'api/medication/_handlers/safety-check.js', 'api/medication/_lib/drugbank.cjs', 'api/medication/_lib/nzf-fhir.cjs']) assert.equal(fs.existsSync(path.join(root, file)), false, 'Retired provider code remains: ' + file);
assert.match(read('api/medication/[...action].js'), /retiredActions\.has\(action\)[\s\S]*?status\(410\)/);
assert.doesNotMatch(read('.env.example'), /(?:DRUGBANK|NZF_FHIR|NZF_INTERACTION)/);
assert.match(read('api/medication/safety.js'), /safety-engine\.cjs/);
assert.match(read('privacy.html'), /does not send medication-check requests to a third-party medication database/);
assert.doesNotMatch(read('health-hub.html'), /NZF\/NZULM|package barcode|data-medication-barcode/);
for (const resource of ['medication-list-template', 'appointment-checklist']) {
  const html = read(resource + '.html');
  assert.doesNotMatch(html, /<textarea\b/i, 'Printable resource must not collect health records');
  if (resource === 'appointment-checklist') assert.doesNotMatch(html, /<form\b/i);
  assert.match(html, /href="\/health-hub"/);
}
// The catalogue-search and readonly public-share inputs are deliberately not
// patient-entry fields. Enforce their fixed roles rather than banning inputs.
const template = read('medication-list-template.html');
for (const match of template.matchAll(/<input\b[^>]*>/gi)) assert.match(match[0], /(?:id="medicine-name-query"|data-share-link)/);
assert.match(read('medication-list-template.js'), /credentials:\s*'omit'/);
console.log(`Static verification passed: ${pages.length} pages, ${references} local references, exact inline CSP hashes, versioned offline assets and privacy/provider invariants.`);
