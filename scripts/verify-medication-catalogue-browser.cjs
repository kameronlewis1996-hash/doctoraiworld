'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// A local fixture server and a fresh browser profile; no account or hosted data.
const root = path.resolve(__dirname, '..');
const width = Number(process.env.VIEWPORT_WIDTH || 390);
const output = path.join(os.tmpdir(), 'doctorai-ingredient-autofill-smoke-' + width);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const report = { checks: [], pageErrors: [], screenshots: [] };

function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let route;
    try { route = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    if (route === '/') route = '/index.html';
    if (!path.extname(route)) route += '.html';
    const file = path.resolve(root, '.' + route);
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-medications') || '[]'));
}

async function snapshot(page, filename) {
  await page.screenshot({ path: path.join(output, filename), fullPage: false });
  report.screenshots.push(path.join(output, filename));
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = serve();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('doctorai-health-hub-device-storage-consent', 'yes'));
    await context.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/google') return route.fulfill({ json: { authenticated: false } });
      if (url.pathname === '/api/health/state') return route.fulfill({ json: { state: {}, updatedAt: Date.now() } });
      return route.fulfill({ json: { active: false, authenticated: false } });
    });
    await context.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/health-hub#today`, { waitUntil: 'networkidle' });
    await page.locator('#view-today [aria-label="Add medicine"]').click();
    const form = page.locator('[data-modal-form="medication"]');
    const name = form.locator('[name="name"]');
    const dose = form.locator('[name="dose"]');
    const ingredient = form.locator('[name="activeIngredients"]');
    await name.fill('Abacavir/Lamivudine Viatris');
    await form.locator('.medication-catalogue-choice').first().waitFor({ state: 'visible' });
    assert.equal(await form.evaluate(el => el.catalogueSelection), null, 'typing search terms never selects an exact product');
    assert.equal(await ingredient.inputValue(), '', 'typing does not infer ingredients');
    report.checks.push('Partial text does not bind a product or fill ingredients');

    const choice = form.locator('.medication-catalogue-choice').filter({ hasText: 'Abacavir/Lamivudine Viatris' }).first();
    await choice.focus();
    await page.keyboard.press('Enter');
    assert.equal(await form.evaluate(el => el.catalogueSelection?.productId), 'pharmac-7e19f47e7eefe045');
    assert.deepEqual((await ingredient.inputValue()).split(/;\s*/).filter(Boolean), ['Abacavir sulphate', 'Lamivudine']);
    assert.equal(await ingredient.getAttribute('data-catalogue-derived'), 'true');
    assert.equal(await dose.evaluate(el => el === document.activeElement), true, 'keyboard selection moves to dose');
    assert.match(await form.locator('.medication-catalogue-selected').textContent(), /not checked against your label/i);
    assert.equal(await form.locator('[name="ingredientsConfirmed"]').isChecked(), false);
    await dose.fill('600 mg / 300 mg');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, width + 'px page has no horizontal overflow');
    assert.equal(await form.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, width + 'px form has no horizontal overflow');
    await snapshot(page, 'selected-overview-' + width + '.png');
    await ingredient.scrollIntoViewIfNeeded();
    await snapshot(page, 'selected-combination-' + width + '.png');
    report.checks.push('Keyboard-selected combination fills both ingredients and source ID without implying label confirmation; mobile layout fits');

    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    let records = await saved(page);
    assert.equal(records.length, 1);
    assert.equal(records[0].catalogueMatch.productId, 'pharmac-7e19f47e7eefe045');
    assert.deepEqual(records[0].catalogueMatch.ingredients.map(item => item.name), ['Abacavir sulphate', 'Lamivudine']);
    assert.deepEqual(records[0].activeIngredients, []);
    assert.equal(records[0].activeIngredientsManuallyConfirmed, false);
    report.checks.push('Unconfirmed catalogue mapping saves as source metadata, without falsely confirmed label ingredients');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#today-compact-medicine-list [data-edit-medication]').first().click();
    assert.equal(await form.evaluate(el => el.catalogueSelection?.productId), 'pharmac-7e19f47e7eefe045');
    assert.deepEqual((await ingredient.inputValue()).split(/;\s*/).filter(Boolean), ['Abacavir sulphate', 'Lamivudine']);
    assert.equal(await form.locator('[name="ingredientsConfirmed"]').isChecked(), false);
    assert.match(await form.locator('.medication-catalogue-selected').textContent(), /not checked against your label/i);
    await ingredient.scrollIntoViewIfNeeded();
    await snapshot(page, 'reopened-combination-' + width + '.png');
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    records = await saved(page);
    assert.equal(records[0].catalogueMatch.productId, 'pharmac-7e19f47e7eefe045', 'unchanged reopen/save retains exact source ID');
    assert.deepEqual(records[0].activeIngredients, [], 'unchanged reopen/save does not promote catalogue text to confirmed label text');
    await page.locator('#medication-library [data-edit-medication]').first().click();
    await dose.fill('Changed 300 mg dose');
    assert.equal(await form.evaluate(el => el.catalogueSelection?.productId), 'pharmac-7e19f47e7eefe045');
    assert.equal(await form.evaluate(el => el.catalogueSelection?.doseStatus), 'unverified');
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    records = await saved(page);
    assert.equal(records[0].catalogueMatch.productId, 'pharmac-7e19f47e7eefe045');
    assert.equal(records[0].catalogueMatch.doseStatus, 'unverified');
    report.checks.push('Save/reopen retains source-only unconfirmed mapping; dose edit keeps source row but marks dose unverified');

    await page.locator('#medication-library [data-edit-medication]').first().click();
    await name.fill('Fictional different medicine');
    assert.equal(await form.evaluate(el => el.catalogueSelection), null);
    assert.equal(await ingredient.inputValue(), '');
    assert.equal(await form.locator('.medication-catalogue-selected').isVisible(), false);
    await ingredient.scrollIntoViewIfNeeded();
    await snapshot(page, 'changed-name-' + width + '.png');
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    records = await saved(page);
    assert.equal(records[0].catalogueMatch, null);
    assert.deepEqual(records[0].activeIngredients, []);
    report.checks.push('Changing medicine name clears selected source metadata and derived ingredients on save');

    await page.locator('#medication-library [data-edit-medication]').first().click();
    await ingredient.fill('Synthetic label ingredient');
    await form.locator('[name="ingredientsConfirmed"]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#medication-library [data-edit-medication]').first().click();
    await name.fill('Fictional corrected medicine name');
    assert.equal(await ingredient.inputValue(), 'Synthetic label ingredient', 'name correction preserves manually entered label text');
    assert.equal(await form.locator('[name="ingredientsConfirmed"]').isChecked(), false, 'name correction requires renewed label confirmation');
    await form.locator('button[type="submit"]').click();
    assert.equal(await form.isVisible(), true, 'unconfirmed manual text blocks saving');
    records = await saved(page);
    assert.equal(records[0].name, 'Fictional different medicine', 'blocked save does not change the record or checker input');
    await form.locator('[name="ingredientsConfirmed"]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    records = await saved(page);
    assert.equal(records[0].name, 'Fictional corrected medicine name');
    assert.deepEqual(records[0].activeIngredients, ['Synthetic label ingredient']);
    assert.equal(records[0].activeIngredientsManuallyConfirmed, true);
    report.checks.push('Manual label text survives name correction; save requires renewed confirmation');

    await page.locator('#medication-library [data-edit-medication]').first().click();
    await name.fill('Abacavir/Lamivudine Viatris');
    await form.locator('.medication-catalogue-choice').filter({ hasText: 'Abacavir/Lamivudine Viatris' }).first().click();
    await ingredient.fill('Synthetic label ingredient');
    await form.locator('[name="ingredientsConfirmed"]').check();
    await name.fill('Fictional corrected medicine name');
    assert.equal(await form.evaluate(el => el.catalogueSelection), null);
    assert.equal(await ingredient.inputValue(), 'Synthetic label ingredient', 'manual text entered after catalogue selection survives a name change');
    assert.equal(await form.locator('[name="ingredientsConfirmed"]').isChecked(), false);
    await form.locator('button[type="submit"]').click();
    assert.equal(await form.isVisible(), true);
    report.checks.push('Changing selected product clears its identity while preserving edited label text for re-confirmation');

    assert.deepEqual(report.pageErrors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: 'passed', checks: report.checks.length, pageErrors: report.pageErrors.length, screenshots: report.screenshots }, null, 2));
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
