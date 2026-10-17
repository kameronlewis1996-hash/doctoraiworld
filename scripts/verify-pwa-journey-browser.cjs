'use strict';

// Local signed-out PWA rehearsal. All API requests return unavailable; no
// account, hosted preview, patient data, or browser profile is reused.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const evidence = process.env.PWA_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-pwa-journey');
fs.mkdirSync(evidence, { recursive: true });
const profile = fs.mkdtempSync(path.join(evidence, 'edge-profile-'));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
let workerVersion = 'v168';
let legacyMode = true;
const legacyPwa = `(() => {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js?v=15', { scope: '/', updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {}));
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
})();`;
const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;
  requests.push(pathname);
  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"error":"Local fixture: API unavailable"}');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  else if (!path.extname(pathname)) pathname += '.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
  if (pathname === '/service-worker.js') {
    let body = fs.readFileSync(file, 'utf8').replace('doctorai-shell-v168', legacyMode ? 'doctorai-shell-v167' : `doctorai-shell-${workerVersion}`);
    if (legacyMode) body = body.replace('event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));', 'event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting();').replace('/pwa.js?v=16', '/pwa.js?v=15');
    res.end(body);
  } else if (pathname === '/pwa.js' && legacyMode) {
    res.end(legacyPwa);
  } else fs.createReadStream(file).pipe(res);
});

const report = { source: 'local signed-out fictional fixture', profile, checks: {}, screenshots: [], requests };
const check = (name, value, expected) => {
  report.checks[name] = { value, expected, pass: JSON.stringify(value) === JSON.stringify(expected) };
  assert.deepEqual(value, expected, name);
};

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const legacyProfile = fs.mkdtempSync(path.join(evidence, 'legacy-edge-profile-'));
  const legacyContext = await chromium.launchPersistentContext(legacyProfile, {
    channel: 'msedge', headless: true, viewport: { width: 390, height: 844 },
    args: ['--no-default-browser-check', '--no-first-run'],
  });
  try {
    await legacyContext.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base ? route.continue() : route.abort();
    });
    await legacyContext.addInitScript(() => {
      sessionStorage.setItem('doctorai-pwa-boot-count', String(1 + Number(sessionStorage.getItem('doctorai-pwa-boot-count') || 0)));
      localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
    });
    const legacyPage = legacyContext.pages()[0] || await legacyContext.newPage();
    await legacyPage.goto(`${base}/health-hub#medications`, { waitUntil: 'domcontentloaded' });
    await legacyPage.waitForFunction(() => !!navigator.serviceWorker.controller);
    await legacyPage.locator('#view-medications [data-modal="medication"]').first().click();
    await legacyPage.locator('#quick-modal [name="name"]').fill('Fictional legacy draft');
    const before = await legacyPage.evaluate(() => Number(sessionStorage.getItem('doctorai-pwa-boot-count')));
    legacyMode = false;
    await legacyPage.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    await legacyPage.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    const after = await legacyPage.evaluate(() => Number(sessionStorage.getItem('doctorai-pwa-boot-count')));
    check('Old v15 client does not reload during v168 update', after, before);
    check('Old v15 client keeps unsaved draft while update waits', await legacyPage.locator('#quick-modal [name="name"]').inputValue(), 'Fictional legacy draft');
    report.legacyUpdate = await legacyPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { active: registration.active?.state, waiting: registration.waiting?.state, controller: navigator.serviceWorker.controller?.scriptURL, caches: await caches.keys() };
    });
    check('New worker waits for old client to close', report.legacyUpdate.waiting, 'installed');
  } finally {
    await legacyContext.close();
  }
  const reopened = await chromium.launchPersistentContext(legacyProfile, {
    channel: 'msedge', headless: true, viewport: { width: 390, height: 844 },
    args: ['--no-default-browser-check', '--no-first-run'],
  });
  try {
    await reopened.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base ? route.continue() : route.abort();
    });
    const reopenedPage = reopened.pages()[0] || await reopened.newPage();
    await reopenedPage.goto(`${base}/health-hub#medications`, { waitUntil: 'domcontentloaded' });
    await reopenedPage.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state === 'activated' && !registration.waiting && !(await caches.keys()).includes('doctorai-shell-v167');
    });
    report.legacyReopen = await reopenedPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { active: registration.active?.state, waiting: !!registration.waiting, caches: await caches.keys() };
    });
    check('Reopen activates the update after old client closes', report.legacyReopen.active, 'activated');
    check('Reopen clears old v167 cache', report.legacyReopen.caches.includes('doctorai-shell-v167'), false);
  } finally {
    await reopened.close();
  }
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: true, viewport: { width: 1440, height: 900 },
    args: ['--no-default-browser-check', '--no-first-run'],
  });
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base ? route.continue() : route.abort();
    });
    await context.addInitScript(() => {
      sessionStorage.setItem('doctorai-pwa-boot-count', String(1 + Number(sessionStorage.getItem('doctorai-pwa-boot-count') || 0)));
      localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
    });
    const page = context.pages()[0] || await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/health-hub#medications`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const installability = await cdp.send('Page.getInstallabilityErrors');
    report.installabilityErrors = installability.installabilityErrors;
    check('Manifest/browser installability errors', installability.installabilityErrors, []);
    const manifest = await cdp.send('Page.getAppManifest');
    check('Manifest URL', new URL(manifest.url).pathname, '/manifest.webmanifest');
    const cacheBefore = await page.evaluate(() => caches.keys());
    check('Warm app shell cached', cacheBefore.includes('doctorai-shell-v168'), true);
    report.cacheBefore = cacheBefore;
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width > 800 ? 900 : 844 });
      const file = path.join(evidence, `pwa-online-${width}.png`);
      await page.screenshot({ path: file });
      report.screenshots.push(file);
      check(`${width}px no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await context.setOffline(true);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width > 800 ? 900 : 844 });
      await page.goto(`${base}/health-hub#medications`, { waitUntil: 'domcontentloaded' });
      check(`${width}px offline hub content`, await page.locator('#view-medications').isVisible(), true);
      const file = path.join(evidence, `pwa-offline-${width}.png`);
      await page.screenshot({ path: file });
      report.screenshots.push(file);
    }
    await page.goto(`${base}/about`, { waitUntil: 'domcontentloaded' });
    check('Offline public About page', await page.locator('h1').first().isVisible(), true);
    check('Offline private API is not cached', await page.evaluate(async () => {
      try { await fetch('/api/health/state'); return 'unexpected-response'; }
      catch { return 'network-unavailable'; }
    }), 'network-unavailable');
    await context.setOffline(false);
    await page.goto(`${base}/health-hub#medications`, { waitUntil: 'domcontentloaded' });
    await page.locator('#view-medications [data-modal="medication"]').first().click();
    await page.locator('#quick-modal').waitFor({ state: 'visible' });
    await page.locator('#quick-modal [name="name"]').fill('Fictional medication draft');
    const bootBefore = await page.evaluate(() => Number(sessionStorage.getItem('doctorai-pwa-boot-count')));
    workerVersion = 'v169-test';
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    const bootAfter = await page.evaluate(() => Number(sessionStorage.getItem('doctorai-pwa-boot-count')));
    report.update = { bootBefore, bootAfter, controller: await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL), draftVisible: await page.locator('#quick-modal [name="name"]').inputValue().catch(() => null), caches: await page.evaluate(() => caches.keys()) };
    check('Unsaved medication draft survives worker update', report.update.draftVisible, 'Fictional medication draft');
    check('Update does not force page reload while editing', bootAfter, bootBefore);
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
    check('Synthetic controllerchange preserves draft', await page.locator('#quick-modal [name="name"]').inputValue(), 'Fictional medication draft');
    check('Synthetic controllerchange does not reload', await page.evaluate(() => Number(sessionStorage.getItem('doctorai-pwa-boot-count'))), bootBefore);
    check('Update notice explains how to refresh safely', await page.locator('[data-pwa-update-notice]').textContent().then(value => /save any edits.*refresh/i.test(value)), true);
    check('No page errors', errors, []);
  } finally {
    fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
    server.close();
  }
  console.log(`PWA journey passed. Evidence: ${evidence}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
