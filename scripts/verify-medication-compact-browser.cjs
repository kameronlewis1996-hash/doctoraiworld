'use strict';
// Fictional, signed-out records only. This test never reads a real health profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

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
const report = { checks: [], screenshots: [], errors: [] };
function check(condition, description) { assert.ok(condition, description); report.checks.push(description); }
async function noOverflow(page, description) {
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), description + ': no horizontal overflow');
}
async function screenshot(page, name, fullPage = true) {
  const file = path.join(out, name);
  await page.screenshot({ path: file, fullPage });
  report.screenshots.push(file);
}
async function contextFor(browser, base, width, medications) {
  const context = await browser.newContext({ viewport: { width, height: width > 800 ? 1000 : 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: url.pathname === '/api/auth/google' ? { authenticated: false } : { active: false, authenticated: false } });
    if (url.pathname === '/data/medication/nz-medicine-names.json') return route.fulfill({ json: { names: ['Fictional amber tablet', 'Fictional blue capsule'] } });
    if (url.pathname === '/data/medication/nz-pharmac-medicines.json') return route.fulfill({ json: { products: [
      { id: 'fictional-10', brand: 'Fictional amber tablet', name: 'Fictional amber tablet - 10 mg tablet', formulation: '10 mg tablet' },
      { id: 'fictional-20', brand: 'Fictional amber tablet', name: 'Fictional amber tablet - 20 mg capsule', formulation: '20 mg capsule' },
      { id: 'fictional-unknown', brand: 'Fictional amber tablet', name: 'Fictional amber tablet - unknown form', formulation: '' }
    ] } });
    return route.continue();
  });
  await context.addInitScript(items => {
    if (sessionStorage.getItem('fictional-compact-seeded')) return;
    sessionStorage.setItem('fictional-compact-seeded', 'yes');
    const prefix = 'doctorai-health-hub-';
    localStorage.setItem(prefix + 'device-storage-consent', 'yes');
    localStorage.setItem(prefix + 'medications', JSON.stringify(items));
  }, medications);
  return context;
}

async function verifySavedRows(browser, base, width) {
  const context = await contextFor(browser, base, width, fictionalMedications);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/health-hub#medications', { waitUntil: 'networkidle' });
  const rows = page.locator('#medication-library > .library-item-wrap');
  check(await rows.count() === 2, width + ': both fictional current medicines are present');
  const first = rows.first();
  const mainText = await first.locator('.library-item').innerText();
  check(/Fictional amber tablet/.test(mainText) && /10 mg per tablet/.test(mainText), width + ': the main row shows the saved name and strength');
  check(!/fictionalin|remaining supply not recorded|not set|Fictional label directions/i.test(mainText), width + ': source detail and empty placeholders stay out of the main row');
  const details = first.locator('details.medication-record-details');
  check(await details.count() === 1 && !(await details.evaluate(element => element.open)), width + ': extra saved details start collapsed');
  const warning = first.locator('.medication-safety-alerts');
  check(await warning.isVisible(), width + ': possible duplicate warning remains visible beside the medicine');
  const visibleWarningText = await warning.innerText();
  check(/possible.*duplicate/i.test(visibleWarningText) && /pharmacist|clinician/i.test(visibleWarningText), width + ': warning title and next step remain visible without expanding details');
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

  // The detailed reminder disclosure lives under My Health; the compact Today
  // panel is a separate summary of the same saved records.
  await page.goto(base + '/health-hub#health', { waitUntil: 'networkidle' });
  const reminders = page.locator('.health-reminders-disclosure');
  await reminders.locator(':scope > summary').click();
  const todayRows = page.locator('#today-medication-list .medication-row-wrap');
  check(await todayRows.count() === 2, width + ': Today still lists the two saved medicines');
  const statuses = await todayRows.locator('.medication-status').allInnerTexts();
  check(statuses.every(value => !/^Due\s*$/i.test(value)), width + ': absent times are not presented as a due reminder');
  check(await todayRows.locator('[data-med-missed]').count() === 0, width + ': unscheduled medicines cannot be marked missed from a guessed reminder');
  await noOverflow(page, width + ' Today reminders');
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
  const time = form.locator('[name="time"]');
  check(await form.locator('.medication-required-note').isVisible() && /\*\s*Required/i.test(await form.locator('.medication-required-note').innerText()), width + ': required legend appears above medication fields');
  for (const [field, label] of [[name, 'name'], [dose, 'strength or dose']]) {
    check(await field.evaluate(element => element.required && element.getAttribute('aria-required') === 'true'), width + ': ' + label + ' has native and accessible required semantics');
    check(/\*/.test(await field.locator('xpath=ancestor::label[1]').innerText()), width + ': ' + label + ' label has a required marker');
  }
  check(!(await time.evaluate(element => element.required)) && /optional/i.test(await time.locator('xpath=ancestor::label[1]').innerText()), width + ': preferred time is clearly optional');
  for (const [field, label] of [[name, 'name'], [dose, 'strength or dose'], [time, 'time']]) {
    const help = await field.evaluate(element => (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').join(' '));
    check(/label|prescription|package/i.test(help), width + ': ' + label + ' help is associated and label-led');
  }
  await screenshot(page, 'medication-form-' + width + '.png', false);
  await form.locator('button[type="submit"]').click();
  check(await name.evaluate(element => element === document.activeElement && element.validity.valueMissing), width + ': empty submit stops on the missing medicine name');
  check(await name.getAttribute('aria-invalid') === 'true' && /name is required/i.test(await form.locator('#medication-form-error').innerText()), width + ': missing name has an understandable inline error');
  await name.fill('Fictional custom medicine');
  await form.locator('button[type="submit"]').click();
  check(await dose.evaluate(element => element === document.activeElement && element.validity.valueMissing), width + ': next empty submit stops on the missing strength or dose');
  check(await dose.getAttribute('aria-invalid') === 'true' && /strength or dosage is required/i.test(await form.locator('#medication-form-error').innerText()), width + ': missing strength has an understandable inline error');
  const ingredientInput = form.locator('[name="activeIngredients"]');
  const ingredientConfirm = form.locator('[name="ingredientsConfirmed"]');
  await ingredientInput.fill('fictionalin');
  check(await ingredientConfirm.evaluate(element => element.required && element.getAttribute('aria-required') === 'true') && /\*/.test(await ingredientConfirm.locator('xpath=ancestor::label[1]').innerText()), width + ': label-ingredient confirmation becomes marked required only when used');
  await ingredientInput.fill('');
  check(!(await ingredientConfirm.evaluate(element => element.required)) && !(await ingredientConfirm.locator('xpath=ancestor::label[1]').innerText()).includes('*'), width + ': empty optional ingredients remove the confirmation requirement');

  await name.fill('Fictional');
  const listId = await name.getAttribute('list');
  check(Boolean(listId), width + ': searchable medicine suggestions are connected to the name field');
  await page.waitForFunction(id => Boolean(document.getElementById(id)?.querySelector('option')), listId);
  check(await page.locator('#' + listId + ' option').count() >= 2, width + ': fictional name options are available without auto-selection');
  check(await name.inputValue() === 'Fictional', width + ': typing a partial name does not silently select a catalogue entry');
  check(await form.locator('.medication-form-product-choice').isHidden(), width + ': partial search cannot expose a product/form choice');
  await name.focus(); await page.keyboard.press('Tab');
  check(await dose.evaluate(element => element === document.activeElement), width + ': keyboard Tab leaves the name suggestions for the next field');
  await name.fill('Fictional amber tablet');
  const productChoice = form.locator('.medication-form-product-choice');
  await productChoice.waitFor({ state: 'visible' });
  const productSelect = productChoice.locator('select');
  const useForm = productChoice.locator('[data-use-medication-form]');
  check(await productSelect.inputValue() === '' && await useForm.isDisabled(), width + ': exact name alone does not choose a product or copy a form');
  check(await productSelect.locator('option[value="fictional-10"]').isEnabled() && await productSelect.locator('option[value="fictional-unknown"]').isDisabled(), width + ': only known, usable form options can be selected');
  await productChoice.scrollIntoViewIfNeeded();
  await screenshot(page, 'medication-product-picker-' + width + '.png', false);
  await productSelect.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  check(await productSelect.inputValue() === 'fictional-10', width + ': product/form dropdown supports native keyboard selection');
  check(await dose.inputValue() === '', width + ': even a selected product does not fill the strength field without a second explicit action');
  await useForm.click();
  check(await dose.inputValue() === '10 mg tablet', width + ': explicit label-checked action copies only the selected form');
  await name.fill('Fictional custom medicine');
  check(await productChoice.isHidden() && await dose.inputValue() === '', width + ': editing the name clears the copied source form and its picker');
  await dose.fill('10 mg per tablet, copied from fictional label');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#medications-count')?.textContent === '1 current');
  check(/Fictional custom medicine/.test(await page.locator('#medication-library').innerText()), width + ': custom entry saves without a catalogue match');
  await noOverflow(page, width + ' after add');
  await screenshot(page, 'medication-added-' + width + '.png');
  await page.locator('#medication-library [data-edit-medication]').click();
  check(await form.locator('[name="name"]').inputValue() === 'Fictional custom medicine', width + ': editing reopens the saved custom name');
  await form.locator('[name="dose"]').fill('20 mg per tablet, copied from fictional label');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  check(/20 mg per tablet/.test(await page.locator('#medication-library').innerText()), width + ': edit updates saved strength text');
  await page.locator('#medication-library [data-delete-medication]').click();
  check(await page.locator('#medication-library .library-item-wrap').count() === 0, width + ': delete clears the saved row');
  check(await page.locator('#medications-count').innerText() === '0 current', width + ': count updates after delete');
  await noOverflow(page, width + ' after delete');
  await context.close();
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      await verifySavedRows(browser, base, width);
      await verifyFormJourney(browser, base, width);
    }
    assert.deepEqual(report.errors, [], 'No browser JavaScript errors');
    fs.writeFileSync(path.join(out, 'medication-compact-qa.json'), JSON.stringify({ result: 'passed', ...report }, null, 2));
    console.log(`Medication compact browser QA passed: ${report.checks.length} assertions, ${report.screenshots.length} screenshots at 1440/390/320.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
