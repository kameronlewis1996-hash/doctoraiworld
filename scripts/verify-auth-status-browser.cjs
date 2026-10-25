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
  let failNextAuth = false;
  let nextAuthGate = null;
  let nextLoginGate = null;
  let nextLogoutGate = null;
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ status: 200, json: {} }));
  await page.route('**/api/auth/config', route => route.fulfill({ status: 200, json: { googleClientId: 'synthetic-client-id' } }));
  await page.route('**/api/stripe/entitlement', route => route.fulfill({ status: 200, json: { active: false, expiresAt: null } }));
  await page.route('**/api/health/state', route => route.fulfill({ status: 200, json: { state: null, updatedAt: 0 } }));
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
      auth = signedInUser;
      await route.fulfill({ status: 200, json: { authenticated: true, user: auth, medicationLoginId: '' } });
      return;
    }
    await route.fulfill({ status: 405, json: { error: 'method-not-allowed' } });
  });

  await page.addInitScript(() => {
    localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
    window.google = { accounts: { id: {
      initialize(options) { window.__syntheticGoogleCallback = options.callback; },
      renderButton(host) { host.dataset.syntheticGoogleReady = 'true'; }
    } } };
  });
  return {
    setAuth(value) { auth = value; },
    failNextAuth() { failNextAuth = true; },
    delayNextAuth() { nextAuthGate = { started: deferred(), response: deferred() }; return nextAuthGate; },
    delayNextLogin() { nextLoginGate = { started: deferred(), response: deferred() }; return nextLoginGate; },
    delayNextLogout() { nextLogoutGate = { started: deferred(), response: deferred() }; return nextLogoutGate; }
  };
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
  await page.goto(`${base}/health-hub.html#today`, { waitUntil: 'domcontentloaded' });
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
  await firstOpen.initialAuthGate.started.promise;
  await waitForState(firstOpen, 'checking');
  let metrics = await assertAccessibleStatus(firstOpen, 'checking', 'Checking sign-in');
  assert.equal(metrics.disabled, true);
  assert.match(metrics.liveText, /checking sign-in status/i);
  firstOpen.initialAuthGate.response.resolve();
  await waitForState(firstOpen, 'signed-out');
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
  await login.started.promise;
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
  await logout.started.promise;
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
  const checking = await createCase(browser, base, { width: 390 });
  await waitForState(checking, 'signed-out');
  const gate = checking.api.delayNextAuth();
  await simulateTabReturn(checking.page);
  await gate.started.promise;
  await waitForState(checking, 'checking');
  const pendingMetrics = await assertAccessibleStatus(checking, 'checking', 'Checking sign-in');
  await checking.page.screenshot({ path: path.join(auditDir, 'final-checking-mobile.png'), fullPage: false });
  gate.response.resolve();
  await waitForState(checking, 'signed-out');
  await finish(checking, reports, 'visual-checking-mobile');

  const unavailable = await createCase(browser, base, { width: 390 });
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
    const testCase = await createCase(browser, base, { width: 1440, auth: accountA });
    await waitForState(testCase, 'signed-in');
    testCase.api.setAuth(null);
    const gate = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page);
    await gate.started.promise;
    await waitForState(testCase, 'checking');
    const hiddenIdentity = await testCase.page.evaluate(() => ({
      header: document.querySelector('.hub-topbar').innerText,
      drawer: document.querySelector('.drawer-profile').innerText,
      profileName: document.querySelector('#profile-page-name').textContent,
      greeting: document.querySelector('#today-greeting').textContent
    }));
    assert.doesNotMatch(JSON.stringify(hiddenIdentity), /synthetic\.account-a@example\.invalid|Synthetic Account A/);
    gate.response.resolve();
    await waitForState(testCase, 'signed-out');
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /synthetic\.account-a@example\.invalid|Synthetic Account A/);
    reports.push({ case: 'expired-session-tab-return-hides-stale-identity', result: 'passed', duringCheck: hiddenIdentity });
    await finish(testCase, reports, 'expired-session');
  }
  {
    const testCase = await createCase(browser, base, { width: 390, auth: accountA });
    await waitForState(testCase, 'signed-in');
    const stale = testCase.api.delayNextAuth();
    await simulateTabReturn(testCase.page);
    await stale.started.promise;
    await waitForState(testCase, 'checking');
    testCase.api.setAuth(accountB);
    await simulateTabReturn(testCase.page);
    await waitForState(testCase, 'signed-in');
    assert.doesNotMatch(await testCase.page.locator('body').innerText(), /synthetic\.account-a@example\.invalid|Synthetic Account A/);
    stale.response.resolve();
    await testCase.page.waitForTimeout(80);
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
