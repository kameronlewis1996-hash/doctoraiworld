'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const origin = 'https://www.doctoraiworld.com';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox'] });
  let count = 0;
  try {
    for (const route of ['appointment-checklist', 'medication-list-template']) {
      for (const mode of ['initial', 'decline', 'gpc', 'dnt', 'allow']) {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        if (mode === 'gpc') await context.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }));
        if (mode === 'dnt') await context.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
        const page = await context.newPage();
        const analyticsRequests = [];
        // Every request is intercepted. This test sends no data to any external service.
        await page.route('**/*', async request => {
          const url = new URL(request.request().url());
          if (url.pathname.includes('/_vercel/insights/')) {
            analyticsRequests.push(url.href);
            return request.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
          }
          if (url.origin !== origin) return request.abort();
          let file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
          if (!path.extname(file)) file += '.html';
          file = path.resolve(root, file);
          if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return request.fulfill({ status: 404, body: '' });
          const type = ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream';
          return request.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
        });
        await page.goto(`${origin}/${route}`, { waitUntil: 'networkidle' });
        await page.locator(route === 'appointment-checklist' ? '#visit-provider' : '#medicine-name-query').fill('FICTIONAL_PRIVATE_SENTINEL');
        assert.equal(analyticsRequests.length, 0, `${route} ${mode}: before consent`);
        if (mode === 'decline') {
          await page.locator('#measurement-decline').click();
          assert.equal(await page.locator('#measurement-allow').isDisabled(), true);
        }
        if (mode === 'gpc' || mode === 'dnt') assert.equal(await page.locator('#measurement-allow').isDisabled(), true, `${route} ${mode}`);
        if (mode === 'allow') {
          await page.locator('#measurement-allow').click();
          await page.waitForTimeout(150);
          assert.equal(analyticsRequests.length, 1, `${route}: script requested after allowance`);
          const result = await page.evaluate(() => {
            const entry = window.vaq.find(item => item[0] === 'beforeSend');
            if (!entry) return null;
            const event = { type: 'pageview', url: 'https://www.doctoraiworld.com/?FICTIONAL_PRIVATE_SENTINEL', data: 'FICTIONAL_PRIVATE_SENTINEL' };
            return [entry[1](event), entry[1](event)];
          });
          assert.equal(result[0].type, 'pageview');
          assert.equal(result[0].url, `${origin}/${route}`);
          assert.equal(JSON.stringify(result).includes('FICTIONAL_PRIVATE_SENTINEL'), false);
          assert.equal(result[1], null, 'Duplicate pageview is dropped');
        } else assert.equal(analyticsRequests.length, 0);
        count++;
        await context.close();
      }
    }
    console.log(`PASS ${count} isolated consent/refusal/GPC/DNT/allow cases; synthetic payload removed and duplicate pageview dropped; no external network.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
