'use strict';
// Local browser, fictional account and PDF bytes, intercepted APIs only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  let route = new URL(req.url, 'http://localhost').pathname;
  if (route === '/health-hub') route = '/health-hub.html';
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const pending = deferred(), started = deferred(); let posts = 0;
    await page.route('https://**/*', route => route.abort());
    await page.route('**/api/**', async route => {
      const req = route.request(), pathname = new URL(req.url()).pathname;
      if (pathname === '/api/auth/google') return route.fulfill({ status: 200, json: { authenticated: true, user: { email: 'synthetic@example.invalid', sub: 'synthetic', name: 'Synthetic' } } });
      if (pathname === '/api/stripe/entitlement') return route.fulfill({ status: 200, json: { active: true, expiresAt: Math.floor(Date.now()/1000)+3600 } });
      if (pathname === '/api/health/state') return route.fulfill({ status: 200, json: { state: null, updatedAt: 0 } });
      if (pathname === '/api/documents' && req.method() === 'POST') {
        posts++;
        if (posts === 1) { started.resolve(); await pending.promise; return route.fulfill({ status: 201, json: { document: { id: 'synthetic-id', name: 'synthetic.pdf', size: 4 } } }); }
        return route.fulfill({ status: 503, json: { error: 'Secure document storage is unavailable right now.' } });
      }
      if (pathname === '/api/documents') return route.fulfill({ status: 200, json: { documents: [] } });
      return route.fulfill({ status: 200, json: {} });
    });
    await page.addInitScript(() => localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes'));
    await page.goto(`http://127.0.0.1:${server.address().port}/health-hub#documents`);
    await page.waitForFunction(() => document.body.dataset.subscription === 'pro' && !document.querySelector('#view-documents').hidden);
    const button = page.locator('[data-file-action="document-upload"]');
    const firstPicker = page.waitForEvent('filechooser'); await button.click();
    await (await firstPicker).setFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fake') });
    await started.promise;
    await button.click();
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('already in progress'));
    assert.equal(posts, 1);
    pending.resolve();
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('added to your private library'));
    assert.equal(posts, 1);
    const secondPicker = page.waitForEvent('filechooser'); await button.click();
    await (await secondPicker).setFiles({ name: 'synthetic-retry.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fake') });
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Secure document storage is unavailable'));
    assert.equal(posts, 2);
    console.log('Document upload browser: synthetic Pro picker, duplicate prevention, success and server error passed at 390px.');
    await context.close();
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
