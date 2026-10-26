'use strict';
// Browser checks use synthetic identities and records only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidenceDir = process.env.TODAY_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-today-focus-audit');
fs.mkdirSync(evidenceDir, { recursive: true });
const medicineName = 'Synthetic medicine record alpha';
const conditionName = 'Synthetic saved condition';
const allergyName = 'Synthetic saved allergy';

function startServer() {
  const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); } catch { response.writeHead(400).end('Bad request'); return; }
    const relative = pathname === '/' ? 'health-hub.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'health-hub.html')) { response.writeHead(403).end('Forbidden'); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(bytes);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

function todayIn(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function offsetDate(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function populatedData(date) {
  return {
    medications: [
      { id: 'synthetic-current-a', name: medicineName, dose: 'Synthetic strength', status: 'current' },
      { id: 'synthetic-current-b', name: 'Synthetic medicine record beta', status: 'current' },
      { id: 'synthetic-inactive', name: 'Synthetic inactive record', status: 'stopped' }
    ],
    appointments: [{ id: 'synthetic-appointment', title: 'Synthetic review visit', provider: 'Synthetic clinic', date, time: '10:30' }],
    profile: { name: 'Synthetic Guest Identity', conditions: conditionName, allergies: allergyName, notes: '' },
    timeline: [{ id: 'synthetic-note', source: 'user-question', type: 'question', date, description: 'Synthetic saved question' }],
    tasks: [
      { id: 'stale-focus', source: 'today-focus', date: offsetDate(date, -1), label: 'Yesterday synthetic focus', detail: 'Personal focus', done: false, createdAt: 1 },
      { id: 'saved-reminder', label: 'Synthetic reminder to preserve', detail: 'Existing user reminder', done: false }
    ]
  };
}

async function preparePage(browser, base, width, guestData = {}, legacyData = {}, session = {}) {
  const context = await browser.newContext({ viewport: { width, height: width <= 620 ? 844 : 960 }, timezoneId: 'Pacific/Auckland', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  if (session.clockAt) await page.clock.install({ time: new Date(session.clockAt) });
  page.setDefaultTimeout(10000);
  const errors = [];
  const chatRequests = [];
  let authUser = session.authUser || null;
  let cloudState = session.cloudState || null;
  page.on('pageerror', error => errors.push(error.message));
  const origin = new URL(base).origin;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/auth/google') return route.fulfill({ status: 200, json: authUser ? { authenticated: true, user: authUser, medicationLoginId: '' } : { authenticated: false } });
    if (url.pathname === '/api/health/state') return route.fulfill({ status: 200, json: { state: cloudState, updatedAt: cloudState ? Date.now() + 60000 : 0 } });
    if (url.pathname === '/api/stripe/entitlement') return route.fulfill({ status: 200, json: { active: false, expiresAt: null } });
    if (url.pathname === '/api/chat') chatRequests.push(route.request().postData() || '');
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { active: false, authenticated: false, answer: 'Synthetic response' } });
    return route.continue();
  });
  await page.addInitScript(({ guestData, legacyData, storageChoice }) => {
    if (sessionStorage.getItem('today-focus-fixture-seeded')) return;
    sessionStorage.setItem('today-focus-fixture-seeded', 'yes');
    const prefix = 'doctorai-health-hub-';
    localStorage.setItem(prefix + 'device-storage-consent', storageChoice);
    for (const [key, value] of Object.entries(guestData)) localStorage.setItem(prefix + 'guest-' + key, JSON.stringify(value));
    for (const [key, value] of Object.entries(legacyData)) localStorage.setItem(prefix + key, JSON.stringify(value));
    window.google = { accounts: { id: { initialize() {}, renderButton(host) { host.dataset.syntheticGoogleReady = 'true'; } } } };
  }, { guestData, legacyData, storageChoice: session.storageChoice || 'yes' });
  await page.goto(`${base}/health-hub.html#today`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#view-stack')?.hidden === false && document.querySelector('#session-verification-gate')?.hidden === true);
  return { context, page, errors, width, api: { setAuth(value) { authUser = value; }, setCloudState(value) { cloudState = value; }, chatRequests } };
}


// Today was retired. Keep synthetic saved-record and ownership regression coverage
// on its replacement destinations; do not recreate or silently delete old goals.
(async () => {
  const { server, base } = await startServer();
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const report = { result: 'passed', checks: [], screenshots: [], syntheticOnly: true };
  const openMedicines = async page => {
    await page.locator('.mobile-bottom-nav [data-view="medications"]:visible, .primary-nav [data-view="medications"]:visible').first().click();
    await page.waitForFunction(() => document.querySelector('#view-medications')?.hidden === false);
  };
  const medicineCopy = page => page.locator('#medication-library').innerText();
  try {
    const today = todayIn('Pacific/Auckland');
    const populated = populatedData(today);
    for (const width of [1440, 390, 320]) {
      const test = await preparePage(browser, base, width, populated);
      const { page } = test;
      assert.equal(new URL(page.url()).hash, '#health', 'Legacy Today canonicalizes to My Health');
      assert.equal(await page.locator('#view-today,[data-view="today"],[data-today-focus-open]').count(), 0, 'No Today interface remains');
      assert.equal(await page.locator('#view-health').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}px My Health overflow`);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks')));
      assert.deepEqual(saved, populated.tasks, 'Retiring Today must not rewrite past goals or reminders');
      await openMedicines(page);
      assert.equal(await page.locator('#medication-library [data-edit-medication]').count(), 2);
      assert.match(await medicineCopy(page), /Synthetic medicine record alpha/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}px medicines overflow`);
      const nav = width > 800 ? '.primary-nav' : '.mobile-bottom-nav';
      assert.equal(await page.locator(`${nav} [aria-current="page"]`).count(), 1);
      assert.equal(await page.locator(`${nav} [data-view="medications"]`).getAttribute('aria-current'), 'page');
      for (const item of await page.locator(`${nav} [data-view]`).all()) {
        const box = await item.boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44, `${width}px primary touch target`);
      }
      const screenshot = path.join(evidenceDir, `medications-primary-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.screenshots.push(screenshot);
      assert.deepEqual(test.api.chatRequests, [], 'Navigation sends no chat request');
      assert.deepEqual(test.errors, []);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => !document.querySelector('#view-stack').hidden);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks'))), populated.tasks, 'Goals survive reload');
      report.checks.push(`${width}px: My Health default, retired Today, primary medicines, retained goals, touch targets and no overflow`);
      await test.context.close();
    }
    for (const [name, medicines, expected] of [
      ['zero', [], 0], ['one', [{ id: 'one', name: 'Synthetic only medicine' }], 1], ['multiple', populated.medications, 2]
    ]) {
      const test = await preparePage(browser, base, 390, { medications: medicines });
      await openMedicines(test.page);
      assert.equal(await test.page.locator('#medication-library [data-edit-medication]').count(), expected, name);
      assert.deepEqual(test.errors, []);
      await test.context.close();
      report.checks.push(`${name}: correct current medicine count`);
    }
    const accountA = { sub: 'synthetic-a', email: 'account-a@example.invalid', name: 'Synthetic A' };
    const accountB = { sub: 'synthetic-b', email: 'account-b@example.invalid', name: 'Synthetic B' };
    const stateFor = label => ({ medications: [{ id: `medicine-${label}`, name: `${label} private medicine` }], appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [{ id: `goal-${label}`, source: 'today-focus', date: today, label: `${label} saved goal`, done: false, createdAt: 1 }], profile: {}, memoryEnabled: false, memoryDetails: [] });
    const switching = await preparePage(browser, base, 390, stateFor('Guest'));
    await openMedicines(switching.page);
    const revalidate = () => switching.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    for (const [user, label, forbidden] of [[accountA, 'Account A', 'Guest'], [accountB, 'Account B', 'Account A'], [accountA, 'Account A', 'Account B'], [null, 'Guest', 'Account A']]) {
      switching.api.setAuth(user);
      switching.api.setCloudState(user ? stateFor(label) : null);
      await revalidate();
      await switching.page.waitForFunction(label => !document.querySelector('#view-stack').hidden && document.querySelector('#medication-library')?.innerText.includes(`${label} private medicine`), label);
      assert.doesNotMatch(await medicineCopy(switching.page), new RegExp(`${forbidden} private medicine`));
    }
    assert.deepEqual(switching.api.chatRequests, []);
    assert.deepEqual(switching.errors, []);
    await switching.context.close();
    report.checks.push('guest → account A → account B → account A → guest: medication ownership remains isolated');

    const legacy = await preparePage(browser, base, 390, {}, { medications: [{ id: 'legacy', name: 'Synthetic unowned legacy medicine' }], profile: { name: 'Synthetic unowned identity' } });
    await openMedicines(legacy.page);
    assert.doesNotMatch(await medicineCopy(legacy.page), /Synthetic unowned legacy medicine/);
    assert.equal(await legacy.page.locator('[data-unassigned-legacy-note]:visible').count(), 0);
    assert.equal(await legacy.page.evaluate(() => localStorage.getItem('doctorai-health-hub-medications')), JSON.stringify([{ id: 'legacy', name: 'Synthetic unowned legacy medicine' }]));
    assert.deepEqual(legacy.errors, []);
    await legacy.context.close();
    report.checks.push('Unassigned legacy data remains hidden and unchanged');

    const sessionOnly = await preparePage(browser, base, 390, populated, {}, { storageChoice: 'session' });
    await openMedicines(sessionOnly.page);
    assert.equal(await sessionOnly.page.locator('#medication-library [data-edit-medication]').count(), 0, 'Session choice does not load persisted guest health records');
    assert.deepEqual(sessionOnly.errors, []);
    await sessionOnly.context.close();
    report.checks.push('Session-only mode does not load persisted health records');
    fs.writeFileSync(path.join(evidenceDir, 'today-retirement-qa.json'), JSON.stringify(report, null, 2));
    console.log(`Today retirement and preserved records passed: ${report.checks.length} browser groups. Evidence: ${evidenceDir}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
