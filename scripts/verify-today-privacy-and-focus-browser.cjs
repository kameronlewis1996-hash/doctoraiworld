'use strict';
// Synthetic Chromium regression checks for the opt-in AI briefing and recoverable Today focus.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidenceDir = process.env.TODAY_PRIVACY_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-today-privacy-audit');
fs.mkdirSync(evidenceDir, { recursive: true });
const accountA = { sub: 'synthetic-briefing-account-a', email: 'briefing-a@example.invalid', name: 'Synthetic Account A' };
const accountB = { sub: 'synthetic-briefing-account-b', email: 'briefing-b@example.invalid', name: 'Synthetic Account B' };
const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((result, part) => part.type === 'year' ? `${part.value}-` : part.type === 'month' ? `${result}${part.value}-` : part.type === 'day' ? `${result}${part.value}` : result, '');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function startServer() {
  const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    const relative = pathname === '/' ? 'health-hub.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'health-hub.html')) { response.writeHead(403).end('Forbidden'); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(bytes);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

function stateFor(label, options = {}) {
  return {
    medications: [{ id: `${label}-med`, name: `Synthetic ${label} medicine`, dose: 'Synthetic strength', status: 'current' }],
    appointments: [], providers: [], documents: [], measurements: [], profile: { name: `Synthetic ${label} identity`, conditions: `Synthetic ${label} condition`, allergies: '', notes: 'Synthetic private profile note' },
    memoryEnabled: true, memoryDetails: ['Synthetic private memory detail'],
    timeline: options.timeline || [],
    tasks: options.tasks || []
  };
}

async function preparePage(browser, base, options = {}) {
  const width = options.width || 390;
  const context = await browser.newContext({ viewport: { width, height: width < 620 ? 844 : 960 }, timezoneId: 'Pacific/Auckland', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  const chatRequests = [];
  let auth = options.auth === undefined ? accountA : options.auth;
  let cloudState = options.state || stateFor('account-a', { timeline: [
    { id: 'symptom-alpha', type: 'symptom', date: localToday, title: 'Synthetic symptom alpha', description: 'Synthetic symptom alpha', name: 'Synthetic symptom alpha', severity: 3, context: 'Synthetic note context alpha' },
    { id: 'symptom-beta', type: 'symptom', date: localToday, title: 'Synthetic symptom beta', description: 'Synthetic symptom beta', name: 'Synthetic symptom beta', severity: 5, context: 'Synthetic note context beta' }
  ] });
  let nextChatResponse = { status: 200, answer: 'SAVED NOTES\n- No notes were selected.\n\nQUESTIONS TO DISCUSS\n- Is there anything else you want to record?' };
  let chatGate = null;
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = new URL(base).origin;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (url.pathname === '/api/auth/google') {
      if (route.request().method() === 'DELETE') { auth = null; await route.fulfill({ status: 200, json: { authenticated: false } }); return; }
      await route.fulfill({ status: 200, json: auth ? { authenticated: true, user: auth, medicationLoginId: '' } : { authenticated: false } });
      return;
    }
    if (url.pathname === '/api/auth/config') { await route.fulfill({ status: 200, json: { googleClientId: 'synthetic-client-id' } }); return; }
    if (url.pathname === '/api/stripe/entitlement') { await route.fulfill({ status: 200, json: { active: false, expiresAt: null } }); return; }
    if (url.pathname === '/api/health/state') {
      if (route.request().method() === 'PUT') {
        const payload = JSON.parse(route.request().postData() || '{}');
        writes.push(payload);
        if (payload.state) cloudState = payload.state;
        await route.fulfill({ status: 200, json: { updatedAt: Date.now() + 60000 } });
        return;
      }
      await route.fulfill({ status: 200, json: { state: cloudState, updatedAt: Date.now() + 60000 } });
      return;
    }
    if (url.pathname === '/api/chat') {
      const postData = route.request().postData() || '';
      chatRequests.push(JSON.parse(postData));
      const gate = chatGate;
      chatGate = null;
      if (gate) {
        gate.started.resolve();
        await gate.finish.promise;
      }
      const result = nextChatResponse;
      nextChatResponse = { status: 200, answer: 'SAVED NOTES\n- Synthetic note organized.\n\nQUESTIONS TO DISCUSS\n- What else would you like to record?' };
      try { await route.fulfill({ status: result.status, json: result.status < 400 ? { answer: result.answer } : { error: 'synthetic-unavailable' } }); }
      catch { /* The UI may cancel a held request after the session changes. */ }
      return;
    }
    if (url.pathname.startsWith('/api/')) { await route.fulfill({ status: 200, json: {} }); return; }
    await route.continue();
  });
  await page.addInitScript(guestState => {
    localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
    if (guestState && !sessionStorage.getItem('today-privacy-focus-fixture-seeded')) {
      sessionStorage.setItem('today-privacy-focus-fixture-seeded', 'yes');
      for (const key of ['medications', 'appointments', 'providers', 'documents', 'measurements', 'profile', 'memoryEnabled', 'memoryDetails', 'timeline', 'tasks']) {
        if (guestState[key] !== undefined) localStorage.setItem(`doctorai-health-hub-guest-${key}`, JSON.stringify(guestState[key]));
      }
    }
    window.google = { accounts: { id: { initialize() {}, renderButton(host) { host.dataset.syntheticGoogleReady = 'true'; } } } };
  }, options.auth === null ? (options.state || stateFor('guest', { timeline: [], tasks: [] })) : null);
  await page.goto(`${base}/health-hub.html#today`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#today-record-status')?.hidden === true);
  return {
    context, page, errors, chatRequests, writes,
    setAuth(value) { auth = value; }, setCloudState(value) { cloudState = value; },
    setNextChatResponse(value) { nextChatResponse = value; },
    holdNextChat() { const gate = { started: deferred(), finish: deferred() }; chatGate = gate; return gate; }
  };
}

async function openBriefing(testCase) {
  if (!await testCase.page.locator('#view-health').isVisible()) {
    await testCase.page.locator('#view-today .today-more-records [data-view="health"]').click();
    await testCase.page.locator('#view-health').waitFor({ state: 'visible' });
  }
  const reminders = testCase.page.locator('#view-health details.health-reminders-disclosure');
  if (await reminders.getAttribute('open') === null) await reminders.locator('summary').click();
  await testCase.page.locator('#view-health [data-open-today-plan]').click();
  await testCase.page.locator('#quick-modal[open]').waitFor({ state: 'visible' });
  await testCase.page.locator('.today-ai-consent').waitFor({ state: 'visible' });
}
async function closeBriefing(testCase) {
  if (await testCase.page.locator('#quick-modal').isVisible()) {
    await testCase.page.locator('#quick-modal [data-close-modal]').last().click();
    await testCase.page.locator('#quick-modal[open]').waitFor({ state: 'hidden' });
  }
}

(async () => {
  const { server, base } = await startServer();
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const report = { result: 'passed', syntheticOnly: true, checks: [], screenshots: [] };
  try {
    for (const width of [1440, 390, 320]) {
      const testCase = await preparePage(browser, base, { width });
      await openBriefing(testCase);
      assert.equal(testCase.chatRequests.length, 0, `${width}px opening a briefing makes no AI request`);
      assert.equal(await testCase.page.locator('#today-ai-include-symptoms').isChecked(), false, `${width}px symptom notes are opt-in by default`);
      assert.match(await testCase.page.locator('.today-ai-consent').innerText(), /OpenAI/);
      assert.match(await testCase.page.locator('.today-ai-consent').innerText(), /organize them into a short summary and neutral questions/);
      assert.match(await testCase.page.locator('.today-ai-consent').innerText(), /up to 30 days/);
      assert.match(await testCase.page.locator('.today-ai-consent').innerText(), /Synthetic symptom alpha/);
      assert.match(await testCase.page.locator('.today-ai-consent').innerText(), /Synthetic symptom beta/);
      assert.match(await testCase.page.locator('.today-ai-consent').innerText(), /Your profile, medicines, appointments, documents and Health Memory are not included/);
      assert.equal(await testCase.page.locator('.today-ai-consent').getByRole('link', { name: 'Read the Privacy Notice' }).count(), 1);
      assert.equal(await testCase.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}px consent layout has no horizontal overflow`);
      const labelBox = await testCase.page.locator('.today-ai-include-choice').boundingBox();
      assert.ok(labelBox && labelBox.height >= 44, `${width}px optional-notes control has a 44px touch target`);
      const generate = testCase.page.locator('#today-ai-generate');
      const generateBox = await generate.boundingBox();
      assert.ok(generateBox && generateBox.height >= 44, `${width}px Generate control has a 44px touch target`);
      const screenshot = path.join(evidenceDir, `today-ai-opt-in-${width}.png`);
      await testCase.page.screenshot({ path: screenshot, fullPage: false });
      report.screenshots.push(screenshot);
      if (width === 1440) {
        await testCase.page.locator('.today-ai-consent .modal-actions [data-close-modal]').click();
        assert.equal(testCase.chatRequests.length, 0, 'Cancel before consent makes no AI request');
        await closeBriefing(testCase);
        await openBriefing(testCase);
        await testCase.page.getByRole('checkbox', { name: 'Include these symptom notes in my request (optional)' }).check();
        await testCase.page.locator('.today-ai-consent .modal-actions [data-close-modal]').click();
        assert.equal(testCase.chatRequests.length, 0, 'Cancel after checking the optional notes still makes no AI request');
        await openBriefing(testCase);
        const includeNotes = testCase.page.getByRole('checkbox', { name: 'Include these symptom notes in my request (optional)' });
        await includeNotes.check();
        await includeNotes.uncheck();
        assert.equal(testCase.chatRequests.length, 0, 'reopening the briefing still makes no AI request');
        assert.match(await testCase.page.locator('#today-ai-generate').innerText(), /Generate without symptom notes/);
        await generate.click();
        await testCase.page.waitForFunction(() => document.querySelector('#today-ai-output')?.innerText.includes('AI-generated organizer draft'));
        assert.equal(testCase.chatRequests.length, 1, 'affirmative Generate is the first AI request');
        const withoutNotes = testCase.chatRequests[0];
        const withoutPrompt = withoutNotes.messages[0].content;
        assert.match(withoutPrompt, /Selected symptom notes: none/);
        for (const value of ['Synthetic symptom alpha', 'Synthetic symptom beta', 'Synthetic note context', 'Synthetic account-a medicine', 'Synthetic account-a condition', 'Synthetic private profile note', 'Synthetic private memory detail']) assert.equal(withoutPrompt.includes(value), false, `no-notes request excludes ${value}`);
        assert.equal(Object.hasOwn(withoutNotes, 'memory'), false, 'no hidden Health Memory field is attached');
        assert.match(await testCase.page.locator('#today-ai-output').innerText(), /AI-generated organizer draft — not saved/);
        const writesAfterNoNotes = testCase.writes.length;

        await closeBriefing(testCase);
        await openBriefing(testCase);
        const checkbox = testCase.page.getByRole('checkbox', { name: 'Include these symptom notes in my request (optional)' });
        await checkbox.check();
        assert.equal(testCase.chatRequests.length, 1, 'selecting the notes checkbox alone makes no request');
        assert.match(await testCase.page.locator('#today-ai-generate').innerText(), /Generate with selected symptom notes/);
        await testCase.page.locator('#today-ai-generate').click();
        await testCase.page.waitForFunction(() => document.querySelector('#today-ai-output')?.innerText.includes('AI-generated organizer draft'));
        assert.equal(testCase.chatRequests.length, 2, 'selected notes are sent only after affirmative Generate');
        const selectedPrompt = testCase.chatRequests[1].messages[0].content;
        for (const value of ['Synthetic symptom alpha', 'Synthetic symptom beta', 'Synthetic note context alpha', 'Synthetic note context beta']) assert.equal(selectedPrompt.includes(value), true, `selected request contains previewed ${value}`);
        for (const value of ['Synthetic account-a medicine', 'Synthetic account-a condition', 'Synthetic private profile note', 'Synthetic private memory detail']) assert.equal(selectedPrompt.includes(value), false, `selected request excludes ${value}`);
        assert.equal(Object.hasOwn(testCase.chatRequests[1], 'memory'), false, 'selected notes request contains no Health Memory field');
        assert.equal(testCase.writes.length, writesAfterNoNotes, 'AI briefing does not write or mark saved health data');

        testCase.setNextChatResponse({ status: 200, answer: 'SAVED NOTES\n- You should drink water.\n\nQUESTIONS TO DISCUSS\n- What else?' });
        await closeBriefing(testCase);
        await openBriefing(testCase);
        await checkbox.check();
        await testCase.page.locator('#today-ai-generate').click();
        await testCase.page.waitForFunction(() => document.querySelector('#today-ai-output')?.innerText.includes('did not follow the organizer-only format'));
        assert.doesNotMatch(await testCase.page.locator('#today-ai-output').innerText(), /You should drink water/);
        assert.doesNotMatch(await testCase.page.locator('#today-ai-output').innerText(), /saved to your health records|summary complete/i);

        testCase.setNextChatResponse({ status: 503 });
        await closeBriefing(testCase);
        await openBriefing(testCase);
        await testCase.page.locator('#today-ai-generate').click();
        await testCase.page.waitForFunction(() => document.querySelector('#today-ai-output')?.innerText.includes('could not be generated'));
        const failureCopy = await testCase.page.locator('#today-ai-output').innerText();
        assert.doesNotMatch(failureCopy, /saved to your health records|summary complete/i);
        assert.equal(testCase.writes.length, writesAfterNoNotes, 'failed generation leaves saved health state unchanged');
        assert.deepEqual(testCase.errors, [], `AI consent browser errors: ${testCase.errors.join('; ')}`);
        report.checks.push('AI summary: no request on open/cancel/checkbox; exact preview snapshot is opt-in; unchecked request excludes symptom notes; profile/medicines/appointments/documents/Health Memory excluded; invalid advice and provider error fail closed without save/complete claim; desktop/mobile consent layout at 1440/390/320');
      }
      await testCase.context.close();
    }

    const ownerChange = await preparePage(browser, base);
    await openBriefing(ownerChange);
    assert.match(await ownerChange.page.locator('.today-ai-consent').innerText(), /Synthetic symptom alpha/);
    ownerChange.setAuth(accountB);
    ownerChange.setCloudState(stateFor('account-b', { timeline: [], tasks: [{ id: 'b-focus', source: 'today-focus', date: localToday, label: 'Synthetic Account B focus', detail: 'Personal focus', done: false, createdAt: 20 }] }));
    await ownerChange.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await ownerChange.page.waitForFunction(() => document.querySelector('#session-verification-gate')?.hidden === true && document.querySelector('#today-focus-copy')?.innerText.includes('Synthetic Account B focus'));
    assert.equal(await ownerChange.page.locator('#quick-modal').isVisible(), false, 'owner change closes the consent preview');
    assert.equal(await ownerChange.page.locator('.today-ai-consent').count(), 0, 'owner change clears preview contents');
    assert.doesNotMatch(await ownerChange.page.locator('#main-content').innerText(), /Synthetic symptom alpha|Synthetic Account A identity/);
    assert.deepEqual(ownerChange.errors, [], 'preview owner-change errors');
    report.checks.push('session/owner transition closes and clears preview before Account B data is rendered');
    await ownerChange.context.close();

    const delayed = await preparePage(browser, base);
    const gate = delayed.holdNextChat();
    await openBriefing(delayed);
    await delayed.page.getByRole('checkbox', { name: 'Include these symptom notes in my request (optional)' }).check();
    await delayed.page.locator('#today-ai-generate').click();
    await gate.started.promise;
    delayed.setAuth(accountB);
    delayed.setCloudState(stateFor('account-b', { timeline: [], tasks: [] }));
    await delayed.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await delayed.page.waitForFunction(() => document.querySelector('#session-verification-gate')?.hidden === true && document.querySelector('#today-focus-copy')?.innerText.includes('No focus saved for today'));
    gate.finish.resolve();
    await delayed.page.waitForTimeout(100);
    assert.equal(await delayed.page.locator('.today-ai-consent').count(), 0, 'late response cannot restore the old preview');
    assert.doesNotMatch(await delayed.page.locator('#main-content').innerText(), /Synthetic symptom alpha|Synthetic Account A identity|Synthetic note organized/);
    assert.deepEqual(delayed.errors, [], 'late response after owner change errors');
    report.checks.push('delayed synthetic AI response after an Account A→B session change cannot render into the new owner surface');
    await delayed.context.close();

    const emptyGuest = await preparePage(browser, base, { auth: null, state: stateFor('guest', { timeline: [], tasks: [] }) });
    assert.equal(await emptyGuest.page.locator('#today-focus-copy [data-today-focus-clear]').count(), 0, 'empty focus state has no clear control');
    assert.equal(await emptyGuest.page.locator('#today-focus-copy [data-task-restore]').count(), 0, 'empty focus state has no restore control');
    await emptyGuest.context.close();

    const emptyBriefing = await preparePage(browser, base, { state: stateFor('account-a', { timeline: [], tasks: [] }) });
    await openBriefing(emptyBriefing);
    assert.match(await emptyBriefing.page.locator('.today-ai-consent').innerText(), /No recent symptom notes are available/);
    assert.equal(await emptyBriefing.page.locator('#today-ai-include-symptoms').count(), 0);
    assert.equal(await emptyBriefing.page.locator('#today-ai-generate').count(), 0);
    assert.equal(emptyBriefing.chatRequests.length, 0, 'empty saved symptom list sends no AI request');
    report.checks.push('empty signed-in symptom list has no misleading checkbox or generation action and sends no request');
    await emptyBriefing.context.close();

    const guestBriefing = await preparePage(browser, base, { auth: null, state: stateFor('guest', { timeline: [
      { id: 'guest-symptom', type: 'symptom', date: localToday, title: 'Synthetic guest symptom', description: 'Synthetic guest symptom', name: 'Synthetic guest symptom', severity: 2, context: 'Guest-only synthetic context' }
    ], tasks: [] }) });
    await openBriefing(guestBriefing);
    assert.match(await guestBriefing.page.locator('.today-ai-consent').innerText(), /No health notes are sent while signed out/);
    assert.match(await guestBriefing.page.locator('.today-ai-consent').innerText(), /Synthetic guest symptom/);
    assert.equal(await guestBriefing.page.locator('#today-ai-include-symptoms').count(), 0);
    assert.equal(guestBriefing.chatRequests.length, 0, 'intentional signed-out guest note remains local');
    report.checks.push('intentional signed-out guest notes stay local and cannot trigger AI generation');
    await guestBriefing.context.close();

    const guest = await preparePage(browser, base, { auth: null, state: stateFor('unused', { timeline: [], tasks: [
      { id: 'guest-focus', source: 'today-focus', date: localToday, label: 'Synthetic guest focus', detail: 'Personal focus', done: false, createdAt: 1 },
      { id: 'guest-reminder', label: 'Synthetic reminder to preserve', detail: 'Non-focus task', done: false, createdAt: 2 }
    ] }) });
    const focus = guest.page.locator('#today-focus-copy [data-today-focus-clear]');
    assert.equal(await focus.count(), 1);
    const clearBox = await focus.boundingBox();
    assert.ok(clearBox && clearBox.width >= 44 && clearBox.height >= 44, 'focus clear action has a 44px touch target');
    guest.page.once('dialog', dialog => dialog.dismiss());
    await focus.click();
    assert.match(await guest.page.locator('#today-focus-copy').innerText(), /Synthetic guest focus/);
    assert.equal((await guest.page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks') || '[]'))).find(task => task.id === 'guest-focus')?.archivedAt, undefined, 'cancel leaves task unchanged');
    guest.page.once('dialog', dialog => dialog.accept());
    await guest.page.locator('#today-focus-copy [data-today-focus-clear]').click();
    assert.match(await guest.page.locator('#today-focus-copy').innerText(), /No focus set for today/);
    assert.match(await guest.page.locator('#today-focus-copy').innerText(), /Synthetic guest focus/);
    const cleared = await guest.page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks') || '[]'));
    assert.ok(cleared.find(task => task.id === 'guest-focus')?.archivedAt, 'clear archives without deleting the focus record');
    assert.equal(cleared.find(task => task.id === 'guest-reminder')?.label, 'Synthetic reminder to preserve', 'clear preserves unrelated task');
    const clearedScreenshot = path.join(evidenceDir, 'today-focus-cleared-390.png');
    await guest.page.screenshot({ path: clearedScreenshot, fullPage: false });
    report.screenshots.push(clearedScreenshot);
    await guest.page.reload({ waitUntil: 'networkidle' });
    await guest.page.waitForFunction(() => document.querySelector('#today-record-status')?.hidden === true);
    assert.match(await guest.page.locator('#today-focus-copy').innerText(), /No focus set for today/);
    await guest.page.locator('#today-focus-copy [data-task-restore]').click();
    assert.match(await guest.page.locator('#today-focus-copy').innerText(), /Synthetic guest focus[\s\S]*Chosen by you/);
    const restored = await guest.page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-tasks') || '[]'));
    assert.equal(restored.find(task => task.id === 'guest-focus')?.archivedAt, undefined, 'restore reuses preserved record');
    assert.deepEqual(guest.errors, [], 'guest clear/restore errors');
    report.checks.push('focus clear is cancellable, archives rather than deletes, survives reload, restores, preserves unrelated tasks, and is disabled when no focus exists');
    await guest.context.close();

    const ownerIsolation = await preparePage(browser, base, { auth: accountA, state: stateFor('account-a', { timeline: [], tasks: [
      { id: 'account-a-focus', source: 'today-focus', date: localToday, label: 'Synthetic Account A focus', detail: 'Personal focus', done: false, createdAt: 10 }
    ] }) });
    ownerIsolation.page.once('dialog', dialog => dialog.accept());
    await ownerIsolation.page.locator('#today-focus-copy [data-today-focus-clear]').click();
    await ownerIsolation.page.waitForFunction(() => document.querySelector('#today-focus-copy')?.innerText.includes('No focus set for today'));
    ownerIsolation.setAuth(accountB);
    ownerIsolation.setCloudState(stateFor('account-b', { timeline: [], tasks: [
      { id: 'account-b-focus', source: 'today-focus', date: localToday, label: 'Synthetic Account B focus', detail: 'Personal focus', done: false, createdAt: 20 }
    ] }));
    await ownerIsolation.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await ownerIsolation.page.waitForFunction(() => document.querySelector('#today-focus-copy')?.innerText.includes('Synthetic Account B focus'));
    assert.doesNotMatch(await ownerIsolation.page.locator('#main-content').innerText(), /Synthetic Account A focus/);
    assert.equal((await ownerIsolation.page.locator('#today-task-list').innerText()).includes('Synthetic Account A focus'), false, 'account B cannot see account A archived focus');
    assert.deepEqual(ownerIsolation.errors, [], 'account focus isolation errors');
    report.checks.push('archived Account A focus is absent after an Account A→B switch; B sees only its own focus');
    await ownerIsolation.context.close();

    fs.writeFileSync(path.join(evidenceDir, 'today-privacy-focus-report.json'), JSON.stringify(report, null, 2));
    console.log(`Today privacy/focus passed: ${report.checks.length} browser check groups. Evidence: ${evidenceDir}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
