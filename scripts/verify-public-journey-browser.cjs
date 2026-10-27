'use strict';

// Local public-page regression review. Stripe prices are fictional fixtures;
// checkout creation, sign-in, health data and production APIs are not used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = process.env.PUBLIC_JOURNEY_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-public-journey');
fs.mkdirSync(out, { recursive: true });
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const types = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};
const plans = {
  weekly: { available: true, amount: 699, currency: 'NZD', interval: 'week' },
  monthly: { available: true, amount: 2900, currency: 'NZD', interval: 'month' },
  annual: { available: true, amount: 7900, currency: 'USD', interval: 'year' }
};
const requests = [];
const errors = [];
const executablePath = process.env.CHROMIUM_EXECUTABLE
  || ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(candidate => fs.existsSync(candidate));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let route = url.pathname;
  if (route === '/api/stripe/plans') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ plans }));
  }
  if (route.startsWith('/api/')) {
    res.writeHead(503, { 'content-type': 'application/json' });
    return res.end('{"error":"Local regression review only","allowed":false,"authenticated":false}');
  }
  const redirect = config.redirects.find(item => item.source === route);
  if (redirect) {
    res.writeHead(308, { location: redirect.destination });
    return res.end();
  }
  if (route === '/') route = '/index.html';
  if (!path.extname(route)) route += '.html';
  const file = path.resolve(root, `.${route}`);
  if (!file.startsWith(`${root}${path.sep}`) || !types[path.extname(file)] || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const securityHeaders = config.headers.find(item => item.source === '/(.*)')?.headers || [];
  for (const header of securityHeaders) {
    res.setHeader(header.key, header.value.replace('; upgrade-insecure-requests', ''));
  }
  res.setHeader('content-type', types[path.extname(file)]);
  res.end(fs.readFileSync(file));
});

function assertNoOverflow(page, label) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    .then(ok => assert.equal(ok, true, `${label}: no horizontal overflow`));
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath
      ? { executablePath, args: ['--no-sandbox'] }
      : {})
  });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('https://**/*', route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));

    // The homepage should surface its value and first useful actions at the
    // short desktop size where the oversized artwork previously displaced them.
    await page.setViewportSize({ width: 1280, height: 551 });
    await page.goto(base, { waitUntil: 'networkidle' });
    const heroBounds = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        const bounds = element.getBoundingClientRect();
        return { top: Math.round(bounds.top), bottom: Math.round(bounds.bottom), height: Math.round(bounds.height) };
      };
      return {
        headerCta: rect('.home-nav .home-button'),
        heading: rect('.home-hero-copy h1'),
        explanation: rect('.home-hero-copy .home-lead'),
        add: rect('.home-add-detail'),
        scan: rect('.home-scan-link')
      };
    });
    for (const [name, bounds] of Object.entries(heroBounds)) {
      assert.ok(bounds.bottom <= 551, `Homepage ${name} must fit in the first 551px; got ${JSON.stringify(bounds)}`);
    }
    await assertNoOverflow(page, 'Homepage at 1280×551');
    await page.screenshot({ path: path.join(out, 'homepage-1280x551.png') });

    // About retains Home and Sign in in a keyboard-operable menu at phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/about`, { waitUntil: 'networkidle' });
    const menu = page.locator('[data-home-menu]');
    const summary = menu.locator('summary');
    assert.equal(await menu.isVisible(), true, 'About mobile menu is visible at 390px.');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await menu.evaluate(element => element.open), true, 'Keyboard activation opens the native menu.');
    for (const label of ['Home', 'Open Health Hub', 'Free and Pro', 'Sign in']) {
      assert.equal(await menu.getByRole('link', { name: label, exact: true }).isVisible(), true, `About mobile menu exposes ${label}.`);
    }
    await page.screenshot({ path: path.join(out, 'about-mobile-menu-390x844.png') });
    await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(element => element.open), false, 'Escape closes the public mobile menu.');
    assert.equal(await summary.evaluate(element => element === document.activeElement), true, 'Escape restores focus to the menu control.');
    await assertNoOverflow(page, 'About at 390×844');
    await page.setViewportSize({ width: 320, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await menu.evaluate(element => element.open), true, 'About mobile menu remains keyboard-operable at 320px.');
    const narrowMenuBounds = await menu.locator('nav').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return { left: Math.round(bounds.left), right: Math.round(bounds.right) };
    });
    assert.ok(narrowMenuBounds.left >= 0 && narrowMenuBounds.right <= 320,
      `About mobile menu stays within a 320px viewport: ${JSON.stringify(narrowMenuBounds)}`);
    await assertNoOverflow(page, 'About at 320×844');

    // The optional code field starts collapsed so review details and Continue
    // fit together. The static Stripe response is synthetic; Continue is never
    // enabled or activated and no Checkout Session is created.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/subscription`, { waitUntil: 'networkidle' });
    await page.locator('[data-subscribe]:not([disabled])').waitFor();
    await page.locator('[data-subscribe]').click();
    const dialog = page.locator('#checkout-dialog');
    await dialog.waitFor({ state: 'visible' });
    const codeDisclosure = dialog.locator('.checkout-code-box');
    assert.equal(await codeDisclosure.evaluate(element => element.open), false, 'Complimentary code is collapsed by default.');
    for (const selector of ['#selected-plan-price', '#checkout-renewal-note', '#checkout-terms-confirm', '[data-confirm-checkout]']) {
      assert.equal(await dialog.locator(selector).isVisible(), true, `${selector} remains visible in the initial review.`);
    }
    assert.equal(await dialog.locator('[data-confirm-checkout]').isDisabled(), true, 'Terms confirmation still gates checkout.');
    const reviewBounds = await dialog.evaluate(element => {
      const d = element.getBoundingClientRect();
      const b = element.querySelector('[data-confirm-checkout]').getBoundingClientRect();
      return { dialogTop: Math.round(d.top), dialogBottom: Math.round(d.bottom), continueTop: Math.round(b.top), continueBottom: Math.round(b.bottom), scrollTop: element.scrollTop };
    });
    assert.ok(reviewBounds.continueTop >= reviewBounds.dialogTop && reviewBounds.continueBottom <= reviewBounds.dialogBottom,
      `Continue fits inside the review dialog without scrolling: ${JSON.stringify(reviewBounds)}`);
    assert.equal(reviewBounds.scrollTop, 0, 'The dialog begins at its top.');
    await page.screenshot({ path: path.join(out, 'subscription-review-390x844.png') });

    const codeSummary = codeDisclosure.locator('summary');
    await codeSummary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await codeDisclosure.evaluate(element => element.open), true, 'The optional code disclosure opens from the keyboard.');
    assert.equal(await dialog.locator('#checkout-access-code').isVisible(), true, 'The access-code field remains available when requested.');
    await page.keyboard.press('Enter');
    assert.equal(await codeDisclosure.evaluate(element => element.open), false, 'The optional code disclosure can be collapsed again.');
    assert.equal(requests.some(url => url.includes('/api/stripe/create-checkout-session')), false, 'No Checkout Session was created.');
    assert.deepEqual(errors, [], 'No public-page JavaScript errors occurred.');

    console.log(JSON.stringify({ result: 'passed', homepage: heroBounds, checkout: reviewBounds, screenshots: out, checkoutSessionRequests: 0 }));
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
