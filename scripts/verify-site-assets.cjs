'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const routes = new Map((config.rewrites || []).filter(item => !item.source.includes(':')).map(item => [item.source, item.destination]));
const redirects = new Set((config.redirects || []).map(item => item.source));
const csp = config.headers.flatMap(item => item.headers).find(item => item.key === 'Content-Security-Policy').value;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checked = 0;
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  const html = read(name);
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const raw = match[1];
    if (/^(?:https?:|mailto:|data:|#|\/api\/)/.test(raw)) continue;
    const pathname = new URL(raw, 'https://doctoraiworld.test/' + name).pathname;
    if (redirects.has(pathname)) continue;
    const target = routes.get(pathname) || pathname;
    if (target.startsWith('https:')) continue;
    const local = target.slice(1);
    assert.ok(fs.existsSync(path.join(root, local)) || (config.cleanUrls && fs.existsSync(path.join(root, local + '.html'))), `${name} references missing asset/route: ${raw}`);
    checked += 1;
  }
  for (const match of html.matchAll(/<(script|style)([^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (match[1] === 'script' && (/\bsrc=/.test(match[2]) || /type="application\/ld\+json"/.test(match[2]))) continue;
    const hash = crypto.createHash('sha256').update(match[3]).digest('base64');
    assert.ok(csp.includes(`'sha256-${hash}'`), `${name} inline ${match[1]} is not allowed by CSP`);
  }
}
for (const route of ['/data-deletion', '/for-clinicians']) {
  const name = routes.get(route)?.slice(1);
  assert.ok(name && fs.existsSync(path.join(root, name)), `${route} resolves to an included page`);
  assert.match(read(name), /Skip to main content/);
  assert.match(read(name), /<main[^>]*id="main"[^>]*tabindex="-1"/);
}
const hub = read('health-hub.html');
assert.doesNotMatch(hub, /va\.vercel-scripts\.com/, 'The private Health Hub must not load public-page analytics');
assert.ok(hub.indexOf('medication-dose-status.js?v=1') < hub.indexOf('health-hub.js?v=83'));
const worker = read('service-worker.js');
for (const asset of ['/data-deletion', '/for-clinicians', '/public-guide.css?v=1', '/medication-dose-status.js?v=1', '/health-hub.js?v=83', '/subscription.js?v=12', '/doctorai-layout.css?v=3']) assert.ok(worker.includes(`'${asset}'`), `Current PWA shell includes ${asset}`);
assert.match(worker, /doctorai-shell-v137/);
console.log(`Static site verification passed (${checked} local asset/route references, inline CSP hashes, public guidance routes and current PWA assets).`);
