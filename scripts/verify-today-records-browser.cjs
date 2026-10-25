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
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { active: false, authenticated: false } });
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
  await page.waitForFunction(() => document.querySelector('#today-record-status')?.hidden === true);
  return { context, page, errors, width, api: { setAuth(value) { authUser = value; }, setCloudState(value) { cloudState = value; } } };
}

async function checkLayout(testCase, label) {
  const { page, width } = testCase;
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: horizontal overflow`);
  for (const selector of ['[data-today-focus-open]', '[data-open-today-plan]', '[data-modal="symptom"]', '[data-view="health"]', '.today-question-disclosure summary']) {
    const target = page.locator(`#view-today ${selector}`).first();
    const box = await target.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `${label}: target ${selector} is smaller than 44px`);
  }
  assert.equal(await page.locator('#view-today h1').count(), 1, `${label}: one Today heading`);
  assert.equal(await page.locator('#today-focus-input').getAttribute('aria-describedby'), 'today-focus-help');
  assert.equal(await page.locator('label[for="today-focus-input"]').count(), 1, `${label}: focus field has a label`);
  const status = page.locator('[data-auth-status-control]:visible').first();
  assert.ok(await status.isVisible(), `${label}: visible sign-in status`);
  assert.ok(width >= 320);
}

(async () => {
  const { server, base } = await startServer();
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const report = { result: 'passed', checks: [], screenshots: [], syntheticOnly: true };
  try {
    const localToday = todayIn('Pacific/Auckland');
    const populated = populatedData(localToday);
    for (const width of [1440, 390, 320]) {
      const testCase = await preparePage(browser, base, width, populated);
      const { page } = testCase;
      const today = page.locator('#view-today');
      const visibleCopy = await today.innerText();
      assert.match(visibleCopy, /One personal focus/);
      assert.match(visibleCopy, /No focus saved for today/);
      assert.match(visibleCopy, /Synthetic review visit[\s\S]*Today[\s\S]*10:30 AM/);
      for (const privateDetail of [medicineName, conditionName, allergyName, 'Yesterday synthetic focus', 'Synthetic Guest Identity', 'No current medicines']) {
        assert.equal(visibleCopy.includes(privateDetail), false, `${width}px Today leaked repeated record or stale identity: ${privateDetail}`);
      }
      assert.equal(await page.locator('#view-today [data-today-section-select], #view-today [data-today-section-target]').count(), 0, `${width}px old record filter remains`);
      await checkLayout(testCase, `populated-${width}`);
      const screenshot = path.join(evidenceDir, `today-populated-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.screenshots.push(screenshot);
      report.checks.push(`${width}px Chromium: concise Today, no medicine/condition/allergy identity leakage, same-day appointment, touch targets, no overflow`);
      assert.deepEqual(testCase.errors, [], `${width}px browser errors`);
      await testCase.context.close();
    }

    for (const [label, data, count] of [
      ['zero', { medications: [], profile: {} }, 0],
      ['one', { medications: [{ id: 'only', name: 'Synthetic medicine one', dose: 'Synthetic strength' }], profile: {} }, 1],
      ['multiple', { medications: populated.medications, profile: populated.profile }, 2]
    ]) {
      const testCase = await preparePage(browser, base, 390, data);
      await testCase.page.locator('#view-today [data-view="medications"]').click();
      await testCase.page.waitForFunction(() => document.body.dataset.hubPanel === 'medications');
      assert.equal(await testCase.page.locator('#medication-library [data-edit-medication]').count(), count, `${label} current medicine count in My Health`);
      assert.equal(await testCase.page.locator('#view-today').isVisible(), false);
      assert.deepEqual(testCase.errors, [], `${label} browser errors`);
      report.checks.push(`${label} current medicines appear in My Health only (${count} rendered)`);
      await testCase.context.close();
    }

    const emptyToday = await preparePage(browser, base, 390);
    assert.match(await emptyToday.page.locator('#today-focus-copy').innerText(), /No focus saved for today/);
    assert.match(await emptyToday.page.locator('#today-next-up-copy').innerText(), /No upcoming appointment saved/);
    assert.doesNotMatch(await emptyToday.page.locator('#view-today').innerText(), /No medicines|No conditions|No allergies/);
    report.checks.push('empty signed-out profile has honest optional focus and appointment states without fabricated personal details');
    await emptyToday.context.close();

    const myHealth = await preparePage(browser, base, 390, { profile: {} });
    await myHealth.page.locator('#view-today [data-view="health"]').click();
    await myHealth.page.waitForFunction(() => document.body.dataset.hubPanel === 'details');
    for (const name of ['Edit conditions and health history', 'Edit allergies and reactions', 'Edit emergency information']) {
      assert.equal(await myHealth.page.getByRole('button', { name, exact: true }).count(), 1, `My Health edit control has a meaningful accessible name: ${name}`);
    }
    report.checks.push('My Health condition, allergy and emergency edit controls expose meaningful screen-reader names');
    assert.deepEqual(myHealth.errors, [], 'My Health accessibility browser errors');
    await myHealth.context.close();

    const workflow = await preparePage(browser, base, 390, populated);
    const page = workflow.page;
    await page.locator('[data-today-focus-open]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#today-focus-input').evaluate(element => element === document.activeElement), true, 'focus form receives keyboard focus');
    await page.locator('#today-focus-input').fill('Ask about a synthetic question');
    await page.locator('[data-today-focus-form] button[type="submit"]').click();
    assert.match(await page.locator('#today-focus-copy').innerText(), /Ask about a synthetic question/);
    assert.match(await page.locator('#today-focus-save-status').innerText(), /saved in this browser/i, 'save confirmation identifies persistent browser storage');
    assert.equal(await page.locator('#today-focus-copy img').count(), 0, 'user focus text is rendered as text');
    const firstTasks = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks') || '[]'));
    const savedFocus = firstTasks.find(task => task.source === 'today-focus' && task.date === localToday && !task.done);
    assert.ok(savedFocus, 'new focus is saved for the user local calendar day');
    assert.equal(firstTasks.filter(task => task.source === 'today-focus' && task.date === localToday && !task.done).length, 1);
    assert.equal(firstTasks.find(task => task.id === 'saved-reminder')?.label, 'Synthetic reminder to preserve', 'an existing user reminder is preserved');
    await page.locator('.today-question-disclosure summary').click();
    await page.locator('[data-diary-question-form="today"] textarea[name="question"]').fill('Ask about a synthetic appointment question');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-diary-question-form="today"] button[type="submit"]').click();
    assert.match(await page.locator('#view-today [data-diary-question-status]').innerText(), /Added to your diary/);
    const diaryEntries = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-timeline') || '[]'));
    assert.ok(diaryEntries.some(entry => entry.source === 'user-question' && entry.description === 'Ask about a synthetic appointment question'), 'the optional Today form adds a user authored question to the diary');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#today-record-status')?.hidden === true);
    assert.match(await page.locator('#today-focus-copy').innerText(), /Ask about a synthetic question/, 'focus persists in intentional guest storage');
    await page.locator('[data-today-focus-open]').click();
    assert.equal(await page.locator('#today-focus-input').inputValue(), 'Ask about a synthetic question');
    await page.locator('#today-focus-input').fill('Edited synthetic focus');
    await page.locator('[data-today-focus-form] button[type="submit"]').click();
    assert.match(await page.locator('#today-focus-copy').innerText(), /Edited synthetic focus/);
    assert.match(await page.locator('#today-focus-save-status').innerText(), /saved in this browser/i);
    await page.locator('#today-focus-copy [data-task-toggle]').click();
    assert.match(await page.locator('#today-focus-copy').innerText(), /Edited synthetic focus[\s\S]*Marked complete today/, 'completed focus remains accurately identified');
    const completeTasks = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks') || '[]'));
    assert.equal(completeTasks.find(task => task.source === 'today-focus' && task.label === 'Edited synthetic focus')?.done, true, 'completion only follows explicit user action');
    await page.locator('[data-today-focus-open]').click();
    await page.locator('#today-focus-input').fill('Stale synthetic focus');
    await page.locator('[data-today-focus-form] button[type="submit"]').click();
    await page.evaluate(yesterday => {
      const key = 'doctorai-health-hub-guest-tasks';
      const tasks = JSON.parse(localStorage.getItem(key) || '[]');
      const task = tasks.find(item => item.source === 'today-focus' && item.label === 'Stale synthetic focus');
      task.date = yesterday;
      localStorage.setItem(key, JSON.stringify(tasks));
    }, offsetDate(localToday, -1));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#today-record-status')?.hidden === true);
    const staleFocusCopy = await page.locator('#today-focus-copy').innerText();
    assert.match(staleFocusCopy, /No focus saved for today/);
    assert.equal(staleFocusCopy.includes('Stale synthetic focus'), false, 'a prior day focus is not presented as today');

    const symptomOpener = page.locator('#view-today .today-quick-actions [data-modal="symptom"]');
    await symptomOpener.click();
    const symptomDialog = page.locator('#quick-modal [data-modal-form="symptom"]');
    await symptomDialog.waitFor({ state: 'visible' });
    const chip = symptomDialog.locator('.symptom-quick-chip').first();
    const chipBox = await chip.boundingBox();
    const cancel = symptomDialog.locator('.modal-actions button').first();
    const submit = symptomDialog.locator('.modal-actions button[type="submit"]');
    assert.ok(chipBox && chipBox.height >= 44 && chipBox.width >= 44);
    assert.ok(parseFloat(await chip.evaluate(element => getComputedStyle(element).fontSize)) >= 14);
    for (const button of [cancel, submit]) {
      const box = await button.boundingBox();
      assert.ok(box && box.height >= 44 && box.width >= 44, 'symptom modal action target size');
      assert.ok(parseFloat(await button.evaluate(element => getComputedStyle(element).fontSize)) >= 14, 'symptom modal action text is readable');
    }
    await page.keyboard.press('Escape');
    assert.equal(await symptomOpener.evaluate(element => element === document.activeElement), true, 'dialog restores focus to its opener');
    await page.locator('#view-today [data-view="medications"]').click();
    await page.waitForFunction(() => document.body.dataset.hubPanel === 'medications');
    await page.locator('#view-medications [data-modal="medication"]').first().click();
    const medSearch = page.locator('#quick-modal #manual-medication-name');
    await medSearch.fill('paracetamol');
    await page.waitForFunction(() => document.querySelector('#medication-search-status')?.textContent.trim().length > 0);
    assert.equal(await medSearch.getAttribute('role'), 'combobox');
    const searchStatus = await page.locator('#medication-search-status').innerText();
    assert.doesNotMatch(searchStatus, /error|unavailable/i, `local medicine search status: ${searchStatus}`);
    await medSearch.fill('Synthetic newly added medicine');
    await page.locator('#quick-modal input[name="dose"]').fill('Synthetic strength');
    await page.locator('#quick-modal [data-modal-form="medication"] button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    assert.match(await page.locator('#medication-library').innerText(), /Synthetic newly added medicine/);
    assert.deepEqual(workflow.errors, [], `browser errors: ${workflow.errors.join('; ')}`);
    report.checks.push('Pacific/Auckland guest focus: create, persist, edit, explicitly complete; stale prior-day focus hidden; optional diary question saves; focused modal keyboard path; local medicine search and manual add continue in My Health');
    report.checks.push('Symptom modal: readable 14px chips and actions, 44px touch targets, Escape restores focus');
    await workflow.context.close();

    const accountA = { sub: 'synthetic-account-a', email: 'account-a@example.invalid', name: 'Synthetic Account A' };
    const accountB = { sub: 'synthetic-account-b', email: 'account-b@example.invalid', name: 'Synthetic Account B' };
    const accountState = label => ({
      medications: [], appointments: [], providers: [], timeline: [], documents: [], measurements: [],
      tasks: [{ id: `focus-${label}`, source: 'today-focus', date: localToday, label: `${label} private focus`, detail: 'Personal focus', done: false, createdAt: 10 }],
      profile: {}, memoryEnabled: false, memoryDetails: []
    });
    const accountSwitch = await preparePage(browser, base, 390, {
      tasks: [{ id: 'guest-focus', source: 'today-focus', date: localToday, label: 'Guest-only synthetic focus', detail: 'Personal focus', done: false, createdAt: 1 }]
    });
    assert.match(await accountSwitch.page.locator('#today-focus-copy').innerText(), /Guest-only synthetic focus/);
    const revalidateTab = async () => accountSwitch.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    accountSwitch.api.setAuth(accountA);
    accountSwitch.api.setCloudState(accountState('Account A'));
    await revalidateTab();
    await accountSwitch.page.waitForFunction(() => document.querySelector('#today-focus-copy')?.innerText.includes('Account A private focus'));
    assert.doesNotMatch(await accountSwitch.page.locator('body').innerText(), /Guest-only synthetic focus/);
    accountSwitch.api.setAuth(accountB);
    accountSwitch.api.setCloudState({ medications: [], appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [], profile: {}, memoryEnabled: false, memoryDetails: [] });
    await revalidateTab();
    await accountSwitch.page.waitForFunction(() => document.querySelector('#today-record-status')?.hidden === true && document.querySelector('#today-focus-copy')?.innerText.includes('No focus saved for today'));
    assert.doesNotMatch(await accountSwitch.page.locator('body').innerText(), /Account A private focus|Guest-only synthetic focus/);
    accountSwitch.api.setAuth(accountA);
    accountSwitch.api.setCloudState(accountState('Account A'));
    await revalidateTab();
    await accountSwitch.page.waitForFunction(() => document.querySelector('#today-focus-copy')?.innerText.includes('Account A private focus'));
    accountSwitch.api.setAuth(null);
    accountSwitch.api.setCloudState(null);
    await revalidateTab();
    await accountSwitch.page.waitForFunction(() => document.querySelector('#today-focus-copy')?.innerText.includes('Guest-only synthetic focus'));
    assert.doesNotMatch(await accountSwitch.page.locator('body').innerText(), /Account A private focus/);
    assert.deepEqual(accountSwitch.errors, [], 'account switch browser errors');
    report.checks.push('guest → account A → account B → account A → guest switch preserves scope; no prior identity focus appears in the other owner');
    await accountSwitch.context.close();

    const sessionOnly = await preparePage(browser, base, 390, {}, {}, { storageChoice: 'session' });
    await sessionOnly.page.locator('[data-today-focus-open]').click();
    await sessionOnly.page.locator('#today-focus-input').fill('Session-only synthetic focus');
    await sessionOnly.page.locator('[data-today-focus-form] button[type="submit"]').click();
    assert.match(await sessionOnly.page.locator('#today-focus-save-status').innerText(), /available for this session only/i, 'session-only storage is described honestly');
    assert.deepEqual(sessionOnly.errors, [], 'session-only storage browser errors');
    report.checks.push('guest focus save text distinguishes persistent browser storage from session-only storage');
    await sessionOnly.context.close();

    const accountSaved = await preparePage(browser, base, 390, {}, {}, { authUser: { sub: 'synthetic-focus-account', email: 'focus-account@example.invalid', name: 'Synthetic Focus Account' } });
    await accountSaved.page.locator('[data-today-focus-open]').click();
    await accountSaved.page.locator('#today-focus-input').fill('Account-synced synthetic focus');
    await accountSaved.page.locator('[data-today-focus-form] button[type="submit"]').click();
    assert.match(await accountSaved.page.locator('#today-focus-save-status').innerText(), /account sync is pending/i, 'account save begins with a pending status');
    await accountSaved.page.waitForFunction(() => document.querySelector('#today-focus-save-status')?.textContent.includes('saved to your private account'), { timeout: 10000 });
    report.checks.push('account focus save changes from pending to confirmed only after the mocked private save succeeds');
    assert.deepEqual(accountSaved.errors, [], 'account focus save browser errors');
    await accountSaved.context.close();

    const beforeLocalMidnight = await preparePage(browser, base, 390, {}, {}, { clockAt: '2026-10-25T10:30:00.000Z' });
    await beforeLocalMidnight.page.locator('[data-today-focus-open]').click();
    await beforeLocalMidnight.page.locator('#today-focus-input').fill('Before-midnight synthetic focus');
    await beforeLocalMidnight.page.locator('[data-today-focus-form] button[type="submit"]').click();
    assert.match(await beforeLocalMidnight.page.locator('#today-focus-copy').innerText(), /Before-midnight synthetic focus/);
    assert.equal((await beforeLocalMidnight.page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks') || '[]'))).find(task => task.source === 'today-focus')?.date, '2026-10-25');
    await beforeLocalMidnight.page.clock.fastForward(2 * 60 * 60 * 1000);
    await beforeLocalMidnight.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await beforeLocalMidnight.page.waitForFunction(() => document.querySelector('#today-focus-copy')?.innerText.includes('No focus saved for today'));
    assert.doesNotMatch(await beforeLocalMidnight.page.locator('#today-focus-copy').innerText(), /Before-midnight synthetic focus/);
    report.checks.push('Pacific/Auckland tab return after local midnight hides the prior-day focus');
    assert.deepEqual(beforeLocalMidnight.errors, [], 'local-midnight browser errors');
    await beforeLocalMidnight.context.close();

    const legacy = await preparePage(browser, base, 390, {}, { medications: [{ id: 'unowned', name: 'Synthetic unowned legacy medicine' }], profile: { name: 'Synthetic unowned identity' } });
    const legacyToday = await legacy.page.locator('#view-today').innerText();
    assert.doesNotMatch(legacyToday, /Synthetic unowned legacy medicine|Synthetic unowned identity/);
    assert.equal(await legacy.page.locator('[data-unassigned-legacy-note]:visible').count(), 0, 'signed-out interface hides account/legacy notices');
    assert.equal(await legacy.page.evaluate(() => localStorage.getItem('doctorai-health-hub-medications')), JSON.stringify([{ id: 'unowned', name: 'Synthetic unowned legacy medicine' }]), 'unowned legacy storage remains untouched');
    assert.deepEqual(legacy.errors, [], 'legacy privacy browser errors');
    report.checks.push('signed-out synthetic legacy data remains unmodified and hidden from Today and notices');
    await legacy.context.close();

    fs.writeFileSync(path.join(evidenceDir, 'today-focus-qa.json'), JSON.stringify(report, null, 2));
    console.log(`Today focus passed: ${report.checks.length} browser check groups, ${report.screenshots.length} screenshots. Evidence: ${evidenceDir}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
