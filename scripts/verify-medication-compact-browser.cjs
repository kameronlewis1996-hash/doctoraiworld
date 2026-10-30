'use strict';
// Fictional guest records and a mocked Pro account only. This test never reads a real health profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const medicationCore = require('../server-src/_lib/doctorai-core.cjs');
const medicationSafetyHandler = require('../api/medication/safety.js');
const medicationSafetyEngine = require('../server-src/medication/safety-engine.cjs');

const root = path.resolve(__dirname, '..');
const out = process.env.MEDICATION_COMPACT_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-medication-compact-qa');
fs.mkdirSync(out, { recursive: true });
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};
const server = http.createServer((request, response) => {
  let pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') pathname = '/index.html';
  if (!path.extname(pathname)) pathname += '.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) {
    response.writeHead(404).end(); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

const fictionalMedications = [
  { id: 'fictional-one', name: 'Fictional amber tablet', dose: '10 mg per tablet',
    frequency: '', time: '', instructions: 'Fictional label directions kept for the record',
    supply: null, refill: 'Not set', activeIngredients: ['fictionalin'],
    activeIngredientsManuallyConfirmed: true },
  { id: 'fictional-two', name: 'Fictional amber tablet', dose: '10 mg per tablet',
    frequency: '', time: '', instructions: 'Second fictional label directions',
    supply: null, refill: 'Not set', activeIngredients: ['fictionalin'],
    activeIngredientsManuallyConfirmed: true }
];
const report = { checks: [], screenshots: [], errors: [], stubbedApiCalls: [], checkerRequests: [] };
function check(condition, description) { assert.ok(condition, description); report.checks.push(description); }
async function noOverflow(page, description) {
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), description + ': no horizontal overflow');
}
async function screenshot(page, name, fullPage = true) {
  const file = path.join(out, name);
  await page.screenshot({ path: file, fullPage });
  report.screenshots.push(file);
}
async function storedMedicationByProductId(page, productId) {
  return page.evaluate(productId => {
    for (const key of Object.keys(localStorage).filter(value => value.startsWith('doctorai-health-hub-') && value.endsWith('-medications'))) {
      try {
        const records = JSON.parse(localStorage.getItem(key) || '[]');
        const found = Array.isArray(records) && records.find(item => item?.catalogueMatch?.productId === productId);
        if (found) return found;
      } catch { /* Ignore unrelated or invalid fictional test storage. */ }
    }
    return null;
  }, productId);
}

async function verifyRouteColorIdentity(browser, base, width) {
  const context = await contextFor(browser, base, width, []);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/health-hub#today', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.hubTheme === 'health');
  check(await page.locator('#view-health').isVisible(), width + ': legacy Today opens My Health');
  const fixtures = [
    { route: 'medications', accent: '#0759b6', surface: '#e8f2ff', nav: 'medications' },
    { route: 'health', accent: '#0759b6', surface: '#e8f2ff', nav: 'health' },
    { route: 'visit-prep', accent: '#0759b6', surface: '#e8f2ff', nav: 'visit-prep' },
    { route: 'profile', accent: '#0759b6', surface: '#e8f2ff', nav: 'profile' }
  ];
  const rgb = hex => 'rgb(' + parseInt(hex.slice(1, 3), 16) + ', ' + parseInt(hex.slice(3, 5), 16) + ', ' + parseInt(hex.slice(5, 7), 16) + ')';
  for (const fixture of fixtures) {
    await page.goto(base + '/health-hub#' + fixture.route, { waitUntil: 'networkidle' });
    await page.waitForFunction(route => document.body.dataset.hubTheme === route, fixture.route);
    await page.waitForTimeout(250);
    await screenshot(page, 'category-' + fixture.route + '-' + width + '.png');
    const colors = await page.evaluate(({ route, nav, width }) => {
      const bodyStyle = getComputedStyle(document.body);
      const navRoot = width > 800 ? '.primary-nav' : '.mobile-bottom-nav';
      const tab = nav ? document.querySelector(navRoot + ' [data-view="' + nav + '"][aria-current="page"]') : null;
      const sectionTab = route === 'health'
        ? (width > 800 ? document.querySelector('#view-health [data-hub-panel-target][aria-current="page"]') : document.querySelector('#view-health [data-hub-section-select]'))
        : null;
      const headingAccent = route === 'today'
        ? document.querySelector('#view-today .reference-intro h1 span')
        : document.querySelector('#view-' + route + '> .page-heading .eyebrow');
      return {
        theme: document.body.dataset.hubTheme,
        accent: bodyStyle.getPropertyValue('--hub-category-accent').trim(),
        surface: bodyStyle.getPropertyValue('--hub-category-surface').trim(),
        tabColor: tab ? getComputedStyle(tab).color : null,
        tabSurface: tab ? getComputedStyle(tab).backgroundColor : null,
        sectionTabColor: sectionTab ? getComputedStyle(sectionTab).color : null,
        headingAccent: headingAccent ? getComputedStyle(headingAccent).color : null
      };
    }, { route: fixture.route, nav: fixture.nav, width });
    check(colors.theme === fixture.route && colors.accent === fixture.accent && colors.surface === fixture.surface,
      width + ': ' + fixture.route + ' page resolves its route palette');
    if (fixture.nav) {
      check(colors.tabColor === rgb(fixture.accent), width + ': ' + fixture.route + ' tab text matches its page accent');
      check(colors.tabSurface === rgb(fixture.surface), width + ': ' + fixture.route + ' selected tab surface matches its page');
    }
    if (fixture.route === 'health') check(await page.locator('#view-health').isVisible(), width + ': My Health is the visible main page');
    check(colors.headingAccent === rgb(fixture.accent), width + ': ' + fixture.route + ' page heading matches its category accent');
    if (fixture.route === 'visit-prep' && width <= 800) {
      await page.evaluate(() => document.querySelector('#view-visit-prep .reference-visit-actions .text-button')?.scrollIntoView({ block: 'end' }));
      await page.waitForTimeout(50);
      check(await page.evaluate(() => {
        const action = document.querySelector('#view-visit-prep .reference-visit-actions .text-button')?.getBoundingClientRect();
        const navigation = document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect();
        return Boolean(action && navigation && action.bottom <= navigation.top);
      }), width + ': Visit Prep actions can scroll fully above the mobile navigation');
    }
  }
  await page.goto(base + '/health-hub#appointments', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.hubTheme === 'diary');
  const nested = await page.evaluate(width => {
    const navRoot = width > 800 ? '.primary-nav' : '.mobile-bottom-nav';
    const visit = document.querySelector(navRoot + ' [data-view="visit-prep"]');
    const parent = document.querySelector('#hub-parent-link');
    return { selected: visit?.getAttribute('aria-current'), parentView: parent?.dataset.view, parentText: parent?.textContent, parentHidden: parent?.hidden };
  }, width);
  check(nested.selected === 'page' && nested.parentView === 'visit-prep' && nested.parentText === 'Visit Prep' && !nested.parentHidden,
    width + ': diary and appointments stay nested under Visit Prep');
  await context.close();
}
async function contextFor(browser, base, width, medications, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: width > 800 ? 1000 : 844 }, isMobile: width <= 520, hasTouch: width <= 520, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      report.stubbedApiCalls.push({ method: route.request().method(), path: url.pathname });
      const method = route.request().method();
      if (options.proAccount && url.pathname === '/api/auth/google' && method === 'GET') {
        return route.fulfill({ json: { authenticated: true, user: { sub: 'synthetic-medication-review-account', email: 'fixture@example.invalid', name: 'Fictional Reviewer' }, medicationLoginId: 'a'.repeat(64) } });
      }
      if (options.proAccount && url.pathname === '/api/auth/config') {
        return route.fulfill({ json: { googleClientId: '', medicationRulesVersion: '2026.10.28-alias1' } });
      }
      if (options.proAccount && url.pathname === '/api/stripe/entitlement') {
        return route.fulfill({ json: { active: true, expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
      }
      if (options.proAccount && url.pathname === '/api/health/state') {
        return route.fulfill({ json: method === 'GET' ? { state: null, updatedAt: 0 } : { ok: true, updatedAt: Date.now() } });
      }
      if (options.proAccount && options.mockScan && url.pathname === '/api/medication/scan' && method === 'POST') {
        const body = route.request().postDataJSON();
        check(body.consent === true && /^data:image\/jpeg;base64,/.test(body.image), 'synthetic scan request requires explicit consent and a prepared image');
        return route.fulfill({ json: { medication: { name: 'Co-trimoxazole', activeIngredients: ['trimethoprim', 'sulfamethoxazole'] }, review: { required: true, confirmed: false, missing: [] } } });
      }
      if (options.proAccount && url.pathname === '/api/medication/safety' && method === 'POST') {
        const body = route.request().postDataJSON();
        report.checkerRequests.push(body);
        const response = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; }, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
        await medicationSafetyHandler({ method: 'POST', headers: {}, body }, response);
        return route.fulfill({ status: response.statusCode, json: response.body });
      }
      return route.fulfill({ json: url.pathname === '/api/auth/google' ? { authenticated: false } : { active: false, authenticated: false } });
    }
    if (options.catalogueUnavailable && url.pathname.startsWith('/data/medication/')) return route.fulfill({ status: 503, json: { error: 'Fictional catalogue unavailable' } });
    if (options.realCatalogue && url.pathname === '/data/medication/nz-pharmac-medicines.json') return route.continue();
    if (url.pathname === '/data/medication/nz-pharmac-medicines.json') return route.fulfill({ json: {
      schemaVersion: 1, datasetVersion: 'fictional-2026-01', sources: [{ effectiveDate: '2026-01-01' }],
      ingredients: [
        { id: 'fictional-amberin', name: 'Fictional amberin', aliases: ['amberin'] },
        { id: 'fictional-bluein', name: 'Fictional bluein', aliases: ['bluein'] },
        { id: 'fictional-violetin', name: 'Fictional violetin', aliases: ['violetin'] }
      ],
      products: [
        { id: 'pharmac-fictionalamber10', name: 'Fictional amber tablet - 10 mg tablet', brand: 'Fictional Amber', chemical: 'Fictional amberin', formulation: '10 mg tablet', market: 'Community', interactionRoute: 'oral', pharmacodes: ['fictional-code-10'], nzmtIds: ['fictional-nzmt-10'], ingredients: ['fictional-amberin'], ingredientsComplete: true },
        { id: 'pharmac-fictionalcombination', name: 'Fictional amber and blue tablet - 5 mg / 10 mg', brand: 'Fictional Duo', chemical: 'Fictional amberin and bluein', formulation: '5 mg / 10 mg tablet', market: 'Community', interactionRoute: 'oral', pharmacodes: ['fictional-code-combo'], nzmtIds: [], ingredients: ['fictional-amberin', 'fictional-bluein'], ingredientsComplete: true },
        { id: 'pharmac-fictionalincomplete', name: 'Fictional violet capsule - unknown strength', brand: 'Fictional Violet', chemical: 'Fictional violetin', formulation: 'Capsule', market: 'Community', interactionRoute: '', pharmacodes: [], nzmtIds: [], ingredients: ['fictional-violetin', 'unmapped-ingredient'], ingredientsComplete: false }
      ]
    } });
    return route.continue();
  });
  const scope = options.proAccount ? 'account-' + createHash('sha256').update('doctorai:health-hub-local:v1:fixture@example.invalid').digest('hex') : 'guest';
  await context.addInitScript(({ items, profile, scope }) => {
    if (sessionStorage.getItem('fictional-compact-seeded')) return;
    sessionStorage.setItem('fictional-compact-seeded', 'yes');
    const prefix = 'doctorai-health-hub-';
    localStorage.setItem(prefix + 'device-storage-consent', 'yes');
    localStorage.setItem(prefix + scope + '-medications', JSON.stringify(items));
    if (profile) localStorage.setItem(prefix + scope + '-profile', JSON.stringify(profile));
  }, { items: medications, profile: options.profile, scope });
  return context;
}

async function verifySavedRows(browser, base, width) {
  const context = await contextFor(browser, base, width, fictionalMedications);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  const rows = page.locator('#medication-library > .library-item-wrap');
  await page.waitForFunction(() => document.querySelectorAll('#medication-library > .library-item-wrap').length === 2);
  check(await rows.count() === 2, width + ': both fictional current medicines are present');
  const first = rows.first();
  const mainText = await first.locator('.library-item').innerText();
    check(/Fictional amber tablet/.test(mainText) && /Strength entered: 10 mg per tablet/.test(mainText), width + ': the main row shows the saved name and strength');
  check(!/fictionalin|remaining supply not recorded|not set|Fictional label directions/i.test(mainText), width + ': source detail and empty placeholders stay out of the main row');
  const details = first.locator('details.medication-record-details');
  check(await details.count() === 1 && !(await details.evaluate(element => element.open)), width + ': extra saved details start collapsed');
  const warning = first.locator('.medication-safety-alerts');
  check(await warning.isVisible(), width + ': possible duplicate warning remains visible beside the medicine');
  const visibleWarningText = await warning.innerText();
  check(/Similar saved names \(not a verified duplicate\)/i.test(visibleWarningText) && /Possible repeated label ingredient \(not database checked\)/i.test(visibleWarningText) && /pharmacist|clinician/i.test(visibleWarningText), width + ': distinct unverified name and confirmed-label text notices and professional next step remain visible');
  check(!(await warning.locator('details').first().evaluate(element => element.open)), width + ': longer caution explanation starts collapsed');
  await screenshot(page, 'medication-list-compact-' + width + '.png');
  const rowShot = path.join(out, 'medication-row-warning-' + width + '.png');
  await first.screenshot({ path: rowShot }); report.screenshots.push(rowShot);
  await details.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  check(await details.evaluate(element => element.open), width + ': details open with keyboard Enter');
  check(/fictionalin|Fictional label directions/i.test(await details.innerText()), width + ': original optional data remains available in details');
  await noOverflow(page, width + ' saved and expanded');
  await screenshot(page, 'medication-saved-' + width + '.png');
  await first.locator('[data-edit-medication]').click();
  const editForm = page.locator('#quick-modal [data-modal-form="medication"]');
  await editForm.locator('details.medication-optional-fields > summary').click();
  check(await editForm.locator('[name="instructions"]').inputValue() === fictionalMedications[0].instructions, width + ': editing opens the original legacy instructions verbatim');
  await editForm.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  const savedLegacyInstructions = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications')).find(item => item.id === 'fictional-one')?.instructions);
  check(savedLegacyInstructions === fictionalMedications[0].instructions, width + ': saving an unchanged edit preserves legacy instructions exactly');

  // The reminder disclosure lives under My Health and summarizes the same saved records.
  await page.goto(base + '/health-hub#health', { waitUntil: 'networkidle' });
  const reminders = page.locator('.health-reminders-disclosure');
  await reminders.locator(':scope > summary').evaluate(element => element.scrollIntoView({ block: 'center' }));
  if (width <= 800) check(await reminders.locator(':scope > summary').evaluate(element => element.getBoundingClientRect().bottom <= document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top), width + ': reminder disclosure can scroll clear of fixed navigation');
  await reminders.locator(':scope > summary').click({timeout:5000});
  const todayRows = page.locator('#today-medication-list .medication-row-wrap');
  check(await todayRows.count() === 2, width + ': My Health reminders list the two saved medicines');
  const statuses = await todayRows.locator('.medication-status').allInnerTexts();
  check(statuses.every(value => !/^Due\s*$/i.test(value)), width + ': absent times are not presented as a due reminder');
  check(await todayRows.locator('[data-med-missed]').count() === 0, width + ': unscheduled medicines cannot be marked missed from a guessed reminder');
  await noOverflow(page, width + ' My Health reminders');
  await context.close();
}

async function verifyFormJourney(browser, base, width) {
  const context = await contextFor(browser, base, width, []);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  check(await page.locator('#medication-library .library-item-wrap').count() === 0, width + ': empty list starts empty');
  await page.locator('#view-medications [data-modal="medication"]').first().click();
  const form = page.locator('#quick-modal [data-modal-form="medication"]');
  await form.waitFor({ state: 'visible' });
  const name = form.locator('[name="name"]');
  const dose = form.locator('[name="dose"]');
  const doseAmount = form.locator('[name="doseAmount"]');
  const doseUnit = form.locator('[name="doseUnitChoice"]');
  const customDoseUnit = form.locator('[name="doseUnitCustom"]');
  const time = form.locator('[name="time"]');
  const optionalDetails = form.locator('details.medication-optional-fields');
  check(await form.locator('.medication-required-note').isVisible() && /\*\s*Required/i.test(await form.locator('.medication-required-note').innerText()), width + ': required legend appears above medication fields');
  check(await form.locator('[required]').count() === 1 && await name.evaluate(element => element.required && element.getAttribute('aria-required') === 'true'), width + ': medicine name is the sole initially required field with accessible semantics');
  check(/\*/.test(await form.locator('label[for="manual-medication-name"]').innerText()), width + ': medicine name label has a required marker');
  check(!(await dose.evaluate(element => element.required)) && /optional/i.test(await dose.locator('xpath=ancestor::label[1]').innerText()), width + ': strength or dose is clearly optional');
  check(await optionalDetails.count() === 1 && !(await optionalDetails.evaluate(element => element.open)) && /Schedule & more details/.test(await optionalDetails.locator(':scope > summary').innerText()), width + ': Schedule & more details starts collapsed');
  await screenshot(page, 'medication-form-' + width + '.png', false);
  await form.locator('button[type="submit"]').click();
  check(await name.evaluate(element => element === document.activeElement && element.validity.valueMissing), width + ': empty submit stops on the missing medicine name');
  check(await name.getAttribute('aria-invalid') === 'true' && /name is required/i.test(await form.locator('#medication-form-error').innerText()), width + ': missing name has an understandable inline error');
  await name.fill('Fictional custom medicine');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  check(await page.locator('#medication-library .library-item-wrap').count() === 1 && /Strength not recorded/i.test(await page.locator('#medication-library .library-item').innerText()), width + ': name-only entry saves with product strength explicitly not recorded');
  const nameOnlyMedication = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
  check(nameOnlyMedication.name === 'Fictional custom medicine' && !nameOnlyMedication.dose && !nameOnlyMedication.doseAmount && !nameOnlyMedication.doseUnit && !nameOnlyMedication.time, width + ': saving a name alone does not invent product strength, amount or schedule');
  check(nameOnlyMedication.instructions === '', width + ': blank new instructions remain exactly empty without invented directions');
  await page.locator('#medication-library [data-edit-medication]').click();
  await form.waitFor({ state: 'visible' });
  check(await name.inputValue() === 'Fictional custom medicine' && await dose.inputValue() === '' && await doseAmount.inputValue() === '' && await doseUnit.inputValue() === '', width + ': name-only record reopens with optional strength and dose amount blank');
  check(!(await optionalDetails.evaluate(element => element.open)), width + ': optional details also start collapsed while editing');
  await optionalDetails.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  check(await optionalDetails.evaluate(element => element.open), width + ': optional form details open with keyboard Enter');
  check(!(await time.evaluate(element => element.required)) && /optional/i.test(await time.locator('xpath=ancestor::label[1]').innerText()), width + ': preferred time is clearly optional');
  for (const [field, label] of [[name, 'name'], [dose, 'product strength'], [doseAmount, 'dose amount'], [doseUnit, 'dose unit'], [time, 'time']]) {
    const help = await field.evaluate(element => (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').join(' '));
    check(/label|prescription|package/i.test(help), width + ': ' + label + ' help is associated and label-led');
  }
  const ingredientInput = form.locator('[name="activeIngredients"]');
  const ingredientConfirm = form.locator('[name="ingredientsConfirmed"]');
  await ingredientInput.fill('fictionalin');
  check(await ingredientConfirm.evaluate(element => element.required && element.getAttribute('aria-required') === 'true') && /\*/.test(await ingredientConfirm.locator('xpath=ancestor::label[1]').innerText()), width + ': label-ingredient confirmation becomes marked required only when used');
  await ingredientInput.fill('');
  check(!(await ingredientConfirm.evaluate(element => element.required)) && !(await ingredientConfirm.locator('xpath=ancestor::label[1]').innerText()).includes('*'), width + ': empty optional ingredients remove the confirmation requirement');

  await name.fill('Fictional amber');
  const results = form.locator('#medication-name-results');
  await results.waitFor({ state: 'visible' });
  check(await results.getByRole('option').count() >= 2, width + ': partial brand search shows in-page product options');
  const firstOption = results.getByRole('option').first();
  check(await firstOption.locator('.medication-name-result-title').innerText() === 'Fictional Amber' && /Fictional amberin.*10 mg tablet/.test(await firstOption.locator('small').innerText()), width + ': product options lead with the plain brand and keep chemical/form details in the subtitle');
  check(await name.inputValue() === 'Fictional amber', width + ': typing a partial query never selects the first result');
  check(await name.getAttribute('role') === 'combobox' && await name.getAttribute('aria-expanded') === 'true' && Boolean(await name.getAttribute('aria-activedescendant')) === false, width + ': search exposes accessible combobox/listbox state before a result is chosen');
  check(await form.locator('#medication-selected-product').isHidden(), width + ': partial search has no selected product or ingredient autofill');
  await name.fill('bluein');
  await results.waitFor({ state: 'visible' });
  check(await results.getByRole('option').count() >= 1, width + ': generic ingredient alias search returns matching products');
  if (width <= 520) {
    await name.fill('Fictional Duo');
    const comboOption = results.getByRole('option').filter({ hasText: 'Fictional Duo' }).first();
    await comboOption.waitFor({ state: 'visible' });
    await comboOption.tap();
  } else {
    await name.fill('Fictional Duo');
    await results.waitFor({ state: 'visible' });
    await name.press('ArrowDown');
    check(Boolean(await name.getAttribute('aria-activedescendant')), width + ': ArrowDown marks a keyboard-active option');
    await name.press('Enter');
  }
  const selectedPanel = form.locator('#medication-selected-product');
  await selectedPanel.waitFor({ state: 'visible' });
  const selectedMatch = await form.evaluate(element => element.catalogueSelection);
  check(selectedMatch?.productId === 'pharmac-fictionalcombination' && selectedMatch.ingredients.length === 2, width + ': explicit selection stores the exact combination product and both catalogue ingredients');
  check(/unconfirmed|not checked against your label/i.test(await selectedPanel.innerText()) && /Fictional amberin, Fictional bluein/.test(await selectedPanel.innerText()), width + ': source ingredients for a combination are visibly unconfirmed');
  check(await ingredientInput.inputValue() === '' && !(await ingredientConfirm.isChecked()), width + ': catalogue ingredients never enter label-confirmed checker fields');
  await screenshot(page, 'medication-product-picker-' + width + '.png', false);
  await ingredientInput.fill('manual ingredient from fictional package');
  await ingredientConfirm.check();
  await name.fill('Fictional custom medicine');
  check(await selectedPanel.isHidden() && !await form.evaluate(element => Boolean(element.catalogueSelection)), width + ': editing the product name clears the selected catalogue identity');
  check(await ingredientInput.inputValue() === 'manual ingredient from fictional package' && !(await ingredientConfirm.isChecked()), width + ': name edit preserves manually entered label text but requires reconfirmation');
  await ingredientInput.fill('');
  await name.fill('zzzxq-no-matching-product');
  await page.waitForTimeout(250);
  const noMatchText = await form.locator('#medication-search-status').innerText();
  check(/No product matched/.test(noMatchText), width + ': no-match guidance is announced');
  check(await results.isHidden() && await selectedPanel.isHidden(), width + ': no-match state is clear and has no stale selection');
  await name.fill('x');
  check(await results.isHidden(), width + ': one-character searches stay closed until there is enough query text');
  await name.fill('Fictional custom medicine');
  await dose.fill('10 mg per tablet, copied from fictional label');
  await doseAmount.fill('1.5');
  await form.locator('button[type="submit"]').click();
  check(await form.isVisible() && /Choose a unit/i.test(await form.locator('#medication-form-error').innerText()), width + ': an amount cannot be saved without a unit');
  await doseUnit.selectOption('other');
  check(await form.locator('[data-dose-unit-custom-field]').isVisible(), width + ': choosing a custom unit reveals its input');
  await customDoseUnit.fill('sachets');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  await page.waitForFunction(() => document.querySelector('#medications-count')?.textContent === '1 current');
  check(/Fictional custom medicine/.test(await page.locator('#medication-library').innerText()) && /Amount per dose recorded: 1\.5 sachets/.test(await page.locator('#medication-library').innerText()), width + ': custom entry and separately recorded amount save without a catalogue match');
  const amountSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
  check(amountSaved.doseAmount === '1.5' && amountSaved.doseUnit === 'sachets' && amountSaved.dose === '10 mg per tablet, copied from fictional label', width + ': pack strength and user-recorded amount remain separate fields');
  await noOverflow(page, width + ' after add');
  await screenshot(page, 'medication-added-' + width + '.png');
  await page.locator('#medication-library [data-edit-medication]').click();
  check(await form.locator('[name="name"]').inputValue() === 'Fictional custom medicine', width + ': editing reopens the saved custom name');
  check(await doseAmount.inputValue() === '1.5' && await doseUnit.inputValue() === 'other' && await customDoseUnit.inputValue() === 'sachets', width + ': custom amount and unit reopen without conversion');
  await form.locator('[name="dose"]').fill('20 mg per tablet, copied from fictional label');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  const updatedRow = page.locator('#medication-library .library-item-wrap').first();
  check(/Strength text needs review/.test(await updatedRow.locator('.library-item').innerText()), width + ': edited mixed strength text is flagged for review rather than shown as verified');
  await updatedRow.locator('.medication-record-details > summary').click();
  check(/Saved strength-field text \(unverified\)\s+20 mg per tablet, copied from fictional label/.test(await updatedRow.locator('.medication-record-details').innerText()), width + ': edited raw strength text stays available in the collapsed details');
  await page.locator('#medication-library [data-delete-medication]').click();
  check(await page.locator('#medication-library .library-item-wrap').count() === 0, width + ': delete clears the saved row');
  check(await page.locator('#medications-count').innerText() === '0 current', width + ': count updates after delete');
  await noOverflow(page, width + ' after delete');
  await context.close();
}

async function savedProfile(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-profile') || '{}'));
}

async function verifyPossibleReactionJourney(browser, base, width) {
  const medicine = { id: 'fictional-reaction-medicine', name: 'Fictional amber tablet', dose: '', time: '', frequency: '', supply: null, refill: 'Not set' };
  const neutralNote = 'I keep Fictional amber tablet in the travel pouch; no reaction or concern was recorded.';
  const reactionText = 'Fictional itchy patch noticed after taking this tablet';
  const context = await contextFor(browser, base, width, [medicine], { profile: { notes: neutralNote, allergies: '', allergyEntries: [] } });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  const row = page.locator('#medication-library > .library-item-wrap');
  check(await row.count() === 1 && await row.locator('.medication-safety-alerts').count() === 0, width + ': a sole medicine and neutral profile mention do not create an orange safety alert');
  check(await row.locator('.medication-record-note').count() === 0, width + ': a neutral note does not invent a possible reaction');
  const details = row.locator('details.medication-record-details');
  check(!(await details.evaluate(element => element.open)), width + ': saved details for reaction recording start collapsed');
  await details.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  const profileNote = details.locator('.medication-profile-note');
  check(await profileNote.isVisible() && await profileNote.locator('p').first().innerText() === neutralNote, width + ': the expanded profile note preserves the legacy neutral text verbatim');
  await details.locator('[data-record-medication-reaction]').last().click();
  const form = page.locator('#quick-modal [data-modal-form="medication-reaction"]');
  await form.waitFor({ state: 'visible' });
  const reaction = form.locator('[name="reaction"]');
  const declared = form.locator('[name="reactionDeclared"]');
  check(await form.locator('[required]').count() === 2, width + ': reaction form requires both the observation and the explicit declaration');
  for (const [field, label] of [[reaction, 'reaction observation'], [declared, 'reaction declaration']]) {
    check(await field.evaluate(element => element.required && element.getAttribute('aria-required') === 'true'), width + ': ' + label + ' has native and accessible required semantics');
  }
  await form.locator('button[type="submit"]').click();
  check(await reaction.evaluate(element => element === document.activeElement && element.validity.valueMissing), width + ': an empty reaction form focuses the required observation');
  check((await savedProfile(page)).allergyEntries.length === 0, width + ': an empty reaction form saves no profile report');
  await reaction.fill(reactionText);
  await form.locator('button[type="submit"]').click();
  check(await declared.evaluate(element => element === document.activeElement && element.validity.valueMissing), width + ': an observation alone still requires the user declaration');
  check((await savedProfile(page)).allergyEntries.length === 0, width + ': an undeclared observation saves no profile report');
  await declared.check();
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  const profile = await savedProfile(page);
  const entry = profile.allergyEntries[0];
  check(profile.allergyEntries.length === 1 && entry.substance === medicine.name && entry.reaction === reactionText && entry.certainty === 'suspected' && entry.source === 'user' && entry.medicationId === medicine.id, width + ': the declared reaction saves once with suspected certainty, user source and a medicine ID link');
  check(!profile.allergies, width + ': a possible reaction is excluded from the compatibility allergies string');
  check(await row.locator('.medication-record-note').isVisible() && /Possible reaction recorded by you/.test(await row.locator('.medication-record-note').innerText()), width + ': the informational possible-reaction note is visible on the medicine row');
  check(await row.locator('.medication-safety-alerts').count() === 0, width + ': the possible-reaction note creates no orange medicine safety alert');
  await details.locator(':scope > summary').click();
  await details.locator('[data-record-medication-reaction]').last().click();
  await form.waitFor({ state: 'visible' });
  await reaction.fill(reactionText);
  await declared.check();
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => /already recorded/i.test(document.querySelector('[data-modal-form="medication-reaction"] #medication-form-error')?.textContent || ''));
  check(await form.isVisible() && await reaction.getAttribute('aria-invalid') === 'true', width + ': declaring the same possible reaction twice keeps the form open with an inline error');
  check(JSON.stringify((await savedProfile(page)).allergyEntries) === JSON.stringify(profile.allergyEntries), width + ': a duplicate reaction attempt leaves one unchanged profile report');
  await form.locator('[data-close-modal]').click();
  await noOverflow(page, width + ' possible reaction');
  await screenshot(page, 'medication-possible-reaction-' + width + '.png');
  await page.reload({ waitUntil: 'networkidle' });
  check(await row.locator('.medication-record-note').isVisible() && (await savedProfile(page)).allergyEntries[0].medicationId === medicine.id, width + ': the possible reaction and medicine link survive reload');
  await page.goto(base + '/health-hub#health', { waitUntil: 'networkidle' });
  const healthAllergies = page.locator('#allergies-list');
  check(await healthAllergies.isVisible() && (await healthAllergies.innerText()).includes(medicine.name) && (await healthAllergies.innerText()).includes('suspected'), width + ': My Health displays the observation with suspected certainty');
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  await row.locator('[data-edit-medication]').click();
  const medicationForm = page.locator('#quick-modal [data-modal-form="medication"]');
  await medicationForm.locator('[name="name"]').fill('Fictional renamed tablet');
  await medicationForm.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  check(await row.locator('.medication-record-note').count() === 0 && await row.locator('.medication-safety-alerts').count() === 0, width + ': renaming the medicine hides its linked note and creates no safety alert');
  check(JSON.stringify((await savedProfile(page)).allergyEntries) === JSON.stringify(profile.allergyEntries), width + ': renaming preserves the original profile report');
  await row.locator('[data-delete-medication]').click();
  check(await row.count() === 0 && JSON.stringify((await savedProfile(page)).allergyEntries) === JSON.stringify(profile.allergyEntries), width + ': deleting the medicine preserves the profile report');
  await page.locator('#view-medications [data-modal="medication"]').first().click();
  await medicationForm.locator('[name="name"]').fill(medicine.name);
  await medicationForm.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  const recreated = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
  check(recreated.id !== medicine.id && await row.locator('.medication-record-note').count() === 0, width + ': recreating the same medicine name gets a new ID and does not relink the old report');
  check(JSON.stringify((await savedProfile(page)).allergyEntries) === JSON.stringify(profile.allergyEntries), width + ': the original report remains unchanged after recreating the medicine');
  await row.locator('details.medication-record-details > summary').click();
  check(await row.locator('.medication-profile-note p').first().innerText() === neutralNote && await row.locator('.medication-safety-alerts').count() === 0, width + ': the unchanged neutral profile note remains reviewable without becoming an orange caution');
  await noOverflow(page, width + ' recreated medicine');
  await context.close();
}

async function verifyCatalogueFallback(browser, base) {
  const context = await contextFor(browser, base, 390, [], { catalogueUnavailable: true });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  await page.locator('#view-medications [data-modal="medication"]').first().click();
  const form = page.locator('#quick-modal [data-modal-form="medication"]');
  await form.locator('[name="name"]').fill('Fictional unavailable catalogue medicine');
  await page.waitForFunction(() => /Catalogue search is unavailable/.test(document.querySelector('#medication-search-status')?.textContent || ''));
  check(await form.locator('#medication-name-results').isHidden() && await form.locator('#medication-selected-product').isHidden() && await form.locator('[name="dose"]').inputValue() === '', 'catalogue failure: no product or dose is selected');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  check(/Fictional unavailable catalogue medicine/.test(await page.locator('#medication-library .library-item').innerText()) && /not recorded/.test(await page.locator('#medication-library .library-item').innerText()), 'catalogue failure: the user can still save a name-only entry');
  await context.close();
}

async function verifyCatalogueSelectionSaved(browser, base, width) {
  const context = await contextFor(browser, base, width, []);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  await page.locator('#view-medications [data-modal="medication"]').first().click();
  const form = page.locator('#quick-modal [data-modal-form="medication"]');
  const name = form.locator('[name="name"]');
  await name.fill('Fictional Duo');
  const option = form.locator('#medication-name-results [role="option"]').filter({ hasText: 'Fictional Duo' }).first();
  await option.waitFor({ state: 'visible' });
  if (width <= 520) await option.tap(); else await option.click();
  await form.locator('[name="doseAmount"]').fill('2');
  await form.locator('[name="doseUnitChoice"]').selectOption('tablets');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
  check(saved?.catalogueMatch?.productId === 'pharmac-fictionalcombination' && saved.catalogueMatch.ingredients.length === 2, width + ': saving preserves the selected source row and combination ingredients');
  check(saved.activeIngredients.length === 0 && saved.activeIngredientsManuallyConfirmed === false, width + ': catalogue-derived ingredients remain outside the label-confirmed checker fields');
  check(saved.doseAmount === '2' && saved.doseUnit === 'tablets' && saved.dose !== '2 tablets', width + ': dose amount is saved separately from the product formulation and label ingredient gate');
  await page.locator('#medication-library [data-edit-medication]').click();
  const reopened = page.locator('#quick-modal [data-modal-form="medication"]');
  await reopened.locator('#medication-selected-product').waitFor({ state: 'visible' });
  check(await reopened.locator('[name="name"]').inputValue() === saved.name, width + ': reopening restores the full selected product name');
  check(await reopened.locator('[name="doseAmount"]').inputValue() === '2' && await reopened.locator('[name="doseUnitChoice"]').inputValue() === 'tablets', width + ': selected product reopens its recorded amount without deriving it from strength');
  check((await reopened.locator('#medication-selected-product').innerText()).includes('Fictional amberin, Fictional bluein') && /unconfirmed/i.test(await reopened.locator('#medication-selected-product').innerText()), width + ': reopening re-renders the source ingredients as unconfirmed');
  await reopened.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  const reopenedSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
  check(reopenedSaved.catalogueMatch?.productId === saved.catalogueMatch.productId && reopenedSaved.activeIngredients.length === 0, width + ': unchanged edit/save retains identity without promoting source ingredients');
  await context.close();
}

async function verifyIncompleteCatalogueSelection(browser, base) {
  const context = await contextFor(browser, base, 390, []);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  await page.locator('#view-medications [data-modal="medication"]').first().click();
  const form = page.locator('#quick-modal [data-modal-form="medication"]');
  await form.locator('[name="name"]').fill('Fictional Violet');
  const option = form.locator('#medication-name-results [role="option"]').filter({ hasText: 'Fictional Violet' }).first();
  await option.waitFor({ state: 'visible' });
  await option.tap();
  const panel = form.locator('#medication-selected-product');
  const selected = await form.evaluate(element => element.catalogueSelection);
  check(selected?.ingredientsComplete === false && selected.ingredients.map(item => item.name).join(', ') === 'Fictional violetin', 'incomplete product: the known source ingredient is preserved but mapping remains incomplete');
  check(/Incomplete catalogue mapping; known ingredients \(unconfirmed\): Fictional violetin/.test(await panel.innerText()), 'incomplete product: the UI does not present a partial source mapping as complete');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
  check(saved.catalogueMatch?.ingredientsComplete === false && saved.catalogueMatch.ingredients.length === 1 && saved.activeIngredients.length === 0, 'incomplete product: persistence retains source status and does not populate confirmed checker fields');
  await page.locator('#medication-library [data-edit-medication]').click();
  const reopened = page.locator('#quick-modal [data-modal-form="medication"]');
  await reopened.locator('#medication-selected-product').waitFor({ state: 'visible' });
  check(/Incomplete catalogue mapping/.test(await reopened.locator('#medication-selected-product').innerText()), 'incomplete product: reopen still labels the mapping incomplete');
  await reopened.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
  check(saved.catalogueMatch?.ingredientsComplete === false && saved.activeIngredients.length === 0, 'incomplete product: unchanged edit/save remains unconfirmed and incomplete');
  await noOverflow(page, '390 incomplete catalogue selection');
  await context.close();
}

async function verifyStrengthTextPresentation(browser, base, width) {
  const fixture = { id: 'fictional-fexaclear', name: 'Fexaclear — Fexofenadine hydrochloride — Tab 120 mg', dose: '90 Fexofenadine HCl Ta 120mg (FEX)', doseAmount: '120', doseUnit: 'mg', frequency: 'Once daily', time: '', instructions: '', supply: null, refill: 'Not set' };
  const context = await contextFor(browser, base, width, [fixture]);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#medication-library .library-item-wrap'));
    const row = page.locator('#medication-library > .library-item-wrap').first();
    const visible = await row.locator('.library-item').innerText();
    check(/Fexaclear/.test(visible) && /Saved product text: Fexofenadine hydrochloride \/ Tab 120 mg \(not verified\)/.test(visible), width + ': compact card leads with the familiar name and keeps the product text secondary and unverified');
    check(/Strength text needs review/.test(visible) && /Amount per dose recorded: 120 mg/.test(visible), width + ': mixed strength text is flagged separately from the saved amount per dose');
    check(!/90 Fexofenadine HCl/.test(visible), width + ': mixed source text is not presented as a verified product strength on the card');
    const details = row.locator('.medication-record-details');
    check(await details.locator(':scope > summary').innerText() === 'Label and other details for Fexaclear', width + ': extra details have a clear medicine-specific label');
    await details.locator(':scope > summary').click();
    const detailsText = await details.innerText();
    check(/Saved strength-field text \(unverified\)\s+90 Fexofenadine HCl Ta 120mg \(FEX\)/.test(detailsText), width + ': original mixed text remains available verbatim in details');
    check(!/No other details recorded/.test(detailsText), width + ': empty boilerplate is removed');
    await screenshot(page, 'strength-review-' + width + '.png');
    await row.locator('[data-edit-medication]').click();
    const form = page.locator('#quick-modal [data-modal-form="medication"]');
    check(await form.locator('[name="dose"]').inputValue() === fixture.dose, width + ': editing reopens the exact mixed source text');
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]);
    check(saved.dose === fixture.dose && saved.doseAmount === '120' && saved.doseUnit === 'mg', width + ': saving an unchanged edit preserves the full mixed text and separate amount');
    await noOverflow(page, width + ' mixed strength review');
  } finally {
    await context.close();
  }
}

async function verifyVoltarenJourney(browser, base, width) {
  const originalCore = {
    identityFromRequest: medicationCore.identityFromRequest,
    storageConfigured: medicationCore.storageConfigured,
    activeEntitlement: medicationCore.activeEntitlement,
    reportError: medicationCore.reportError
  };
  medicationCore.identityFromRequest = async () => ({ sub: 'synthetic-medication-review-account', email: 'fixture@example.invalid' });
  medicationCore.storageConfigured = () => true;
  medicationCore.activeEntitlement = async () => ({ tier: 'pro', exp: Math.floor(Date.now() / 1000) + 3600 });
  medicationCore.reportError = () => {};
  const context = await contextFor(browser, base, width, [], { realCatalogue: true, proAccount: true });
  const page = await context.newPage();
  const beforeRequests = report.checkerRequests.length;
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    await page.locator('#view-medications [data-modal="medication"]').first().click();
    const form = page.locator('#quick-modal [data-modal-form="medication"]');
    const name = form.locator('[name="name"]');
    await name.fill('Voltaren Diclofenac sodium Suppos 100 mg');
    const option = form.locator('#medication-name-results [role="option"]').filter({ hasText: 'Suppos 100 mg' }).first();
    await option.waitFor({ state: 'visible' });
    const optionText = await option.innerText();
    check((await option.locator('.medication-name-result-title').innerText()) === 'Voltaren' && /Diclofenac sodium.*Suppos 100 mg/.test(optionText), width + ': Voltaren options lead with the plain brand and show exact chemical/formulation separately');
    if (width <= 520) await option.tap(); else await option.click();
    const selectedPanel = form.locator('#medication-selected-product');
    await selectedPanel.waitFor({ state: 'visible' });
    const selected = await form.evaluate(element => element.catalogueSelection);
    const ingredients = form.locator('[name="activeIngredients"]');
    const confirmed = form.locator('[name="ingredientsConfirmed"]');
    check(selected?.productId === 'pharmac-27fe3db7fbaac919' && selected.ingredientsComplete === true && selected.ingredients.length === 1, width + ': the exact Voltaren suppository source row is complete and selected by its explicit product ID');
    check((await selectedPanel.innerText()).includes('Catalogue ingredients (unconfirmed): Diclofenac') && /not checked against your label/i.test(await selectedPanel.innerText()), width + ': source ingredient display remains clearly separate from label confirmation');
    check(/not sent to the check/i.test(await selectedPanel.innerText()) && /enter every active ingredient/i.test(await selectedPanel.innerText()) && /save and check again/i.test(await selectedPanel.innerText()), width + ': selection guidance explains the confirmation gate and next action');
    check(await ingredients.inputValue() === '' && !(await confirmed.isChecked()), width + ': choosing the source row does not fill or confirm label ingredient text');
    await screenshot(page, 'voltaren-selected-unconfirmed-' + width + '.png', false);
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    let saved = await storedMedicationByProductId(page, 'pharmac-27fe3db7fbaac919');
    if (!saved) throw new Error('Voltaren save did not persist a matching product row in account-scoped storage.');
    check(saved.catalogueMatch?.productId === 'pharmac-27fe3db7fbaac919' && saved.catalogueMatch.ingredientsComplete === true && saved.activeIngredients.length === 0 && saved.activeIngredientsManuallyConfirmed === false, width + ': saving the selected source row preserves complete catalogue data without promoting it to label-confirmed fields');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    await page.locator('#medication-library [data-edit-medication]').first().click();
    const reopened = page.locator('#quick-modal [data-modal-form="medication"]');
    await reopened.locator('#medication-selected-product').waitFor({ state: 'visible' });
    check(await reopened.locator('[name="name"]').inputValue() === saved.name && await reopened.evaluate(element => element.catalogueSelection?.productId) === saved.catalogueMatch.productId, width + ': reload and edit restore the exact Pharmac product identity and full label name');
    check(/Catalogue ingredients \(unconfirmed\): Diclofenac/.test(await reopened.locator('#medication-selected-product').innerText()) && await reopened.locator('[name="activeIngredients"]').inputValue() === '', width + ': reload keeps source ingredients visible but outside the label text field');
    await reopened.locator('[data-close-modal]').click();
    const panel = page.locator('.clash-panel');
    await panel.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('.clash-panel') && !document.querySelector('.clash-panel').classList.contains('pro-locked'));
    await panel.locator('[data-local-medication-db-consent]').check();
    await panel.locator('[data-run-local-medication-safety-check]').click();
    await page.waitForFunction(() => /active ingredients were not checked by you against the package/i.test(document.querySelector('[data-local-medication-db-result]')?.textContent || ''));
    let unconfirmedRequest = report.checkerRequests.at(-1);
    const unconfirmedResolution = medicationSafetyEngine.resolveMedication(unconfirmedRequest.medications[0]);
    check(report.checkerRequests.length === beforeRequests + 1, width + ': exact selected Voltaren triggers one local safety request');
    check(unconfirmedRequest.medications[0].name === saved.name && !Object.hasOwn(unconfirmedRequest.medications[0], 'catalogueMatch') && !Object.hasOwn(unconfirmedRequest.medications[0], 'productId') && !Object.hasOwn(unconfirmedRequest.medications[0], 'activeIngredients') && !Object.hasOwn(unconfirmedRequest.medications[0], 'activeIngredientsConfirmed') && !Object.hasOwn(unconfirmedRequest.medications[0], 'doseAmount') && !Object.hasOwn(unconfirmedRequest.medications[0], 'doseUnit'), width + ': checker adapter sends only the saved name and strength/dose; product identity and source ingredients stay out');
    check(unconfirmedResolution.status === 'resolved' && unconfirmedResolution.basis === 'catalogue_name' && unconfirmedResolution.labelIngredientsConfirmed !== true, width + ': current name-only matching remains separate from selected-ID data and label confirmation');
    const firstUiResult = await page.locator('[data-local-medication-db-result]').innerText();
    check(/Selected Pharmac mapping: Diclofenac\. It has not been checked against your package/i.test(firstUiResult) && /did not send this product or its ingredient list/i.test(firstUiResult) && /any name match above is separate from label confirmation/i.test(firstUiResult), width + ': concise checker text distinguishes source mapping from package confirmation');
    await screenshot(page, 'voltaren-check-unconfirmed-' + width + '.png');
    await panel.locator('[data-local-medication-db-consent]').uncheck();
    await page.locator('#medication-library [data-edit-medication]').first().click();
    const edit = page.locator('#quick-modal [data-modal-form="medication"]');
    await edit.locator('#medication-selected-product').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#quick-modal [data-modal-form="medication"]')?.catalogueSelection?.productId === 'pharmac-27fe3db7fbaac919');
    await edit.locator('details.medication-optional-fields > summary').click();
    await edit.locator('[name="activeIngredients"]').fill('Diclofenac sodium');
    await edit.locator('[name="ingredientsConfirmed"]').check();
    await edit.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    saved = await storedMedicationByProductId(page, 'pharmac-27fe3db7fbaac919');
    if (!saved) throw new Error('Confirmed Voltaren edit lost the selected product row.');
    check(saved.activeIngredientsManuallyConfirmed === true && saved.activeIngredients.join(', ') === 'Diclofenac sodium' && saved.catalogueMatch.productId === 'pharmac-27fe3db7fbaac919', width + ': after checking the original label, the confirmed text and separate source identity save together');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    saved = await storedMedicationByProductId(page, 'pharmac-27fe3db7fbaac919');
    check(Boolean(saved), width + ': the confirmed medication remains in its account-scoped local storage after reload');
    check(saved.activeIngredientsManuallyConfirmed === true && saved.activeIngredients[0] === 'Diclofenac sodium' && saved.catalogueMatch.productId === 'pharmac-27fe3db7fbaac919', width + ': confirmed label text and exact product ID survive reload independently');
    const reloadedPanel = page.locator('.clash-panel');
    await reloadedPanel.waitFor({ state: 'visible' });
    await reloadedPanel.locator('[data-local-medication-db-consent]').check();
    await reloadedPanel.locator('[data-run-local-medication-safety-check]').click();
    await page.waitForFunction(() => /name mapping agrees with the ingredient text you checked against the package/i.test(document.querySelector('[data-local-medication-db-result]')?.textContent || ''));
    const confirmedRequest = report.checkerRequests.at(-1);
    const confirmedResolution = medicationSafetyEngine.resolveMedication(confirmedRequest.medications[0]);
    check(report.checkerRequests.length === beforeRequests + 2 && confirmedRequest.medications[0].activeIngredientsConfirmed === true && confirmedRequest.medications[0].activeIngredients.join(', ') === 'Diclofenac sodium', width + ': after reload, the checker receives label ingredients only after explicit confirmation');
    check(!Object.hasOwn(confirmedRequest.medications[0], 'catalogueMatch') && !Object.hasOwn(confirmedRequest.medications[0], 'productId'), width + ': confirmed checker request still validates text through the existing allowlisted contract, not a product-ID bypass');
    check(confirmedResolution.status === 'resolved' && confirmedResolution.basis === 'catalogue_and_confirmed_label' && confirmedResolution.labelIngredientsConfirmed === true, width + ': confirmed label matching is reported with its distinct evidence basis');
    await screenshot(page, 'voltaren-check-confirmed-' + width + '.png');

    await page.locator('#view-medications [data-modal="medication"]').first().click();
    const ibuprofenForm = page.locator('#quick-modal [data-modal-form="medication"]');
    const ibuprofenName = ibuprofenForm.locator('[name="name"]');
    await ibuprofenName.fill('Ibuprofen Tab 400 mg');
    const ibuprofenOption = ibuprofenForm.locator('#medication-name-results [role="option"]').filter({ hasText: 'Tab 400 mg' }).first();
    await ibuprofenOption.waitFor({ state: 'visible' });
    if (width <= 520) await ibuprofenOption.tap(); else await ibuprofenOption.click();
    const ibuprofenSelected = await ibuprofenForm.evaluate(element => element.catalogueSelection);
    check(ibuprofenSelected?.productId === 'pharmac-34fe78bf9d3ca1b3' && ibuprofenSelected.ruleInteractionRoute === 'oral', width + ': the exact ibuprofen tablet remains a distinct oral product row');
    await ibuprofenForm.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    await reloadedPanel.locator('[data-local-medication-db-consent]').check();
    await reloadedPanel.locator('[data-run-local-medication-safety-check]').click();
    await page.waitForFunction(() => /Pair not checked/.test(document.querySelector('[data-local-medication-db-result]')?.textContent || ''));
    const pairRequest = report.checkerRequests.at(-1);
    const pairReview = medicationSafetyEngine.review(pairRequest);
    const pairUi = await page.locator('[data-local-medication-db-result]').innerText();
    check(pairRequest.medications.length === 2 && pairRequest.medications.some(item => item.name === 'Voltaren — Diclofenac sodium — Suppos 100 mg') && pairRequest.medications.some(item => item.name === 'Ibuprofen — Tab 400 mg'), width + ': the synthetic checker journey includes the exact Voltaren suppository and ibuprofen tablet');
    check(pairReview.coverage.requestedPairs === 1 && pairReview.coverage.assessedPairs === 0 && pairReview.coverage.unassessedPairs === 1 && pairReview.status === 'unknown', width + ': exact NSAID pair remains unknown and unassessed in the active ruleset');
    check(pairReview.resolved[0].possibleInteractionRoutes[0] === 'systemic' && pairReview.resolved[1].possibleInteractionRoutes[0] === 'oral', width + ': route distinction survives exact-name resolution without guessing from dose text');
    check(/Both|both|Voltaren/.test(pairUi) && /not assessed by this limited check/.test(pairUi) && /No alert does not mean safe/.test(pairUi) && /pharmacist or prescriber/i.test(pairUi), width + ': checker wording names the pair, states it was not assessed and gives a professional next step');
    check(await page.locator('#medication-library .medication-pair-coverage-badge').count() === 2, width + ': the unassessed-pair marker also appears beside both saved medicines');
    const localAlertShortcut = page.locator('#view-medications .hub-alert-shortcut[data-alert-level="neutral"]');
    check(await localAlertShortcut.locator('[data-alert-title]').innerText() === 'Some medicine pairs not fully checked' && await localAlertShortcut.locator('[data-alert-note]').isVisible() && /not fully checked/.test(await localAlertShortcut.locator('[data-alert-note]').innerText()), width + ': the neutral coverage notice visibly explains the unchecked pair');
    check(/No alert does not mean safe/.test(await localAlertShortcut.getAttribute('aria-label')) && /pharmacist or prescriber/.test(await localAlertShortcut.getAttribute('aria-label')), width + ': screen-reader button name retains the complete safety and next-step wording');
    check(await page.locator('[data-local-medication-db-result] .safety-result-alert.is-warning').count() === 0 && await page.locator('[data-local-medication-db-result] .safety-result-alert.is-unknown[role="status"]').count() === 1, width + ': unknown coverage stays orange/status and is not misrepresented as a red interaction warning');
    await screenshot(page, 'voltaren-ibuprofen-not-checked-' + width + '.png');
    await noOverflow(page, width + ' Voltaren save/reload/check journey');
  } finally {
    await context.close();
    medicationCore.identityFromRequest = originalCore.identityFromRequest;
    medicationCore.storageConfigured = originalCore.storageConfigured;
    medicationCore.activeEntitlement = originalCore.activeEntitlement;
    medicationCore.reportError = originalCore.reportError;
  }
}

async function verifyPartialCombinationJourney(browser, base, width, combination = 'Trisul') {
  const originalCore = { identityFromRequest: medicationCore.identityFromRequest, storageConfigured: medicationCore.storageConfigured, activeEntitlement: medicationCore.activeEntitlement, reportError: medicationCore.reportError };
  medicationCore.identityFromRequest = async () => ({ sub: 'synthetic-medication-review-account', email: 'fixture@example.invalid' });
  medicationCore.storageConfigured = () => true;
  medicationCore.activeEntitlement = async () => ({ tier: 'pro', exp: Math.floor(Date.now() / 1000) + 3600 });
  medicationCore.reportError = () => {};
  const medications = [{ id: 'fixture-one', name: 'Marevan' }, { id: 'fixture-two', name: combination }];
  const context = await contextFor(browser, base, width, medications, { proAccount: true, realCatalogue: true });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.subscription === 'pro' && document.querySelectorAll('#medication-library .library-item-wrap').length === 2);
    const panel = page.locator('.clash-panel');
    await panel.locator('[data-local-medication-db-consent]').check();
    await panel.locator('[data-run-local-medication-safety-check]').click();
    const result = panel.locator('[data-local-medication-db-result]');
    await result.getByText('Pair not fully checked', { exact: true }).waitFor();
    const warning = result.locator('article[data-severity="high"]');
    check(await warning.count() === 1 && await warning.getAttribute('role') === 'alert', width + ': supported high-severity warning stays visible and assertive');
    check(/warfarin|Marevan/i.test(await warning.innerText()) && /Prompt pharmacist or prescriber review/.test(await warning.innerText()), width + ': supported warning retains its professional-review guidance');
    check(/other ingredient combinations were not assessed/i.test(await result.innerText()) && /No alert does not mean safe/.test(await result.innerText()), width + ': partial coverage is explicit alongside the warning');
    check(await page.locator('#medication-library .medication-pair-coverage-badge').count() === 2, width + ': both records show the partial-pair coverage badge');
    check((await page.locator('#medication-library .medication-pair-coverage-badge').first().innerText()).includes('not fully checked'), width + ': the badge describes partial coverage accurately');
    await noOverflow(page, width + ' partial combination');
    await page.locator('#medication-library [data-delete-medication]').last().click();
    await page.waitForFunction(() => document.querySelectorAll('#medication-library .library-item-wrap').length === 1);
    await page.waitForFunction(() => !/Possible medicine interaction|Pair not fully checked/.test(document.querySelector('[data-local-medication-db-result]')?.textContent || ''));
    check(await result.locator('article[data-severity="high"]').count() === 0, width + ': removed medicine cannot leave a stale high warning');
  } finally {
    await context.close();
    Object.assign(medicationCore, originalCore);
  }
}

async function verifySyntheticScanReview(browser, base, width) {
  const context = await contextFor(browser, base, width, [], { proAccount: true, mockScan: true, realCatalogue: true });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.subscription === 'pro');
    await page.locator('#view-medications .medication-scan-options > summary').click();
    await page.locator('#view-medications [data-open-medication-scanner]').first().click();
    const scanner = page.locator('#medication-scanner-modal');
    await scanner.waitFor({ state: 'visible' });
    const before = report.stubbedApiCalls.filter(x => x.path === '/api/medication/scan').length;
    await scanner.locator('[data-medication-photo]').click();
    check(report.stubbedApiCalls.filter(x => x.path === '/api/medication/scan').length === before, width + ': choosing a photo without image consent sends nothing');
    await scanner.locator('[data-medication-image-consent]').check();
    const chooser = page.waitForEvent('filechooser');
    await scanner.locator('[data-medication-photo]').click();
    await (await chooser).setFiles({ name: 'fictional-label.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S0AAAAASUVORK5CYII=', 'base64') });
    const form = page.locator('#quick-modal [data-modal-form="medication"]');
    await form.waitFor({ state: 'visible' });
    check(await form.getAttribute('data-scan-review-required') === 'true', width + ': extracted fields require explicit review');
    check(await form.locator('[name="name"]').inputValue() === 'Co-trimoxazole', width + ': synthetic extracted name is displayed for review');
    if (!(await form.locator('details.medication-optional-fields').evaluate(element => element.open))) await form.locator('details.medication-optional-fields > summary').click();
    await form.locator('[name="ingredientsConfirmed"]').check();
    await form.locator('button[type="submit"]').click();
    check(await form.isVisible() && !(await form.locator('[name="scanFieldsReviewed"]').isChecked()), width + ': extraction cannot save without the field-review confirmation');
    await form.locator('[name="scanFieldsReviewed"]').check();
    await form.locator('[name="dose"]').fill('10 mg');
    check(!(await form.locator('[name="scanFieldsReviewed"]').isChecked()) && !(await form.locator('[name="ingredientsConfirmed"]').isChecked()), width + ': editing an extracted field revokes both review and ingredient confirmation');
    await form.locator('[name="ingredientsConfirmed"]').check();
    await form.locator('[name="scanFieldsReviewed"]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
    check((await page.locator('#medication-library').innerText()).includes('Co-trimoxazole'), width + ': reviewed synthetic label can be saved');
  } finally { await context.close(); }
}

async function verifyEarlierNotesReview(browser, base) {
  const medicine = { id: 'fictional-alias-medicine', name: 'Fictional amber tablet', dose: '', time: '', instructions: 'Fictional legacy\n  directions', supply: null };
  const profile = {
    conditions: 'Fictional blue capsules listed in an earlier travel note.',
    notes: 'I carried amber tablets while travelling; they stayed in the blue pouch.',
    allergies: '', allergyEntries: []
  };
  for (const [width, medicines] of [[390, [medicine]], [320, []]]) {
    const label = medicines.length ? 'alias and plural earlier notes' : 'zero-medicine earlier notes';
    const context = await contextFor(browser, base, width, medicines, { profile });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
    const library = page.locator('#medication-library');
    const disclosure = library.locator('details.medication-profile-notes-review');
    check(await library.locator('.library-item-wrap').count() === medicines.length, label + ': the seeded medicine count is unchanged');
    check(await disclosure.isVisible() && !(await disclosure.evaluate(element => element.open)) && await disclosure.locator(':scope > summary').innerText() === 'Review earlier health notes', label + ': the informational review disclosure is available and starts collapsed');
    check(await library.locator('.medication-safety-alerts, .medication-record-note, .medication-profile-note').count() === 0, label + ': legacy alias text creates no medicine caution or inferred reaction');
    await disclosure.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    check(await disclosure.evaluate(element => element.open), label + ': the disclosure opens with keyboard Enter');
    const originals = await disclosure.locator('p.medication-original-note').allInnerTexts();
    check(originals.length === 2 && originals[0] === profile.conditions && originals[1] === profile.notes, label + ': original legacy condition and note text remain verbatim without requiring a medicine-name match');
    await noOverflow(page, label);
    await screenshot(page, 'medication-earlier-notes-review-' + width + '.png');
    await disclosure.locator('[data-modal="health"]').click();
    const form = page.locator('#quick-modal [data-modal-form="health"]');
    await form.waitFor({ state: 'visible' });
    check(await form.locator('[name="notes"]').inputValue() === profile.notes, label + ': Review profile text opens the original editable note');
    if (medicines.length) {
      await form.locator('[data-close-modal]').click();
      await library.locator('[data-edit-medication]').click();
      const medicationForm = page.locator('#quick-modal [data-modal-form="medication"]');
      await medicationForm.locator('details.medication-optional-fields > summary').click();
      check(await medicationForm.locator('[name="instructions"]').inputValue() === medicine.instructions, label + ': legacy instruction line breaks and spacing reopen unchanged');
      await medicationForm.locator('button[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
      const instructions = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-guest-medications'))[0]?.instructions);
      check(instructions === medicine.instructions, label + ': an unchanged edit preserves legacy instruction line breaks and spacing exactly');
    }
    await context.close();
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: 'msedge' }) });
  try {
    for (const width of [1440, 390, 320]) {
      await verifyRouteColorIdentity(browser, base, width);
      await verifySavedRows(browser, base, width);
      await verifyFormJourney(browser, base, width);
      await verifyPossibleReactionJourney(browser, base, width);
    }
    await verifyCatalogueSelectionSaved(browser, base, 1440);
    await verifyCatalogueSelectionSaved(browser, base, 390);
    await verifyIncompleteCatalogueSelection(browser, base);
    await verifyStrengthTextPresentation(browser, base, 1440);
    await verifyStrengthTextPresentation(browser, base, 390);
    await verifyVoltarenJourney(browser, base, 1440);
    await verifyVoltarenJourney(browser, base, 390);
    await verifyPartialCombinationJourney(browser, base, 1440);
    await verifyPartialCombinationJourney(browser, base, 390, 'Co-trimoxazole');
    await verifySyntheticScanReview(browser, base, 390);
    await verifyCatalogueFallback(browser, base);
    await verifyEarlierNotesReview(browser, base);
    assert.deepEqual(report.errors, [], 'No browser JavaScript errors');
    fs.writeFileSync(path.join(out, 'medication-compact-qa.json'), JSON.stringify({ result: 'passed', ...report }, null, 2));
    console.log(`Medication compact browser QA passed: ${report.checks.length} assertions, ${report.screenshots.length} screenshots at 1440/390/320.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
