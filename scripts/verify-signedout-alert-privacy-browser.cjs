const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const medication = name => ({ id: `synthetic-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const accountStorageKey = (email, key) => {
  const normalized = email.trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(`doctorai:health-hub-local:v1:${normalized}`).digest('hex');
  return `account-${hash}-${key}`;
};

function startServer() {
  const contentTypes = {
    '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon'
  };
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
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

async function installApiRoutes(page, initial = {}) {
  let auth = initial.auth || null;
  let entitlementActive = initial.entitlementActive === true;
  let firstHealthRead = true;
  const delayedHealthRead = deferred();
  const delayedHealthResponse = deferred();
  const account = () => auth ? { authenticated: true, user: auth, medicationLoginId: '' } : { authenticated: false };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/auth/google', async route => {
    if (route.request().method() === 'DELETE') { auth = null; await route.fulfill({ status: 200, json: { authenticated: false } }); return; }
    await route.fulfill({ status: 200, json: account() });
  });
  await page.route('**/api/stripe/entitlement', route => route.fulfill({ status: 200, json: { active: entitlementActive, expiresAt: entitlementActive ? 2000000000 : null } }));
  await page.route('**/api/health/state', async route => {
    if (route.request().method() === 'PUT') { await route.fulfill({ status: 200, json: { updatedAt: Date.now() } }); return; }
    if (initial.delayFirstHealthRead && firstHealthRead) {
      firstHealthRead = false;
      delayedHealthRead.resolve();
      const payload = await delayedHealthResponse.promise;
      await route.fulfill({ status: 200, json: payload });
      return;
    }
    await route.fulfill({ status: 200, json: { state: null, updatedAt: 0 } });
  });
  return {
    setAuth(value) { auth = value; },
    setEntitlement(value) { entitlementActive = value === true; },
    delayedHealthRead: delayedHealthRead.promise,
    releaseDelayedHealthRead() {
      delayedHealthResponse.resolve({ state: initial.delayedHealthState, updatedAt: 4102444800000 });
    }
  };
}

async function openCase(browser, base, { width = 1440, hash = 'alerts', local = {}, auth = null, entitlementActive = false, delayFirstHealthRead = false, delayedHealthState = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 960 : 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(entries => {
    localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
    for (const [suffix, value] of Object.entries(entries)) localStorage.setItem(`doctorai-health-hub-${suffix}`, JSON.stringify(value));
  }, local);
  const api = await installApiRoutes(page, { auth, entitlementActive, delayFirstHealthRead, delayedHealthState });
  await page.goto(`${base}/health-hub.html#${encodeURIComponent(hash)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const value = document.querySelector('#alerts-count')?.textContent.trim();
    return value && value !== 'Checking sign-in';
  }, null, { timeout: 15000 });
  return { context, page, api, pageErrors };
}

function assertNoOverflow(page, width) {
  return page.evaluate(expectedWidth => {
    const note = document.querySelector('#view-alerts [data-unassigned-legacy-note]');
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      noteHidden: note ? note.hidden : true,
      noteFontSize: note ? Number.parseFloat(getComputedStyle(note).fontSize) : 0,
      noteWidth: note ? note.getBoundingClientRect().width : 0,
      expectedWidth
    };
  }, width).then(metrics => {
    assert.ok(metrics.scrollWidth <= metrics.innerWidth, `${width}px viewport overflowed: ${metrics.scrollWidth}px`);
    return metrics;
  });
}

async function returnToTab(page, updateSession) {
  await page.evaluate(() => {
    window.__visibilityChanges = 0;
    window.__syntheticDocumentHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__syntheticDocumentHidden });
    document.addEventListener('visibilitychange', () => { window.__visibilityChanges += 1; });
    window.__syntheticDocumentHidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.hidden === true, null, { timeout: 5000 });
  updateSession();
  await page.evaluate(() => {
    window.__syntheticDocumentHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.hidden === false && window.__visibilityChanges >= 2, null, { timeout: 5000 });
}

async function run() {
  const { server, base } = await startServer();
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const reports = [];
  const legacyMeds = Array.from({ length: 9 }, (_, index) => medication(`Legacy unassigned synthetic medicine ${index + 1}`));
  const allLegacy = {
    medications: legacyMeds,
    appointments: [{ id: 'legacy-appointment', title: 'LEGACY_APPOINTMENT_SENTINEL' }],
    providers: [{ id: 'legacy-provider', name: 'LEGACY_PROVIDER_SENTINEL' }],
    timeline: [{ id: 'legacy-timeline', title: 'LEGACY_TIMELINE_SENTINEL' }],
    documents: [{ id: 'legacy-document', name: 'LEGACY_DOCUMENT_SENTINEL' }],
    measurements: [{ id: 'legacy-measurement', type: 'weight', value: 'LEGACY_MEASUREMENT_SENTINEL' }],
    tasks: [{ id: 'legacy-task', label: 'LEGACY_TASK_SENTINEL' }],
    profile: { name: 'LEGACY_PROFILE_SENTINEL', allergies: 'LEGACY_ALLERGY_SENTINEL', conditions: '' },
    'memory-enabled': true,
    'memory-details': ['LEGACY_MEMORY_SENTINEL'],
    'updated-at': 1710000000000,
    'medication-check': { version: 1, result: { status: 'red', alerts: [{ type: 'interaction', title: 'LEGACY_CHECK_SENTINEL' }] } }
  };

  async function closeCase(testCase) {
    assert.deepEqual(testCase.pageErrors, [], 'browser emitted JavaScript errors');
    await testCase.context.close();
  }

  try {
    for (const width of [1440, 390]) {
      const testCase = await openCase(browser, base, { width });
      const { page } = testCase;
      assert.equal(await page.locator('#alerts-count').textContent(), 'No current notices');
      assert.equal(await page.locator('#alerts-list .hub-alert-card').count(), 0);
      assert.equal(await page.locator('[data-unassigned-legacy-note]:visible').count(), 0);
      const metrics = await assertNoOverflow(page, width);
      reports.push({ case: 'pristine-signed-out', width, result: 'passed', metrics });
      await closeCase(testCase);
    }

    {
      const emptyLegacy = {
        medications: [], appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [],
        profile: { name: '', bloodType: '', allergies: '', conditions: '', notes: '' },
        'memory-enabled': false, 'memory-details': [], 'updated-at': 0, 'medication-check': null
      };
      const testCase = await openCase(browser, base, { local: emptyLegacy });
      assert.equal(await testCase.page.locator('#alerts-count').textContent(), 'No current notices');
      assert.equal(await testCase.page.locator('#view-alerts [data-unassigned-legacy-note]:visible').count(), 0);
      reports.push({ case: 'empty-legacy-placeholders-do-not-create-notice', width: 1440, result: 'passed' });
      await closeCase(testCase);
    }

    for (const width of [1440, 390]) {
      const testCase = await openCase(browser, base, { width, local: allLegacy });
      const { page } = testCase;
      assert.equal(await page.locator('#medications-count').textContent(), '0 current');
      assert.equal(await page.locator('#alerts-count').textContent(), 'No current notices');
      assert.equal(await page.locator('#alerts-list .hub-alert-card').count(), 0);
      assert.equal(await page.locator('#alerts-list').getByText(/36 of 36/i).count(), 0);
      const visibleNote = page.locator('#view-alerts [data-unassigned-legacy-note]');
      await visibleNote.waitFor({ state: 'visible' });
      const noticeText = await visibleNote.textContent();
      assert.match(noticeText, /not linked to a confirmed guest or account/i);
      assert.doesNotMatch(noticeText, /LEGACY_[A-Z_]+_SENTINEL/);
      const beforeRefresh = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(`doctorai-health-hub-${key}`)])), Object.keys(allLegacy));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#alerts-count')?.textContent.trim() === 'No current notices');
      assert.equal(await page.locator('#medications-count').textContent(), '0 current');
      assert.equal(await page.locator('#view-alerts [data-unassigned-legacy-note]:visible').count(), 1);
      const afterRefresh = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(`doctorai-health-hub-${key}`)])), Object.keys(allLegacy));
      assert.deepEqual(afterRefresh, beforeRefresh, 'legacy records changed during signed-out refresh');
      const metrics = await assertNoOverflow(page, width);
      if (width === 390) {
        assert.equal(metrics.noteHidden, false);
        assert.ok(metrics.noteFontSize >= 14, `legacy notice font was too small: ${metrics.noteFontSize}px`);
        assert.ok(metrics.noteWidth >= 280, `legacy notice was too narrow: ${metrics.noteWidth}px`);
      }
      reports.push({ case: 'unowned-legacy-hidden-and-preserved', width, result: 'passed', legacyKeysPreserved: Object.keys(allLegacy).length, metrics });
      await closeCase(testCase);
    }

    for (const width of [1440, 390]) {
      const guestMeds = Array.from({ length: 9 }, (_, index) => medication(`Guest synthetic medicine ${index + 1}`));
      const testCase = await openCase(browser, base, { width, local: { ...allLegacy, 'guest-medications': guestMeds } });
      const { page } = testCase;
      await page.waitForFunction(() => document.querySelector('#alerts-count')?.textContent.trim() === '10 notices to review');
      const alerts = await page.locator('#alerts-list').innerText();
      assert.match(alerts, /36 of 36/i, '36 unchecked pairs were not described');
      assert.doesNotMatch(alerts, /Potential medicine interaction/i, 'unchecked pairs were labelled as a confirmed interaction');
      assert.doesNotMatch(alerts, /LEGACY_[A-Z_]+_SENTINEL|Legacy unassigned synthetic medicine/i);
      assert.equal(await page.locator('#medications-count').textContent(), '9 current');
      assert.equal(await page.evaluate(() => localStorage.getItem('doctorai-health-hub-medications')), JSON.stringify(legacyMeds));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications') || '[]').length), 9);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#alerts-count')?.textContent.trim() === '10 notices to review');
      const refreshedAlerts = await page.locator('#alerts-list').innerText();
      assert.match(refreshedAlerts, /36 of 36/i, 'guest medicine pair coverage survives refresh accurately');
      assert.doesNotMatch(refreshedAlerts, /Potential medicine interaction/i);
      assert.equal(await page.locator('#medications-count').textContent(), '9 current');
      const metrics = await assertNoOverflow(page, width);
      reports.push({ case: 'intentional-guest-data-unchecked-pairs', width, result: 'passed', alerts: 10, uncheckedPairs: 36, interactionAlerts: 0, metrics });
      await closeCase(testCase);
    }

    {
      const stale = { version: 1, consent: true, result: { status: 'red', alerts: [{ type: 'interaction', title: 'STALE_SYNTHETIC_WARNING' }] }, checkedAt: Date.now() };
      const testCase = await openCase(browser, base, { local: { 'guest-medications': [], 'guest-medication-check': stale } });
      const { page } = testCase;
      assert.equal(await page.locator('#medications-count').textContent(), '0 current');
      assert.equal(await page.locator('#alerts-count').textContent(), 'No current notices');
      assert.doesNotMatch(await page.locator('body').innerText(), /STALE_SYNTHETIC_WARNING/);
      assert.doesNotMatch(await page.locator('#alerts-list').innerText(), /interaction/i);
      reports.push({ case: 'zero-guest-medicines-stale-check-ignored', width: 1440, result: 'passed' });
      await closeCase(testCase);
    }

    {
      const userA = { email: 'accounta@example.invalid', sub: 'synthetic-account-a', name: 'Synthetic Account A' };
      const userB = { email: 'accountb@example.invalid', sub: 'synthetic-account-b', name: 'Synthetic Account B' };
      const local = {
        [accountStorageKey(userA.email, 'medications')]: [medication('ACCOUNT_A_SYNTHETIC_ONLY')],
        [accountStorageKey(userB.email, 'medications')]: [medication('ACCOUNT_B_SYNTHETIC_ONLY')]
      };
      const testCase = await openCase(browser, base, { local, auth: userA });
      const { page, context, api } = testCase;
      assert.match(await page.locator('#medication-library').innerText(), /ACCOUNT_A_SYNTHETIC_ONLY/);
      await returnToTab(page, () => api.setAuth(userB));
      await page.waitForFunction(() => document.querySelector('#medication-library')?.textContent.includes('ACCOUNT_B_SYNTHETIC_ONLY'));
      const accountView = await page.locator('#medication-library').innerText();
      assert.match(accountView, /ACCOUNT_B_SYNTHETIC_ONLY/);
      assert.doesNotMatch(accountView, /ACCOUNT_A_SYNTHETIC_ONLY/);
      assert.equal(await page.locator('#medications-count').textContent(), '1 current');
      reports.push({ case: 'account-a-to-b-tab-return-isolation', width: 1440, result: 'passed', visibilityTransition: 'scripted hidden/visible visibilitychange in Chromium' });
      await closeCase(testCase);
    }

    {
      const userA = { email: 'logout@example.invalid', sub: 'synthetic-logout', name: 'Synthetic Logout Account' };
      const accountMeds = [medication('ACCOUNT_A_LOGOUT_SYNTHETIC_ONLY')];
      const testCase = await openCase(browser, base, {
        auth: userA,
        local: { [accountStorageKey(userA.email, 'medications')]: accountMeds, 'guest-medications': [medication('GUEST_AFTER_LOGOUT_SYNTHETIC')] },
        delayFirstHealthRead: true,
        delayedHealthState: { medications: [medication('STALE_ACCOUNT_A_CLOUD_RESPONSE')], profile: {}, appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [], memoryDetails: [], memoryEnabled: false }
      });
      const { page, api } = testCase;
      await api.delayedHealthRead;
      await page.locator('.primary-nav [data-view="profile"]').click();
      await page.locator('#view-profile [data-open-profile]').click();
      await page.locator('[data-google-signout]').click();
      await page.waitForFunction(() => document.querySelector('.drawer-profile b')?.textContent === 'Not signed in' && document.querySelector('#medications-count')?.textContent === '1 current');
      assert.match(await page.locator('#medication-library').innerText(), /GUEST_AFTER_LOGOUT_SYNTHETIC/);
      assert.doesNotMatch(await page.locator('#medication-library').innerText(), /ACCOUNT_A_LOGOUT_SYNTHETIC_ONLY/);
      api.releaseDelayedHealthRead();
      await page.waitForTimeout(150);
      assert.doesNotMatch(await page.locator('body').innerText(), /STALE_ACCOUNT_A_CLOUD_RESPONSE|ACCOUNT_A_LOGOUT_SYNTHETIC_ONLY/);
      assert.match(await page.locator('#medication-library').innerText(), /GUEST_AFTER_LOGOUT_SYNTHETIC/);
      reports.push({ case: 'logout-ignores-delayed-account-response', width: 1440, result: 'passed' });
      await closeCase(testCase);
    }

    {
      const userA = { email: 'expired@example.invalid', sub: 'synthetic-expired-session', name: 'Synthetic Expired Account' };
      const testCase = await openCase(browser, base, { auth: userA, entitlementActive: true, local: { [accountStorageKey(userA.email, 'medications')]: [medication('EXPIRED_ACCOUNT_SYNTHETIC_ONLY')] } });
      const { page, context, api } = testCase;
      await page.waitForFunction(() => document.body.dataset.subscription === 'pro');
      assert.match(await page.locator('#medication-library').innerText(), /EXPIRED_ACCOUNT_SYNTHETIC_ONLY/);
      await returnToTab(page, () => api.setAuth(null));
      await page.waitForFunction(() => document.querySelector('#medications-count')?.textContent === '0 current' && document.body.dataset.subscription === 'free');
      assert.equal(await page.locator('#alerts-count').textContent(), 'No current notices');
      assert.equal(await page.locator('#drawer-pro-status').textContent(), 'Free plan');
      assert.doesNotMatch(await page.locator('body').innerText(), /EXPIRED_ACCOUNT_SYNTHETIC_ONLY/);
      assert.equal(await page.locator('#view-alerts [data-unassigned-legacy-note]:visible').count(), 0);
      reports.push({ case: 'expired-session-clears-account-derived-notices-on-tab-return', width: 1440, result: 'passed', visibilityTransition: 'scripted hidden/visible visibilitychange in Chromium' });
      await closeCase(testCase);
    }

    {
      const userA = { email: 'pro-expiry@example.invalid', sub: 'synthetic-pro-expiry', name: 'Synthetic Pro Account' };
      const testCase = await openCase(browser, base, { auth: userA, entitlementActive: true, local: { [accountStorageKey(userA.email, 'medications')]: [medication('ACCOUNT_REMAINS_SYNTHETIC')] } });
      const { page, context, api } = testCase;
      await page.waitForFunction(() => document.body.dataset.subscription === 'pro');
      await returnToTab(page, () => api.setEntitlement(false));
      await page.waitForFunction(() => document.body.dataset.subscription === 'free');
      assert.match(await page.locator('#medication-library').innerText(), /ACCOUNT_REMAINS_SYNTHETIC/);
      assert.equal(await page.locator('#drawer-pro-status').textContent(), 'Free plan');
      reports.push({ case: 'expired-entitlement-refreshes-on-tab-return', width: 1440, result: 'passed' });
      await closeCase(testCase);
    }

    {
      const testCase = await openCase(browser, base, { hash: 'medications' });
      const { page } = testCase;
      await page.locator('#view-medications button.primary-button[data-modal="medication"]').click();
      const form = page.locator('#quick-modal form[data-modal-form="medication"]');
      const name = form.locator('#manual-medication-name');
      await name.fill('Paracetamol');
      await page.waitForFunction(() => document.querySelectorAll('#medication-name-results [role="option"]').length > 0, null, { timeout: 12000 });
      const suggestions = await page.locator('#medication-name-results [role="option"]').count();
      assert.ok(suggestions > 0, 'medicine catalogue search returned no suggestions');
      await name.fill('Synthetic guest medicine add test');
      await form.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('#medications-count')?.textContent === '1 current');
      assert.match(await page.locator('#medication-library').innerText(), /Synthetic guest medicine add test/);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications') || '[]')[0]?.name), 'Synthetic guest medicine add test');
      reports.push({ case: 'ordinary-medication-search-and-add', width: 1440, result: 'passed', catalogueSuggestions: suggestions });
      await closeCase(testCase);
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(JSON.stringify({ result: 'passed', browser: 'Chromium', cases: reports.length, reports }, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
