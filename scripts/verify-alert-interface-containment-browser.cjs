'use strict';
// Synthetic visual regression for alert presentation. All health records and
// API responses are fictional and local; external requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = process.env.ALERT_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-alert-interface-after');
fs.mkdirSync(out, { recursive: true });
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const cases = [
  { name: 'none', local: {}, expectedLevel: 'neutral', expectedCard: null },
  { name: 'info', local: { 'guest-medications': [{ id: 'synthetic-info', name: 'Fictional unmatched medicine' }] }, expectedLevel: 'orange', expectedCard: 'info' },
  { name: 'warning', local: { 'guest-medications': [{ id: 'synthetic-warfarin', name: 'Marevan' }, { id: 'synthetic-trisul', name: 'Trisul' }] }, expectedLevel: 'red', expectedCard: 'high' },
  { name: 'urgent', local: { 'guest-timeline': [{ id: 'synthetic-urgent', type: 'symptom', source: 'symptom-diary', title: 'Severe difficulty breathing', date: new Date().toISOString().slice(0, 10) }] }, expectedLevel: 'red', expectedCard: 'urgent' }
];

function startServer() {
  const server = http.createServer((request, response) => {
    let route;
    try { route = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    if (route === '/') route = '/health-hub.html';
    if (!path.extname(route)) route += '.html';
    const file = path.resolve(root, `.${route}`);
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'content-type': types[path.extname(file)], 'cache-control': 'no-store' });
    response.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

async function createCase(browser, base, fixture, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 960 : 844 }, timezoneId: 'UTC', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort());
  await context.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth/google') return route.fulfill({ status: 200, json: { authenticated: false } });
    if (pathname === '/api/stripe/entitlement') return route.fulfill({ status: 200, json: { active: false, expiresAt: null } });
    if (pathname === '/api/health/state' && route.request().method() === 'PUT') return route.fulfill({ status: 200, json: { updatedAt: Date.now() } });
    return route.fulfill({ status: 200, json: { state: null, updatedAt: 0, authenticated: false } });
  });
  await context.addInitScript(local => {
    localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes');
    for (const [key, value] of Object.entries(local)) localStorage.setItem(`doctorai-health-hub-${key}`, JSON.stringify(value));
    window.google = { accounts: { id: { initialize() {}, renderButton() {} } } };
  }, fixture.local);
  await page.goto(`${base}/health-hub.html#profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const count = document.querySelector('#alerts-count')?.textContent.trim();
    return count && count !== 'Checking sign-in' && count !== 'No current result' && count !== 'Sign-in not confirmed';
  });
  const cards = page.locator('#alerts-list .hub-alert-card');
  await page.waitForFunction(() => document.querySelector('#alerts-count')?.textContent.trim() !== 'No current result');
  if (fixture.expectedCard) await page.locator(`#alerts-list .hub-alert-card[data-severity="${fixture.expectedCard}"]`).first().waitFor({ state: 'attached' });
  else await page.waitForFunction(() => document.querySelector('#alerts-list .hub-alert-card') === null);
  const level = await page.locator('#view-medications [data-alert-summary]').getAttribute('data-alert-level');
  assert.equal(level, fixture.expectedLevel, `${fixture.name} status level from the current alert engine`);
  assert.equal(await page.locator('body').getAttribute('data-health-alert-level'), null, 'alert severity is not stored on the global page');
  const actualSeverities = await cards.evaluateAll(elements => elements.map(element => element.dataset.severity));
  if (fixture.expectedCard) assert.ok(actualSeverities.includes(fixture.expectedCard), `${fixture.name} card severity is rendered`);
  else assert.deepEqual(actualSeverities, [], 'none state keeps an empty alert list');
  return { context, page, errors, actualSeverities };
}

async function pageSnapshot(page) {
  return page.evaluate(() => {
    const style = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const css = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        backgroundColor: css.backgroundColor,
        backgroundImage: css.backgroundImage,
        borderTopWidth: css.borderTopWidth,
        borderTopColor: css.borderTopColor,
        borderRightColor: css.borderRightColor,
        borderLeftWidth: css.borderLeftWidth,
        borderLeftColor: css.borderLeftColor,
        borderBottomColor: css.borderBottomColor,
        boxShadow: css.boxShadow,
        display: css.display,
        x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height)
      };
    };
    return {
      level: document.querySelector('#view-medications [data-alert-summary]')?.dataset.alertLevel || null,
      body: style('body'),
      main: style('#hub-shell .hub-main'),
      sidebar: style('#hub-shell .sidebar'),
      today: style('#view-today'),
      todayHeading: style('#view-today > .page-heading'),
      topbar: style('#hub-shell .hub-topbar'),
      mobileNav: style('.mobile-bottom-nav'),
      alertHeading: style('#view-alerts > .page-heading'),
      globalBannerCount: document.querySelectorAll('.hub-severity-banner').length,
      alertsNavLabel: document.querySelector('[data-view="alerts"]')?.getAttribute('aria-label') || null,
      todayNavLabel: document.querySelector('.primary-nav [data-view="today"]')?.getAttribute('aria-label') || null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });
}

(async () => {
  const { server, base } = await startServer();
  const executablePath = process.env.CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath, args: ['--no-sandbox'] } : {}) });
  const report = { mode: 'Synthetic guest records only; API requests mocked; external requests blocked.', cases: [], screenshots: [], errors: [] };
  try {
    for (const width of [1440, 390, 320]) {
      for (const fixture of cases) {
        const testCase = await createCase(browser, base, fixture, width);
        const { page } = testCase;
        const beforeProfile = await pageSnapshot(page);
        assert.ok(beforeProfile.documentWidth <= width, `${fixture.name} profile has no horizontal overflow at ${width}px`);
        assert.equal(beforeProfile.level, fixture.expectedLevel, `${fixture.name} summary remains accurate`);
        assert.equal(beforeProfile.globalBannerCount, 0, 'no severity banner is added to the global shell');
        assert.equal(beforeProfile.body.backgroundColor, 'rgb(245, 248, 255)', 'the light blue page background is stable');
        const reference = report.cases.find(item => item.width === width && item.name === 'none')?.profile;
        if (reference) {
          const signature = snapshot => ({ body: snapshot.body, main: snapshot.main, sidebar: snapshot.sidebar, todayHeading: snapshot.todayHeading, topbar: snapshot.topbar, mobileNav: snapshot.mobileNav, documentWidth: snapshot.documentWidth, viewportWidth: snapshot.viewportWidth });
          assert.deepEqual(signature(beforeProfile), signature(reference), `${fixture.name} must not recolor or move the global shell at ${width}px`);
        }
        if (width === 390 || fixture.name === 'urgent') {
          const screenshot = path.join(out, `after-${fixture.name}-profile-${width}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
          report.screenshots.push(screenshot);
        }
        await page.goto(`${base}/health-hub.html#alerts`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#view-alerts')?.hidden === false);
        const beforeAlerts = await pageSnapshot(page);
        assert.ok(beforeAlerts.documentWidth <= width, `${fixture.name} Alerts has no horizontal overflow at ${width}px`);
        assert.equal(beforeAlerts.globalBannerCount, 0, 'severity does not add a shell-level element');
        const alertsReference = report.cases.find(item => item.width === width && item.name === 'none')?.alerts;
        if (alertsReference) assert.deepEqual(beforeAlerts.alertHeading, alertsReference.alertHeading, 'alert status does not recolor or move the Alerts heading');
        if (width === 390) {
          const screenshot = path.join(out, `after-${fixture.name}-alerts-${width}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
          report.screenshots.push(screenshot);
        }
        const statusRegion = page.locator('#alerts-status');
        assert.equal(await statusRegion.getAttribute('role'), 'status');
        assert.equal(await statusRegion.getAttribute('aria-live'), 'polite');
        assert.equal(await page.locator('#alerts-list .hub-alert-card[aria-live], #alerts-list .hub-alert-card[role="alert"]').count(), 0, 'cards are not individually live, avoiding announcement floods');
        if (fixture.name === 'urgent') assert.match(await statusRegion.textContent(), /1 urgent notice is listed below/);
        if (fixture.name === 'warning') assert.match(await statusRegion.textContent(), /1 high-priority notice is listed below/);
        if (fixture.expectedCard) {
          const card = page.locator(`#alerts-list .hub-alert-card[data-severity="${fixture.expectedCard}"]`).first();
          assert.equal(await card.isVisible(), true, `${fixture.name} warning remains visible in its detail card`);
          if (fixture.name === 'urgent') {
            assert.match(await card.textContent(), /Urgent concern in a recent entry/);
            assert.match(await card.textContent(), /Severe difficulty breathing/);
          }
          const trigger = card.locator('.hub-alert-triggers summary');
          await trigger.focus();
          await page.keyboard.press('Enter');
          assert.equal(await card.locator('.hub-alert-triggers').getAttribute('open') !== null, true, 'alert evidence is keyboard reachable');
        }
        await page.goto(`${base}/health-hub.html#profile`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#view-profile')?.hidden === false);
        const menu = width <= 800 ? page.locator('[data-mobile-menu]') : null;
        if (menu) {
          await menu.focus();
          await page.keyboard.press('Enter');
          await page.locator('#category-bar [data-view="alerts"]').focus();
          await page.keyboard.press('Enter');
        } else {
          await page.locator('.hub-utility-nav [data-view="alerts"]').focus();
          await page.keyboard.press('Enter');
        }
        try {
          await page.waitForFunction(() => document.querySelector('#view-alerts')?.hidden === false, null, { timeout: 7000 });
        } catch (error) {
          const routeState = await page.evaluate(() => ({ hash: location.hash, alertHidden: document.querySelector('#view-alerts')?.hidden, mobileMenuExpanded: document.querySelector('[data-mobile-menu]')?.getAttribute('aria-expanded'), categoryMenuOpen: document.body.classList.contains('mobile-category-open'), currentViews: [...document.querySelectorAll('[data-view][aria-current="page"]')].map(element => element.dataset.view) }));
          throw new Error(`Keyboard Alerts route failed for ${fixture.name} at ${width}px: ${JSON.stringify(routeState)}; ${error.message}`);
        }
        assert.equal(await page.locator('#alerts-title').evaluate(element => element === document.activeElement), true, 'keyboard navigation lands on the Alerts heading');
        const todayNavLabel = await page.locator(width <= 800 ? '.mobile-bottom-nav [data-view="today"]' : '.primary-nav [data-view="today"]').getAttribute('aria-label');
        if (fixture.name === 'urgent') assert.match(todayNavLabel, /Urgent medical help/);
        if (fixture.name === 'none') assert.equal(todayNavLabel, 'Today');
        const palette = await page.evaluate(() => {
          const view = document.querySelector('#view-alerts');
          const probe = document.createElement('div');
          probe.setAttribute('aria-hidden', 'true');
          probe.style.cssText = 'position:absolute;left:-10000px;top:0;width:360px;pointer-events:none;';
          const result = {};
          const cards = {};
          for (const severity of ['info', 'low', 'moderate', 'high', 'urgent']) {
            const card = document.createElement('article');
            card.className = 'hub-alert-card';
            card.dataset.severity = severity;
            const icon = document.createElement('span');
            icon.className = 'hub-alert-icon';
            const kicker = document.createElement('p');
            kicker.className = 'card-kicker';
            card.append(icon, kicker);
            probe.append(card);
            cards[severity] = card;
          }
          view.append(probe);
          for (const [severity, card] of Object.entries(cards)) {
            const icon = card.querySelector('.hub-alert-icon');
            const kicker = card.querySelector('.card-kicker');
            result[severity] = { border: getComputedStyle(card).borderLeftColor, icon: getComputedStyle(icon).color, iconSurface: getComputedStyle(icon).backgroundColor, kicker: getComputedStyle(kicker).color, background: getComputedStyle(card).backgroundImage };
          }
          probe.remove();
          return result;
        });
        assert.deepEqual(palette.info, palette.low, 'informational and low severity share the blue card palette');
        assert.deepEqual(palette.high, palette.urgent, 'high and urgent cards remain in the red family');
        assert.notDeepEqual(palette.info, palette.moderate, 'moderate cards use their own amber palette');
        assert.notDeepEqual(palette.moderate, palette.high, 'higher severity remains visually distinct');
        assert.equal(palette.info.border, 'rgb(7, 89, 182)');
        assert.equal(palette.moderate.border, 'rgb(147, 68, 7)');
        assert.equal(palette.urgent.border, 'rgb(180, 35, 24)');
        assert.ok(palette.urgent.background.includes('linear-gradient'));
        const pageErrors = testCase.errors.map(error => `${fixture.name}/${width}: ${error}`);
        report.errors.push(...pageErrors);
        report.cases.push({ name: fixture.name, width, status: beforeAlerts.level, cardSeverities: testCase.actualSeverities, profile: beforeProfile, alerts: beforeAlerts, palette, screenReaderSummary: await statusRegion.textContent(), keyboardRoutePassed: true });
        await testCase.context.close();
      }
    }
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'containment.json'), JSON.stringify(report, null, 2));
    console.log(`Captured ${report.cases.length} synthetic alert-state viewport cases. Evidence: ${out}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
