const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const auditDir = '/tmp/doctorai-auth-status-audit';
const signedInUser = { email: 'synthetic.member@example.invalid', sub: 'synthetic-member', name: 'Synthetic Member' };
const accountA = { email: 'synthetic.account-a@example.invalid', sub: 'synthetic-account-a', name: 'Synthetic Account A' };
const accountB = { email: 'synthetic.account-b@example.invalid', sub: 'synthetic-account-b', name: 'Synthetic Account B' };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
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

async function installApi(page, initial = {}) {
  let auth = initial.auth || null;
  let loginUser = initial.loginUser || signedInUser;
  let healthState = initial.healthState || null;
  let healthStateUnavailable = initial.healthStateUnavailable === true;
  let healthStateWrites = 0;
  let failNextAuth = false;
  let nextAuthGate = null;
  let nextLoginGate = null;
  let nextLogoutGate = null;
  let nextMedicationScanGate = null;
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ status: 200, json: {} }));
  await page.route('**/api/auth/config', route => route.fulfill({ status: 200, json: { googleClientId: 'synthetic-client-id' } }));
  await page.route('**/api/stripe/entitlement', route => route.fulfill({ status: 200, json: { active: initial.entitlementActive === true, expiresAt: initial.entitlementActive === true ? Math.floor(Date.now() / 1000) + 3600 : null } }));
  await page.route('**/api/medication/scan', async route => {
    const gate = nextMedicationScanGate;
    nextMedicationScanGate = null;
    if (gate) { gate.started.resolve(); await gate.response.promise; }
    try { await route.fulfill({ status: 200, json: { medication: {}, review: { missing: [] } } }); } catch { /* The synthetic client may abort after session loss. */ }
  });
  await page.route('**/api/health/state', route => {
    if (route.request().method() === 'PUT') {
      healthStateWrites++;
      return route.fulfill({ status: 200, json: { updatedAt: Date.now() + 60000 } });
    }
    if (healthStateUnavailable) return route.fulfill({ status: 503, json: { code: 'secure_storage_not_configured' } });
    return route.fulfill({ status: 200, json: { state: healthState, updatedAt: healthState ? Date.now() + 60000 : 0 } });
  });
  await page.route('**/api/auth/google', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      const payload = auth ? { authenticated: true, user: auth, medicationLoginId: '' } : { authenticated: false };
      if (failNextAuth) { failNextAuth = false; await route.fulfill({ status: 503, json: { error: 'synthetic-auth-unavailable' } }); return; }
      const gate = nextAuthGate;
      nextAuthGate = null;
      if (gate) { gate.started.resolve(); await gate.response.promise; }
      await route.fulfill({ status: 200, json: payload });
      return;
    }
    if (method === 'DELETE') {
      const gate = nextLogoutGate;
      nextLogoutGate = null;
      if (gate) { gate.started.resolve(); await gate.response.promise; }
      auth = null;
      await route.fulfill({ status: 200, json: { authenticated: false } });
      return;
    }
    if (method === 'POST') {
      const gate = nextLoginGate;
      nextLoginGate = null;
      if (gate) { gate.started.resolve(); await gate.response.promise; }
      auth = loginUser;
      await route.fulfill({ status: 200, json: { authenticated: true, user: auth, medicationLoginId: '' } });
      return;
    }
    await route.fulfill({ status: 405, json: { error: 'method-not-allowed' } });
  });

  await page.addInitScript(cameraConfig => {
    localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
    window.google = { accounts: { id: {
      initialize(options) { window.__syntheticGoogleCallback = options.callback; },
      renderButton(host) { host.dataset.syntheticGoogleReady = 'true'; }
    } } };
    if (cameraConfig.enabled) {
      const track = { readyState: 'live', stop() { this.readyState = 'ended'; this.stopCount = (this.stopCount || 0) + 1; } };
      const stream = { getTracks() { return [track]; }, getVideoTracks() { return [track]; } };
      let releaseCamera;
      const delayedCamera = new Promise(resolve => { releaseCamera = resolve; });
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => cameraConfig.delayed ? delayedCamera : stream } });
      Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return this.__syntheticSrcObject || null; }, set(value) { this.__syntheticSrcObject = value; } });
      Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: function() { return Promise.resolve(); } });
      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get() { return 640; } });
      Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get() { return 480; } });
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ({ fillRect() {}, drawImage() {} }) });
      Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', { configurable: true, value: () => 'data:image/jpeg;base64,c3ludGhldGljLW9ubHk=' });
      window.__syntheticCameraTrack = track;
      window.__releaseSyntheticCamera = () => releaseCamera(stream);
    }
  }, { enabled: initial.cameraStub === true, delayed: initial.cameraStubDelay === true });
  return {
    setAuth(value) { auth = value; },
    setLoginUser(value) { loginUser = value; },
    setHealthState(value) { healthState = value; },
    healthStateWriteCount() { return healthStateWrites; },
    failNextAuth() { failNextAuth = true; },
    delayNextAuth() { nextAuthGate = { started: deferred(), response: deferred() }; return nextAuthGate; },
    delayNextLogin() { nextLoginGate = { started: deferred(), response: deferred() }; return nextLoginGate; },
    delayNextLogout() { nextLogoutGate = { started: deferred(), response: deferred() }; return nextLogoutGate; },
    delayNextMedicationScan() { nextMedicationScanGate = { started: deferred(), response: deferred() }; return nextMedicationScanGate; }
  };
}

async function waitForGate(promise, name) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for synthetic ${name}`)), 12000); timer.unref(); })]);
  } finally { clearTimeout(timer); }
}

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function syntheticHealthState(label) {
  const date = todayDate();
  return {
    profile: { name: `${label} profile`, conditions: `${label} condition`, allergies: `${label} allergy` },
    medications: [{ id: `${label}-medicine`, name: `${label} medicine`, dose: '100 mg' }],
    appointments: [{ id: `${label}-appointment`, title: `${label} appointment`, date, time: '10:30' }],
    tasks: [{ id: `${label}-focus`, source: 'today-focus', date, label: `${label} focus`, detail: 'Personal focus', done: false, createdAt: 1 }]
  };
}

async function waitForHealthRecords(testCase, label) {
  await testCase.page.locator('#view-health:not([hidden])').waitFor({ state: 'visible' });
  await testCase.page.waitForFunction(label => document.querySelector('#conditions-tags')?.textContent.includes(`${label} condition`), label);
}

async function openStaleHealthEditor(testCase) {
  await testCase.page.locator('#view-health [data-modal="health"]').first().click();
  await testCase.page.locator('#quick-modal[open] [data-modal-form="health"]').waitFor({ state: 'visible' });
  await testCase.page.evaluate(() => {
    window.__staleHealthForm = document.querySelector('[data-modal-form="health"]');
    window.__staleHealthForm.elements.notes.value = 'Synthetic unsaved account A note';
  });
}

async function assertPrivateSurfaceLocked(testCase) {
  assert.equal(await testCase.page.locator('#view-stack').isHidden(), true);
  assert.equal(await testCase.page.locator('#view-stack').evaluate(element => element.inert), true);
  assert.equal(await testCase.page.locator('#quick-modal').evaluate(element => element.open), false);
  assert.equal(await testCase.page.locator('#modal-body').textContent(), '');
  assert.doesNotMatch(await testCase.page.locator('body').innerText(), /Synthetic Account A (?:profile|condition|allergy|medicine)/);
}

async function tryStaleHealthSubmit(testCase) {
  const writes = testCase.api.healthStateWriteCount();
  const before = await privateStorageSnapshot(testCase.page);
  await testCase.page.evaluate(() => {
    window.__staleHealthForm.elements.notes.value = 'Synthetic stale note';
    window.__staleHealthForm.requestSubmit();
  });
  assert.deepEqual(await privateStorageSnapshot(testCase.page), before, 'stale form must not change stored profile or task state');
  assert.equal(testCase.api.healthStateWriteCount(), writes, 'stale form must not write account state');
}

async function openSavedOverview(testCase) {
  const nav = testCase.width <= 620 ? '.mobile-bottom-nav-item[data-view="profile"]' : '.primary-nav .nav-item[data-view="profile"]';
  await testCase.page.locator(nav).click();
  await testCase.page.locator('#view-profile:not([hidden])').waitFor({ state: 'visible' });
  await testCase.page.locator('#view-profile [data-open-personal-overview]').click();
  await testCase.page.locator('#quick-modal[open]').waitFor({ state: 'visible' });
}

async function privateStorageSnapshot(page) {
  return page.evaluate(() => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter(key => /doctorai-health-hub-(?:guest|account-.+)-(?:tasks|profile)$/.test(key || ''))
    .sort()
    .map(key => [key, localStorage.getItem(key)]));
}

async function createCase(browser, base, options = {}) {
  const width = options.width || 1440;
  const context = await browser.newContext({ viewport: { width, height: width <= 620 ? 844 : 960 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const api = await installApi(page, options);
  const initialAuthGate = options.delayInitialAuth ? api.delayNextAuth() : null;
  await page.goto(`${base}/health-hub.html#health`, { waitUntil: 'domcontentloaded' });
  return { context, page, api, errors, width, initialAuthGate };
}

function activeStatusSelector(width) {
  return width <= 620 ? '.mobile-notifications-button[data-auth-status-control]' : '.profile-trigger[data-auth-status-control]';
}

async function waitForState(testCase, state) {
  await testCase.page.locator(`${activeStatusSelector(testCase.width)}[data-auth-state="${state}"]`).waitFor({ state: 'visible' });
}

async function statusMetrics(testCase) {
  return testCase.page.locator(activeStatusSelector(testCase.width)).evaluate(element => {
    const style = getComputedStyle(element);
    const label = element.querySelector('[data-auth-status-label]');
    return {
      state: element.dataset.authState,
      text: label?.textContent.trim() || '',
      ariaLabel: element.getAttribute('aria-label'),
      ariaBusy: element.getAttribute('aria-busy'),
      disabled: element.disabled,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      labelWidth: label?.getBoundingClientRect().width || 0,
      labelScrollWidth: label?.scrollWidth || 0,
      labelDisplay: label ? getComputedStyle(label).display : 'missing',
      color: style.color,
      background: style.backgroundColor,
      focusStyle: getComputedStyle(element, ':focus-visible').outlineStyle,
      liveText: document.querySelector('#auth-status-live')?.textContent.trim() || '',
      liveRole: document.querySelector('#auth-status-live')?.getAttribute('role'),
      liveId: element.getAttribute('aria-describedby'),
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      topbarBounds: document.querySelector('.hub-topbar')?.getBoundingClientRect().toJSON(),
      controlBounds: element.getBoundingClientRect().toJSON(),
      headerText: document.querySelector('.hub-topbar')?.innerText || ''
    };
  });
}

function rgbLuminance(color) {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
  assert.equal(channels.length, 3, `expected a computed RGB color, received ${color}`);
  const linear = channels.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const values = [rgbLuminance(foreground), rgbLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function assertAccessibleStatus(testCase, expectedState, expectedText) {
  const metrics = await statusMetrics(testCase);
  const expectedColors = {
    checking: ['rgb(41, 72, 95)', 'rgb(241, 246, 249)'],
    unavailable: ['rgb(98, 64, 14)', 'rgb(255, 244, 223)'],
    'signed-out': ['rgb(255, 255, 255)', 'rgb(14, 110, 183)'],
    'signed-in': ['rgb(23, 53, 80)', 'rgb(234, 248, 243)']
  }[expectedState];
  assert.equal(metrics.state, expectedState);
  assert.equal(metrics.text, expectedText);
  assert.equal(metrics.color, expectedColors[0], `foreground color did not match ${expectedState}`);
  assert.equal(metrics.background, expectedColors[1], `background color did not match ${expectedState}`);
  assert.ok(metrics.height >= 44, `header status height is ${metrics.height}px`);
  assert.ok(metrics.width >= 44, `header status width is ${metrics.width}px`);
  assert.ok(metrics.labelWidth > 0 && metrics.labelDisplay !== 'none', 'visible status label is hidden or has no layout width');
  assert.ok(metrics.labelScrollWidth <= metrics.labelWidth + 1, `status label clips: ${metrics.labelScrollWidth}px text in ${metrics.labelWidth}px`);
  assert.ok(metrics.controlBounds.top >= metrics.topbarBounds.top && metrics.controlBounds.bottom <= metrics.topbarBounds.bottom, 'status control escaped the header bounds');
  assert.ok(metrics.documentWidth <= metrics.viewportWidth, `header overflows ${metrics.viewportWidth}px viewport`);
  assert.equal(metrics.liveRole, 'status');
  assert.equal(metrics.liveId, 'auth-status-live');
  assert.ok(contrastRatio(metrics.color, metrics.background) >= 4.5, `status contrast is ${contrastRatio(metrics.color, metrics.background).toFixed(2)}:1`);
  return metrics;
}

async function keyboardReachable(testCase) {
  const page = testCase.page;
  await page.locator('.skip-link').focus();
  let reached = false;
  for (let index = 0; index < 100; index += 1) {
    await page.keyboard.press('Tab');
    reached = await page.locator(activeStatusSelector(testCase.width)).evaluate(element => element === document.activeElement);
    if (reached) break;
  }
  assert.ok(reached, 'header auth status was not reachable by keyboard tabbing');
  const focusStyle = await page.locator(activeStatusSelector(testCase.width)).evaluate(element => getComputedStyle(element).outlineStyle);
  assert.notEqual(focusStyle, 'none', 'keyboard focus indicator is missing');
  return focusStyle;
}

async function simulateTabReturn(page) {
  await page.evaluate(() => {
    window.__fakeHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__fakeHidden });
    window.__fakeHidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.hidden === true);
  await page.evaluate(() => { window.__fakeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => document.hidden === false);
}

async function finish(testCase, reports, name) {
  assert.deepEqual(testCase.errors, [], 'browser emitted JavaScript errors');
  reports.push({ case: name, result: 'passed' });
  await testCase.context.close();
}

async function runFunctional(browser, base) {
  const reports = [];
  const firstOpen = await createCase(browser, base, { width: 390, delayInitialAuth: true });
  const { page, api } = firstOpen;
  await waitForGate(firstOpen.initialAuthGate.started.promise, 'firstOpen.initialAuthGate');
  await waitForState(firstOpen, 'checking');
  let metrics = await assertAccessibleStatus(firstOpen, 'checking', 'Checking sign-in');
  assert.equal(metrics.disabled, true);
  assert.match(metrics.liveText, /checking sign-in status/i);
  firstOpen.initialAuthGate.response.resolve();
  await waitForState(firstOpen, 'signed-out');
  assert.equal(await firstOpen.page.locator('#view-health').isVisible(), true, 'My Health is the default signed-out view');
  assert.equal(await firstOpen.page.locator('#view-today').count(), 0, 'the retired Today view is absent');
  metrics = await assertAccessibleStatus(firstOpen, 'signed-out', 'Sign in');
  assert.match(metrics.ariaLabel, /sign in with google/i);
  assert.match(metrics.liveText, /signed out/i);
  const focusStyle = await keyboardReachable(firstOpen);
  const signInControl = firstOpen.page.locator(activeStatusSelector(firstOpen.width));
  await signInControl.click();
  await firstOpen.page.locator('#google-signin-modal[open]').waitFor({ state: 'visible' });
  await firstOpen.page.waitForFunction(() => typeof window.__syntheticGoogleCallback === 'function');
  const login = api.delayNextLogin();
  await firstOpen.page.evaluate(() => { window.__syntheticGoogleCallback({ credential: 'synthetic-google-credential' }); });
  await waitForGate(login.started.promise, 'login');
  await waitForState(firstOpen, 'checking');
  metrics = await assertAccessibleStatus(firstOpen, 'checking', 'Checking sign-in');
  assert.equal(metrics.disabled, true);
  login.response.resolve();
  await waitForState(firstOpen, 'signed-in');
  metrics = await assertAccessibleStatus(firstOpen, 'signed-in', 'Signed in');
  assert.doesNotMatch(metrics.headerText, /synthetic\.member@example\.invalid|Synthetic Member/);
  await firstOpen.page.locator(activeStatusSelector(firstOpen.width)).click();
  await firstOpen.page.locator('#view-profile:not([hidden])').waitFor({ state: 'visible' });
  await firstOpen.page.locator('#view-profile [data-open-profile]').click();
  await firstOpen.page.locator('#profile-drawer:not([hidden])').waitFor({ state: 'visible' });
  assert.match(await firstOpen.page.locator('.drawer-profile').innerText(), /Synthetic Member/);
  const logout = api.delayNextLogout();
  await firstOpen.page.locator('.drawer-signout[data-google-signout]').click();
  await waitForGate(logout.started.promise, 'logout');
  await waitForState(firstOpen, 'checking');
  metrics = await assertAccessibleStatus(firstOpen, 'checking', 'Checking sign-in');
  assert.equal(metrics.disabled, true);
  logout.response.resolve();
  await waitForState(firstOpen, 'signed-out');
  metrics = await assertAccessibleStatus(firstOpen, 'signed-out', 'Sign in');
  assert.doesNotMatch(await firstOpen.page.locator('body').innerText(), /synthetic\.member@example\.invalid|Synthetic Member/);
  reports.push({ case: 'mobile-first-open-login-logout-keyboard-aria-contrast-touch', result: 'passed', statusFontContrast: '>= 4.5:1', focusStyle, touchTarget: `${Math.round(metrics.width)}x${Math.round(metrics.height)}px` });
  await finish(firstOpen, reports, 'functional-flow');
  return reports;
}

async function runVisual(browser, base) {
  fs.mkdirSync(auditDir, { recursive: true });
  const reports = [];
  for (const width of [1440, 390, 320]) {
    const signedOut = await createCase(browser, base, { width });
    await waitForState(signedOut, 'signed-out');
    const signedOutMetrics = await assertAccessibleStatus(signedOut, 'signed-out', 'Sign in');
    await signedOut.page.screenshot({ path: path.join(auditDir, `final-first-open-${width}.png`), fullPage: false });
    const keyboardFocus = await keyboardReachable(signedOut);
    reports.push({ case: 'first-open-signed-out', width, result: 'passed', metrics: signedOutMetrics, keyboardFocus });
    await finish(signedOut, reports, `visual-signed-out-${width}`);

    if (width === 320) continue;
    const signedIn = await createCase(browser, base, { width, auth: signedInUser });
    await waitForState(signedIn, 'signed-in');
    const signedInMetrics = await assertAccessibleStatus(signedIn, 'signed-in', 'Signed in');
    assert.doesNotMatch(signedInMetrics.headerText, /synthetic\.member@example\.invalid|Synthetic Member/);
    await signedIn.page.screenshot({ path: path.join(auditDir, `final-signed-in-${width}.png`), fullPage: false });
    reports.push({ case: 'verified-signed-in-label', width, result: 'passed', metrics: signedInMetrics });
    await finish(signedIn, reports, `visual-signed-in-${width}`);
  }
  for (const width of [1440, 390, 320]) {
    const checking = await createCase(browser, base, { width, auth: accountA, healthState: syntheticHealthState('Synthetic Account A') });
    await waitForState(checking, 'signed-in');
    const medicationNav = width <= 620
      ? '.mobile-bottom-nav-item[data-view="medications"]'
      : '.primary-nav .nav-item[data-view="medications"]';
    await checking.page.locator(medicationNav).click();
    await checking.page.locator('#view-medications:not([hidden])').waitFor({ state: 'visible' });
    await checking.page.waitForFunction(() => document.querySelector('#medication-library')?.textContent.includes('Synthetic Account A medicine'));
    await checking.page.locator('#view-medications button[data-modal="medication"]').first().focus();
    const gate = checking.api.delayNextAuth();
    await simulateTabReturn(checking.page);
    await waitForGate(gate.started.promise, 'gate');
    await waitForState(checking, 'checking');
    const gateMetrics = await checking.page.locator('#session-verification-gate').evaluate(element => {
      const title = element.querySelector('h1');
      const copy = element.querySelector('p');
      const button = element.querySelector('button');
      const titleStyle = getComputedStyle(title);
      const copyStyle = getComputedStyle(copy);
      return {
        role: element.getAttribute('role'),
        live: element.getAttribute('aria-live'),
        labelledBy: element.getAttribute('aria-labelledby'),
        title: title.textContent.trim(),
        copy: copy.textContent.trim(),
        titleFontSize: parseFloat(titleStyle.fontSize),
        copyFontSize: parseFloat(copyStyle.fontSize),
        copyColor: copyStyle.color,
        background: getComputedStyle(element).backgroundColor,
        buttonMinHeight: parseFloat(getComputedStyle(button).minHeight),
        paragraphFontRules: Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules); } catch { return []; } }).filter(rule => rule.type === CSSRule.STYLE_RULE && rule.style.fontSize && rule.selectorText.split(',').some(selector => { try { return copy.matches(selector.trim()); } catch { return false; } })).map(rule => ({ selector: rule.selectorText, fontSize: rule.style.fontSize, important: rule.style.getPropertyPriority('font-size') })),
        buttonHiddenWhileChecking: button.hidden,
        focusedHeading: document.activeElement === title,
        gateBounds: element.getBoundingClientRect().toJSON(),
        viewStackHidden: document.querySelector('#view-stack').hidden,
        viewStackInert: document.querySelector('#view-stack').inert,
        viewStackAriaHidden: document.querySelector('#view-stack').getAttribute('aria-hidden'),
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyText: document.body.innerText
      };
    });
    assert.equal(gateMetrics.role, 'status');
    assert.equal(gateMetrics.live, 'polite');
    assert.equal(gateMetrics.labelledBy, 'session-verification-title');
    assert.equal(gateMetrics.title, 'Checking sign-in');
    assert.match(gateMetrics.copy, /saved health information is hidden/i);
    assert.ok(gateMetrics.titleFontSize >= 24, `gate title is ${gateMetrics.titleFontSize}px`);
    assert.ok(gateMetrics.copyFontSize >= 16, `gate copy is ${gateMetrics.copyFontSize}px; rules: ${JSON.stringify(gateMetrics.paragraphFontRules)}`);
    assert.ok(gateMetrics.buttonMinHeight >= 44, `gate retry target is ${gateMetrics.buttonMinHeight}px tall`);
    assert.equal(gateMetrics.buttonHiddenWhileChecking, true);
    assert.equal(gateMetrics.focusedHeading, true, 'focus moves out of the private records when the session gate opens');
    assert.equal(gateMetrics.viewStackHidden, true);
    assert.equal(gateMetrics.viewStackInert, true);
    assert.equal(gateMetrics.viewStackAriaHidden, 'true');
    assert.doesNotMatch(gateMetrics.bodyText, /Synthetic Account A (?:medicine|condition|allergy)/);
    assert.ok(gateMetrics.documentWidth <= gateMetrics.viewportWidth, `session gate overflows ${gateMetrics.viewportWidth}px viewport`);
    assert.ok(contrastRatio(gateMetrics.copyColor, gateMetrics.background) >= 4.5, `session gate copy contrast is ${contrastRatio(gateMetrics.copyColor, gateMetrics.background).toFixed(2)}:1`);
    await checking.page.screenshot({ path: path.join(auditDir, `session-gate-${width}.png`), fullPage: false });
    gate.response.resolve();
    await waitForState(checking, 'signed-in');
    await checking.page.locator('#view-stack:not([hidden])').waitFor({ state: 'visible' });
    assert.equal(await checking.page.locator('#session-verification-gate').isHidden(), true);
    assert.match(await checking.page.locator('#medication-library').innerText(), /Synthetic Account A medicine/, 'same-account verification restores the retained view');
    reports.push({ case: 'session-gate-accessibility-responsive-and-same-account-recovery', width, result: 'passed', metrics: gateMetrics });
    await finish(checking, reports, `session-gate-visual-${width}`);
  }
  const checking = await createCase(browser, base, { width: 390 });
  await waitForState(checking, 'signed-out');
  const gate = checking.api.delayNextAuth();
  await simulateTabReturn(checking.page);
  await waitForGate(gate.started.promise, 'gate');
  await waitForState(checking, 'checking');
  const pendingMetrics = await assertAccessibleStatus(checking, 'checking', 'Checking sign-in');
  await checking.page.screenshot({ path: path.join(auditDir, 'final-checking-mobile.png'), fullPage: false });
  gate.response.resolve();
  await waitForState(checking, 'signed-out');
  await finish(checking, reports, 'visual-checking-mobile');

  const cloudUnavailable = await createCase(browser, base, { width: 390, auth: accountA, healthStateUnavailable: true, healthState: syntheticHealthState('Synthetic Account A') });
  await waitForState(cloudUnavailable, 'signed-in');
  await cloudUnavailable.page.locator('.mobile-bottom-nav-item[data-view="profile"]').click();
  await cloudUnavailable.page.locator('#view-profile:not([hidden])').waitFor({ state: 'visible' });
  await cloudUnavailable.page.waitForFunction(() => document.querySelector('#hub-account-sync-note')?.textContent.includes('Account storage is unavailable'));
  assert.match(await cloudUnavailable.page.locator('#hub-account-sync-note').innerText(), /Account storage is unavailable/);
  assert.equal(await cloudUnavailable.page.locator('#session-verification-gate').isHidden(), true, 'verified account data remains accessible when cloud storage is unavailable');
  assert.equal(await cloudUnavailable.page.locator('#view-stack').isHidden(), false);
  reports.push({ case: 'verified-account-remains-accessible-when-cloud-storage-is-unavailable', result: 'passed' });
  await finish(cloudUnavailable, reports, 'cloud-unavailable-account-access');

  const unavailable = await createCase(browser, base, { width: 390 });
  await waitForState(unavailable, 'signed-out');
  unavailable.api.failNextAuth();
  await simulateTabReturn(unavailable.page);
  await waitForState(unavailable, 'unavailable');
  const unavailableMetrics = await assertAccessibleStatus(unavailable, 'unavailable', 'Status unavailable');
  assert.match(unavailableMetrics.ariaLabel, /try sign in again/i);
  await unavailable.page.screenshot({ path: path.join(auditDir, 'final-unavailable-mobile.png'), fullPage: false });
  reports.push({ case: 'status-unavailable-remains-distinct', result: 'passed', metrics: unavailableMetrics, checking: pendingMetrics });
  await finish(unavailable, reports, 'visual-unavailable-mobile');
  return reports;
}

async function runAdverse(browser, base) {
  const reports = [];

  {
    const testCase = await createCase(browser, base, { width: 1440, auth: accountA, healthState: syntheticHealthState('Synthetic Account A') });
    await waitForState(testCase, 'signed-in');
    await waitForHealthRecords(testCase, 'Synthetic Account A');
    await openStaleHealthEditor(testCase);
    const logout = testCase.api.delayNextLogout();
    // A session change can arrive while a modal is open; trigger the handler without claiming a user-reachable click.
    await testCase.page.evaluate(() => document.querySelector('.drawer-signout[data-google-signout]').click());
    await waitForGate(logout.started.promise, 'logout');
    await waitForState(testCase, 'checking');
    await assertPrivateSurfaceLocked(testCase);
    await tryStaleHealthSubmit(testCase);
    logout.response.resolve();
    await waitForState(testCase, 'signed-out');
    await testCase.page.locator('#view-stack:not([hidden])').waitFor({ state: 'visible' });
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /Synthetic Account A/);
    await tryStaleHealthSubmit(testCase);
    testCase.api.setHealthState(syntheticHealthState('Synthetic Account B'));
    testCase.api.setLoginUser(accountB);
    await testCase.page.locator(activeStatusSelector(testCase.width)).click();
    await testCase.page.locator('#google-signin-modal[open]').waitFor({ state: 'visible' });
    await testCase.page.waitForFunction(() => typeof window.__syntheticGoogleCallback === 'function');
    const login = testCase.api.delayNextLogin();
    await testCase.page.evaluate(() => { window.__syntheticGoogleCallback({ credential: 'synthetic-account-b-credential' }); });
    await waitForGate(login.started.promise, 'login'); login.response.resolve();
    await waitForState(testCase, 'signed-in');
    await waitForHealthRecords(testCase, 'Synthetic Account B');
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /Synthetic Account A/);
    await tryStaleHealthSubmit(testCase);

    reports.push({ case: 'delayed-logout-editor-and-account-a-to-guest-to-b-isolation', result: 'passed', logout: 'programmatic handler while modal open' });
    await finish(testCase, reports, 'logout-owner-transition');
  }
  {
    const testCase = await createCase(browser, base, { width: 1440, auth: accountA, healthState: syntheticHealthState('Synthetic Account A') });
    await waitForState(testCase, 'signed-in');
    await waitForHealthRecords(testCase, 'Synthetic Account A');
    await openStaleHealthEditor(testCase);
    testCase.api.setAuth(null);
    const gate = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page); await waitForGate(gate.started.promise, 'gate');
    await waitForState(testCase, 'checking');
    await assertPrivateSurfaceLocked(testCase);
    await tryStaleHealthSubmit(testCase);
    const hiddenIdentity = await testCase.page.evaluate(() => ({ header: document.querySelector('.hub-topbar').innerText, drawer: document.querySelector('.drawer-profile').innerText, profileName: document.querySelector('#profile-page-name').textContent }));
    assert.doesNotMatch(JSON.stringify(hiddenIdentity), /synthetic\.account-a@example\.invalid|Synthetic Account A/);
    gate.response.resolve(); await waitForState(testCase, 'signed-out');
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /synthetic\.account-a@example\.invalid|Synthetic Account A/);

    reports.push({ case: 'expired-session-hides-identity-editor-and-health-records', result: 'passed', duringCheck: hiddenIdentity });
    await finish(testCase, reports, 'expired-session');
  }
  {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA, healthState: syntheticHealthState('Synthetic Account A') });
    await waitForState(testCase, 'signed-in');
    await waitForHealthRecords(testCase, 'Synthetic Account A');
    await testCase.page.locator('.mobile-bottom-nav-item[data-view="medications"]').click();
    await testCase.page.locator('#view-medications:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.waitForFunction(() => document.querySelector('#medication-library')?.textContent.includes('Synthetic Account A medicine'));
    testCase.api.setAuth(null);
    const gate = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page); await waitForGate(gate.started.promise, 'gate');
    await waitForState(testCase, 'checking');
    await assertPrivateSurfaceLocked(testCase);
    gate.response.resolve(); await waitForState(testCase, 'signed-out');
    await testCase.page.locator('#view-stack:not([hidden])').waitFor({ state: 'visible' });
    assert.doesNotMatch(await testCase.page.locator('#main-content').innerText(), /Synthetic Account A (?:medicine|condition|allergy)/);
    reports.push({ case: 'expired-session-hides-all-my-health-records-while-revalidating', result: 'passed' });
    await finish(testCase, reports, 'expired-record-surface');
  }
  {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA, healthState: syntheticHealthState('Synthetic Account A') });
    await waitForState(testCase, 'signed-in'); await waitForHealthRecords(testCase, 'Synthetic Account A');
    await openStaleHealthEditor(testCase);
    const stale = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page); await waitForGate(stale.started.promise, 'stale');
    await waitForState(testCase, 'checking'); await assertPrivateSurfaceLocked(testCase);
    await tryStaleHealthSubmit(testCase);
    testCase.api.setAuth(accountB); testCase.api.setHealthState(syntheticHealthState('Synthetic Account B'));
    await simulateTabReturn(testCase.page); await waitForState(testCase, 'signed-in');
    await waitForHealthRecords(testCase, 'Synthetic Account B');
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /synthetic\.account-a@example\.invalid|Synthetic Account A/);
    await tryStaleHealthSubmit(testCase);
    stale.response.resolve(); await testCase.page.waitForTimeout(80);
    const metrics = await assertAccessibleStatus(testCase, 'signed-in', 'Signed in');
    assert.doesNotMatch(metrics.headerText, /synthetic\.account-a@example\.invalid|Synthetic Account A/);
    await testCase.page.locator('.mobile-notifications-button').click();
    await testCase.page.locator('#view-profile:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('#view-profile [data-open-profile]').click();
    await testCase.page.locator('#profile-drawer:not([hidden])').waitFor({ state: 'visible' });
    assert.match(await testCase.page.locator('.drawer-profile').innerText(), /Synthetic Account B/);
    assert.doesNotMatch(await testCase.page.locator('.drawer-profile').innerText(), /Synthetic Account A/);

    reports.push({ case: 'account-switch-and-late-prior-session-response', result: 'passed', visibleIdentity: 'synthetic account B only' });
    await finish(testCase, reports, 'account-switch-late-response');
  }
  for (const closedFirst of [false, true]) {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA, healthState: syntheticHealthState('Synthetic Account A') });
    await waitForState(testCase, 'signed-in'); await waitForHealthRecords(testCase, 'Synthetic Account A');
    await openSavedOverview(testCase);
    assert.match(await testCase.page.locator('#modal-body').innerText(), /Synthetic Account A profile/);
    assert.match(await testCase.page.locator('#modal-body').innerText(), /Synthetic Account A appointment/);
    if (closedFirst) {
      await testCase.page.keyboard.press('Escape');
      await testCase.page.waitForFunction(() => !document.querySelector('#quick-modal')?.open);
      assert.match(await testCase.page.locator('#modal-body').innerText(), /Synthetic Account A profile/);
    }
    testCase.api.setAuth(null);
    const gate = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page); await waitForGate(gate.started.promise, 'gate');
    await waitForState(testCase, 'checking'); await assertPrivateSurfaceLocked(testCase);
    const overview = testCase.page.locator('#view-profile [data-open-personal-overview]');
    assert.equal(await overview.evaluate(button => button.closest('#view-stack').inert), true, 'overview is in the inert private surface');
    await overview.evaluate(button => { button.disabled = false; button.click(); });
    assert.equal(await testCase.page.locator('#quick-modal').evaluate(element => element.open), false, 'overview handler refuses account reads during revalidation');
    gate.response.resolve(); await waitForState(testCase, 'signed-out');
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /Synthetic Account A/);
    reports.push({ case: closedFirst ? 'closed-overview-cleared-before-revalidation' : 'open-overview-closed-and-cleared-before-revalidation', result: 'passed' });
    await finish(testCase, reports, closedFirst ? 'closed-overview-gate' : 'expired-overview-gate');
  }
  {
    const testCase = await createCase(browser, base, { width: 390 });
    await waitForState(testCase, 'signed-out');
    testCase.api.failNextAuth();
    await simulateTabReturn(testCase.page);
    await waitForState(testCase, 'unavailable');
    const metrics = await assertAccessibleStatus(testCase, 'unavailable', 'Status unavailable');
    assert.match(metrics.liveText, /not confirmed/i);
    await testCase.page.locator(activeStatusSelector(testCase.width)).click();
    await testCase.page.locator('#google-signin-modal[open]').waitFor({ state: 'visible' });
    reports.push({ case: 'auth-endpoint-failure-does-not-claim-signed-out-and-can-retry', result: 'passed' });
    await finish(testCase, reports, 'unavailable-retry');
  }
  {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA, healthState: syntheticHealthState('Synthetic Account A') });
    await waitForState(testCase, 'signed-in');
    await testCase.page.locator('#view-health:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('.mobile-bottom-nav-item[data-view="medications"]').click();
    await testCase.page.waitForFunction(() => document.querySelector('#medication-library')?.textContent.includes('Synthetic Account A medicine'));
    testCase.api.failNextAuth();
    await simulateTabReturn(testCase.page);
    await waitForState(testCase, 'unavailable');
    await testCase.page.locator('#session-verification-gate').waitFor({ state: 'visible' });
    assert.match(await testCase.page.locator('#session-verification-title').innerText(), /sign-in not confirmed/i);
    assert.equal(await testCase.page.locator('#session-verification-gate').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(220, 238, 250)', 'The unavailable-session gate uses the Hub blue surface.');
    assert.equal(await testCase.page.locator('#view-stack').isHidden(), true);
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /Synthetic Account A (?:medicine|condition|allergy)/);
    const retry = testCase.page.locator('#session-verification-gate [data-today-retry]');
    await retry.waitFor({ state: 'visible' });
    assert.ok(await retry.evaluate(element => element.getBoundingClientRect().height >= 44));
    await retry.click();
    await waitForState(testCase, 'signed-in');
    await testCase.page.locator('#view-stack:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.waitForFunction(() => document.querySelector('#medication-library')?.textContent.includes('Synthetic Account A medicine'));
    assert.equal(await testCase.page.locator('#session-verification-gate').isHidden(), true);
    reports.push({ case: 'unavailable-session-keeps-records-hidden-until-explicit-retry-succeeds', result: 'passed' });
    await finish(testCase, reports, 'unavailable-session-record-retry');
  }
  {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA, entitlementActive: true, cameraStub: true });
    await waitForState(testCase, 'signed-in');
    await testCase.page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    await testCase.page.locator('#view-health:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('.mobile-bottom-nav-item[data-view="medications"]').click();
    await testCase.page.locator('#view-medications:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('#view-medications .medication-scan-options > summary').click();
    await testCase.page.locator('#view-medications [data-open-medication-scanner]').first().click();
    await testCase.page.locator('#medication-scanner-modal[open]').waitFor({ state: 'visible' });
    await testCase.page.waitForFunction(() => document.querySelector('#medication-scanner-status')?.textContent.includes('Camera ready'));
    assert.equal(await testCase.page.evaluate(() => window.__syntheticCameraTrack.readyState), 'live');

    testCase.api.setAuth(null);
    const gate = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page);
    await waitForGate(gate.started.promise, 'gate');
    await waitForState(testCase, 'checking');
    assert.equal(await testCase.page.evaluate(() => document.activeElement === document.querySelector('#session-verification-title')), true, 'focus moves to the session gate after the scanner closes');
    assert.equal(await testCase.page.locator('#medication-scanner-modal').evaluate(element => element.open), false, 'session revalidation closes the camera dialog immediately');
    assert.equal(await testCase.page.evaluate(() => window.__syntheticCameraTrack.readyState), 'ended', 'session revalidation stops the active camera stream');
    assert.ok(await testCase.page.evaluate(() => window.__syntheticCameraTrack.stopCount >= 1));
    gate.response.resolve();
    await waitForState(testCase, 'signed-out');
    reports.push({ case: 'expired-session-tab-return-stops-live-camera-and-closes-scanner', result: 'passed', camera: 'synthetic MediaStreamTrack; no device camera used' });
    await finish(testCase, reports, 'expired-session-scanner-cleanup');
  }
  {
    const testCase = await createCase(browser, base, { width: 1440, auth: accountA, entitlementActive: true, cameraStub: true });
    await waitForState(testCase, 'signed-in');
    await testCase.page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    await testCase.page.locator('#view-health:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('.primary-nav .nav-item[data-view="medications"]').click();
    await testCase.page.locator('#view-medications:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('#view-medications .medication-scan-options > summary').click();
    await testCase.page.locator('#view-medications [data-open-medication-scanner]').first().click();
    await testCase.page.locator('#medication-scanner-modal[open]').waitFor({ state: 'visible' });
    await testCase.page.waitForFunction(() => document.querySelector('#medication-scanner-status')?.textContent.includes('Camera ready'));
    const logout = testCase.api.delayNextLogout();
    await testCase.page.evaluate(() => document.querySelector('.profile-trigger[data-auth-status-control]').click());
    await testCase.page.locator('#profile-drawer:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.evaluate(() => document.querySelector('.drawer-signout[data-google-signout]').click());
    await waitForGate(logout.started.promise, 'logout');
    await waitForState(testCase, 'checking');
    assert.equal(await testCase.page.locator('#medication-scanner-modal').evaluate(element => element.open), false, 'pending logout closes the camera dialog immediately');
    assert.equal(await testCase.page.evaluate(() => window.__syntheticCameraTrack.readyState), 'ended', 'pending logout stops the active camera stream');
    logout.response.resolve();
    await waitForState(testCase, 'signed-out');
    reports.push({ case: 'delayed-logout-stops-live-camera-before-server-response', result: 'passed', camera: 'synthetic MediaStreamTrack; no device camera used' });
    await finish(testCase, reports, 'logout-scanner-cleanup');
  }
  {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA, entitlementActive: true, cameraStub: true });
    await waitForState(testCase, 'signed-in');
    await testCase.page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    await testCase.page.locator('#view-health:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('.mobile-bottom-nav-item[data-view="medications"]').click();
    await testCase.page.locator('#view-medications:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('#view-medications .medication-scan-options > summary').click();
    await testCase.page.locator('#view-medications [data-open-medication-scanner]').first().click();
    await testCase.page.locator('#medication-scanner-modal[open]').waitFor({ state: 'visible' });
    await testCase.page.waitForFunction(() => document.querySelector('#medication-scanner-status')?.textContent.includes('Camera ready'));
    const scanGate = testCase.api.delayNextMedicationScan();
    const scanFailed = testCase.page.waitForEvent('requestfailed', request => request.url().includes('/api/medication/scan'));
    await testCase.page.locator('[data-medication-image-consent]').check();
    await testCase.page.locator('[data-medication-capture]').click();
    await waitForGate(scanGate.started.promise, 'scanGate');

    testCase.api.setAuth(null);
    const authGate = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page);
    await waitForGate(authGate.started.promise, 'authGate');
    await waitForState(testCase, 'checking');
    const failedRequest = await scanFailed;
    assert.match(failedRequest.failure()?.errorText || '', /aborted|cancelled/i, 'the pending label extraction request is cancelled during session revalidation');
    scanGate.response.resolve();
    authGate.response.resolve();
    await waitForState(testCase, 'signed-out');
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /Details copied|Scan not completed/);
    reports.push({ case: 'pending-consented-label-request-cancelled-on-session-expiry', result: 'passed', image: 'synthetic canvas bytes; local mocked endpoint only' });
    await finish(testCase, reports, 'expired-session-scan-request');
  }
  {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA, entitlementActive: true, cameraStub: true, cameraStubDelay: true });
    await waitForState(testCase, 'signed-in');
    await testCase.page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    await testCase.page.locator('#view-health:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('.mobile-bottom-nav-item[data-view="medications"]').click();
    await testCase.page.locator('#view-medications:not([hidden])').waitFor({ state: 'visible' });
    await testCase.page.locator('#view-medications .medication-scan-options > summary').click();
    await testCase.page.locator('#view-medications [data-open-medication-scanner]').first().click();
    await testCase.page.locator('#medication-scanner-modal[open]').waitFor({ state: 'visible' });
    await testCase.page.waitForFunction(() => document.querySelector('#medication-scanner-status')?.textContent.includes('Checking camera access'));

    testCase.api.setAuth(null);
    const authGate = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page);
    await waitForGate(authGate.started.promise, 'authGate');
    await waitForState(testCase, 'checking');
    assert.equal(await testCase.page.locator('#medication-scanner-modal').evaluate(element => element.open), false, 'revalidation closes the dialog while camera permission is pending');
    await testCase.page.evaluate(() => window.__releaseSyntheticCamera());
    await testCase.page.waitForFunction(() => window.__syntheticCameraTrack.readyState === 'ended');
    authGate.response.resolve();
    await waitForState(testCase, 'signed-out');
    assert.equal(await testCase.page.locator('#medication-scanner-modal').evaluate(element => element.open), false);
    reports.push({ case: 'late-camera-permission-result-stopped-after-session-expiry', result: 'passed', camera: 'delayed synthetic MediaStream only' });
    await finish(testCase, reports, 'expired-session-pending-camera-start');
  }
  return reports;
}

async function run() {
  const audit = process.argv.includes('--audit') ? process.argv[process.argv.indexOf('--audit') + 1] : 'all';
  assert.ok(['all', 'functional', 'visual', 'adverse'].includes(audit), `unknown audit ${audit}`);
  const { server, base } = await startServer();
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const reports = [];
  try {
    if (audit === 'all' || audit === 'functional') reports.push(...await runFunctional(browser, base));
    if (audit === 'all' || audit === 'visual') reports.push(...await runVisual(browser, base));
    if (audit === 'all' || audit === 'adverse') reports.push(...await runAdverse(browser, base));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(JSON.stringify({ result: 'passed', audit, browser: 'Chromium', mockedAuth: true, realProductionAuthentication: false, reports }, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
