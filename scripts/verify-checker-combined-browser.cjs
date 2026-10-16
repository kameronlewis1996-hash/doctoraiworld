'use strict';
// Full local page, actual localStorage, generated medicine/combined engines and DOM.
// All health records are invented. External requests are blocked; auth is a signed-out
// fixture. No real account, service, production record or paid call is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const ruleId = 'ras-inhibitor-diuretic-nsaid-aki';
const medications = [{ id: 'ras', name: 'Losartan' }, { id: 'diuretic', name: 'Furosemide' }, { id: 'nsaid', name: 'Ibuprofen' }];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const csp = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers.find(row => row.source === '/(.*)').headers.find(row => row.key === 'Content-Security-Policy').value;
const server = http.createServer((request, response) => {
  let route = new URL(request.url, 'http://localhost').pathname;
  if (!path.extname(route)) route += '.html';
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'Content-Security-Policy': csp });
  fs.createReadStream(file).pipe(response);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.CHECKER_BROWSER_CHANNEL || 'msedge', headless: true });
  const rows = [];
  try {
    for (const [name, saved, expected] of [
      ['retained-triple', medications, true],
      ['stopped-third', medications.map(item => item.id === 'nsaid' ? { ...item, status: 'stopped' } : item), false],
      ['zero-with-stale-cache', [], false],
      ['unknown-third', [...medications.slice(0, 2), { id: 'unknown', name: 'Invented unmapped gel' }], false]
    ]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/api/auth/google') return route.fulfill({ json: { authenticated: false } });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: {} });
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ saved, ruleId }) => {
        if (sessionStorage.getItem('synthetic-checker-seeded')) return;
        sessionStorage.setItem('synthetic-checker-seeded', 'yes');
        localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
        localStorage.setItem('doctorai-health-hub-medications', JSON.stringify(saved));
        localStorage.setItem('doctorai-health-hub-medication-check', JSON.stringify({ status: 'complete', result: { status: 'red', alerts: [{ ruleId, title: 'STALE SYNTHETIC RESULT' }] } }));
      }, { saved, ruleId });
      await page.goto(base + '/health-hub#alerts', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('#alerts-count')?.textContent);
      const combined = page.locator('#alerts-list .hub-alert-card').filter({ hasText: ruleId });
      assert.equal(await combined.count(), expected ? 1 : 0, name);
      assert.doesNotMatch(await page.locator('#alerts-list').textContent(), /STALE SYNTHETIC RESULT/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile page must not overflow');
      if (expected) {
        assert.equal(await page.locator('body').getAttribute('data-health-alert-level'), 'red');
        await combined.locator('.hub-alert-triggers summary').click();
        assert.equal(await combined.locator('.hub-alert-triggers li').count(), 3);
        await combined.locator('.hub-alert-source summary').click();
        assert.equal(await combined.locator('a[href="https://link.springer.com/article/10.1186/s40780-026-00560-8"]').count(), 1);
        if (process.env.CHECKER_EVIDENCE_DIR) {
          fs.mkdirSync(process.env.CHECKER_EVIDENCE_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.CHECKER_EVIDENCE_DIR, 'combined-triple-mobile.png'), fullPage: true });
        }
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await combined.count(), 1, 'Saved triple survives actual reload');
        await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
        page.on('dialog', dialog => dialog.accept());
        await page.locator('[data-delete-medication="nsaid"]').click();
        await page.goto(base + '/health-hub#alerts', { waitUntil: 'networkidle' });
        assert.equal(await combined.count(), 0, 'Actual UI deletion removes combination');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await combined.count(), 0, 'Deletion survives actual reload');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-medications')).length), 2);
      }
      assert.deepEqual(errors, [], 'No page exceptions');
      rows.push({ name, result: 'passed' });
      await context.close();
    }
    console.log(JSON.stringify({ suite: 'checker-combined-browser', denominator: rows.length, passed: rows.length, cases: rows }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
