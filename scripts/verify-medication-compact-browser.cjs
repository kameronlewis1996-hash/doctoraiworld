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
const report = { checks: [], screenshots: [], errors: [], stubbedApiCalls: [] };
function check(condition, description) { assert.ok(condition, description); report.checks.push(description); }
async function noOverflow(page, description) {
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), description + ': no horizontal overflow');
}
async function screenshot(page, name, fullPage = true) {
  const file = path.join(out, name);
  await page.screenshot({ path: file, fullPage });
  report.screenshots.push(file);
}
async function contextFor(browser, base, width, medications, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: width > 800 ? 1000 : 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      report.stubbedApiCalls.push({ method: route.request().method(), path: url.pathname });
      return route.fulfill({ json: url.pathname === '/api/auth/google' ? { authenticated: false } : { active: false, authenticated: false } });
    }
    if (options.catalogueUnavailable && url.pathname.startsWith('/data/medication/')) return route.fulfill({ status: 503, json: { error: 'Fictional catalogue unavailable' } });
    if (url.pathname === '/data/medication/nz-medicine-names.json') return route.fulfill({ json: { names: ['Fictional amber tablet', 'Fictional blue capsule'] } });
    if (url.pathname === '/data/medication/nz-pharmac-medicines.json') return route.fulfill({ json: { products: [
      { id: 'fictional-10', brand: 'Fictional amber tablet', name: 'Fictional amber tablet - 10 mg tablet', formulation: '10 mg tablet' },
      { id: 'fictional-20', brand: 'Fictional amber tablet', name: 'Fictional amber tablet - 20 mg capsule', formulation: '20 mg capsule' },
      { id: 'fictional-unknown', brand: 'Fictional amber tablet', name: 'Fictional amber tablet - unknown form', formulation: '' }
    ] } });
    return route.continue();
  });
  await context.addInitScript(({ items, profile }) => {
    if (sessionStorage.getItem('fictional-compact-seeded')) return;
    sessionStorage.setItem('fictional-compact-seeded', 'yes');
    const prefix = 'doctorai-health-hub-';
    localStorage.setItem(prefix + 'device-storage-consent', 'yes');
    localStorage.setItem(prefix + 'medications', JSON.stringify(items));
    if (profile) localStorage.setItem(prefix + 'profile', JSON.stringify(profile));
  }, { items: medications, profile: options.profile });
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
  await first.locator('[data-edit-medication]').click();
  const editForm = page.locator('#quick-modal [data-modal-form="medication"]');
  await editForm.locator('details.medication-optional-fields > summary').click();
  check(await editForm.locator('[name="instructions"]').inputValue() === fictionalMedications[0].instructions, width + ': editing opens the original legacy instructions verbatim');
  await editForm.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  const savedLegacyInstructions = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-medications')).find(item => item.id === 'fictional-one')?.instructions);
  check(savedLegacyInstructions === fictionalMedications[0].instructions, width + ': saving an unchanged edit preserves legacy instructions exactly');

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
  const optionalDetails = form.locator('details.medication-optional-fields');
  check(await form.locator('.medication-required-note').isVisible() && /\*\s*Required/i.test(await form.locator('.medication-required-note').innerText()), width + ': required legend appears above medication fields');
  check(await form.locator('[required]').count() === 1 && await name.evaluate(element => element.required && element.getAttribute('aria-required') === 'true'), width + ': medicine name is the sole initially required field with accessible semantics');
  check(/\*/.test(await name.locator('xpath=ancestor::label[1]').innerText()), width + ': medicine name label has a required marker');
  check(!(await dose.evaluate(element => element.required)) && /optional/i.test(await dose.locator('xpath=ancestor::label[1]').innerText()), width + ': strength or dose is clearly optional');
  check(await optionalDetails.count() === 1 && !(await optionalDetails.evaluate(element => element.open)) && /Schedule & more details/.test(await optionalDetails.locator(':scope > summary').innerText()), width + ': Schedule & more details starts collapsed');
  await screenshot(page, 'medication-form-' + width + '.png', false);
  await form.locator('button[type="submit"]').click();
  check(await name.evaluate(element => element === document.activeElement && element.validity.valueMissing), width + ': empty submit stops on the missing medicine name');
  check(await name.getAttribute('aria-invalid') === 'true' && /name is required/i.test(await form.locator('#medication-form-error').innerText()), width + ': missing name has an understandable inline error');
  await name.fill('Fictional custom medicine');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  check(await page.locator('#medication-library .library-item-wrap').count() === 1 && /Recorded strength\/dose: not recorded/i.test(await page.locator('#medication-library .library-item').innerText()), width + ': name-only entry saves with strength or dose explicitly not recorded');
  const nameOnlyMedication = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-medications'))[0]);
  check(nameOnlyMedication.name === 'Fictional custom medicine' && !nameOnlyMedication.dose && !nameOnlyMedication.time, width + ': saving a name alone does not invent a dose or schedule');
  check(nameOnlyMedication.instructions === '', width + ': blank new instructions remain exactly empty without invented directions');
  await page.locator('#medication-library [data-edit-medication]').click();
  await form.waitFor({ state: 'visible' });
  check(await name.inputValue() === 'Fictional custom medicine' && await dose.inputValue() === '', width + ': name-only record reopens with its optional dose blank');
  check(!(await optionalDetails.evaluate(element => element.open)), width + ': optional details also start collapsed while editing');
  await optionalDetails.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  check(await optionalDetails.evaluate(element => element.open), width + ': optional form details open with keyboard Enter');
  check(!(await time.evaluate(element => element.required)) && /optional/i.test(await time.locator('xpath=ancestor::label[1]').innerText()), width + ': preferred time is clearly optional');
  for (const [field, label] of [[name, 'name'], [dose, 'strength or dose'], [time, 'time']]) {
    const help = await field.evaluate(element => (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').join(' '));
    check(/label|prescription|package/i.test(help), width + ': ' + label + ' help is associated and label-led');
  }
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
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
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

async function savedProfile(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-profile') || '{}'));
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
  await page.goto(base + '/health-hub#today', { waitUntil: 'networkidle' });
  const todayAllergies = page.locator('#today-allergy-list');
  check(await todayAllergies.isVisible() && (await todayAllergies.innerText()).includes(medicine.name) && (await todayAllergies.innerText()).includes('Possible reaction'), width + ': Today displays the saved observation as Possible reaction');
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
  const recreated = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-medications'))[0]);
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
  await page.waitForFunction(() => /suggestions are unavailable/.test(document.querySelector('#medication-name-help')?.textContent || ''));
  check(await form.locator('.medication-form-product-choice').isHidden() && await form.locator('[name="dose"]').inputValue() === '', 'catalogue failure: no product or dose is selected');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#quick-modal').open);
  check(/Fictional unavailable catalogue medicine/.test(await page.locator('#medication-library .library-item').innerText()) && /not recorded/.test(await page.locator('#medication-library .library-item').innerText()), 'catalogue failure: the user can still save a name-only entry');
  await context.close();
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
      const instructions = await page.evaluate(() => JSON.parse(localStorage.getItem('doctorai-health-hub-medications'))[0]?.instructions);
      check(instructions === medicine.instructions, label + ': an unchanged edit preserves legacy instruction line breaks and spacing exactly');
    }
    await context.close();
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      await verifySavedRows(browser, base, width);
      await verifyFormJourney(browser, base, width);
      await verifyPossibleReactionJourney(browser, base, width);
    }
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
