'use strict';
// Chromium + real handlers over synthetic in-memory storage/providers only.
// No production credentials, OAuth, paid API, or external health storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const port = Number(process.env.PROFILE_PREVIEW_PORT || 4188);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.DOCTORAI_WEB_EVIDENCE_DIR || '/tmp/doctorai-web-qa');
fs.mkdirSync(output, { recursive: true });
const checks = [], audits = [], errors = [], requests = [];
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
const server = spawn(process.execPath, [path.join(__dirname, 'preview-managed-profiles.cjs')], { env: { ...process.env, PROFILE_PREVIEW_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
const axe = async (page, label) => {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  audits.push({ label, violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incompleteRules: result.incomplete.map(v => v.id) });
  assert.equal(result.violations.length, 0, label + ': axe violations ' + result.violations.map(v => v.id).join(', '));
};
const ready = page => page.waitForFunction(() => { const status = document.querySelector('#last-synced')?.textContent || ''; return status === 'Private data synced' || status.endsWith(' · private records loaded') || status === 'Device storage off · session only'; });
const goto = async (page, view = '') => { await page.goto(origin + '/health-hub' + (view ? '#' + view : '')); await ready(page); };
const json = (page, url, options) => page.evaluate(async ({ url, options }) => (await fetch(url, options)).json(), { url, options });
(async () => {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Synthetic server did not start')), 10000);
    server.stdout.on('data', data => { if (String(data).includes('Synthetic managed-profile preview:')) { clearTimeout(timer); resolve(); } });
    server.on('exit', code => { clearTimeout(timer); reject(new Error('Synthetic server exited ' + code)); });
  });
  browser = await chromium.launch({ executablePath: process.env.DOCTORAI_CHROMIUM || undefined, args: ['--no-sandbox'], env: { ...process.env, XDG_CONFIG_HOME: '/tmp/doctorai-qa-config', XDG_CACHE_HOME: '/tmp/doctorai-qa-cache' } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  context.setDefaultTimeout(5000);
  const page = await context.newPage();
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().startsWith(origin + '/api/') && request.method() !== 'GET') requests.push({ path: new URL(request.url()).pathname, method: request.method() }); });
  await goto(page);
  check((await json(page, '/__test/writes')).synthetic === true, 'All browser flows run on the synthetic fixture');
  await page.locator('#storage-consent [data-device-storage-session]').click();
  if (process.argv.includes('--briefing-only')) {
    check(requests.filter(item => item.path === '/api/chat').length === 0, 'Opening the Hub sends no AI request');
    await page.locator('.home-briefing-link').click();
    check(requests.filter(item => item.path === '/api/chat').length === 0, 'Opening the briefing sends no AI request');
    await page.locator('[data-generate-today-briefing]').click();
    check(requests.filter(item => item.path === '/api/chat').length === 0, 'Briefing without consent sends no AI request');
    await page.locator('[data-briefing-medication]').first().check();
    await page.locator('[data-briefing-consent]').check();
    await json(page, '/__test/latency?providerMs=500');
    await page.locator('[data-generate-today-briefing]').evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => document.getElementById('today-ai-output').textContent.includes('Synthetic educational'));
    check(requests.filter(item => item.path === '/api/chat').length === 1, 'Double activation sends one synthetic briefing request');
    check(!await page.locator('[data-briefing-consent]').isChecked(), 'Briefing consent resets after completion');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#quick-modal').screenshot({ path: path.join(output, `briefing-${width}.png`) });
      await axe(page, `briefing dialog at ${width}px`);
    }
    await page.keyboard.press('Escape');
    check(!await page.locator('#quick-modal').evaluate(e => e.open), 'Escape closes the briefing');
    check(errors.length === 0, 'No page JavaScript errors');
    fs.writeFileSync(path.join(output, 'briefing-verification.json'), JSON.stringify({ synthetic: true, checks, audits, errors, requests, paidCalls: 0, limitations: ['Local Chromium with mocked provider/storage only', 'Automated checks do not establish WCAG conformance'] }, null, 2));
    console.log(JSON.stringify({ checksPassed: checks.length, axeStates: audits.length, javascriptErrors: errors, evidence: output, paidCalls: 0 }, null, 2));
    return;
  }
  if (!process.argv.includes('--remaining')) {
  await page.locator('.skip-link').focus(); await page.keyboard.press('Enter');
  check(await page.locator('#main-content').evaluate(e => e === document.activeElement), 'Skip link moves keyboard focus to main content');
  await page.locator('.home-medication-manual-cta').click();
  check(await page.locator('#quick-modal').evaluate(e => e.open), 'Manual entry opens a named native modal');
  await page.keyboard.press('Escape');
  check(await page.locator('.home-medication-manual-cta').evaluate(e => e === document.activeElement), 'Escape restores focus to the manual-entry opener');
  await page.locator('.home-medication-manual-cta').click();
  await page.locator('#quick-modal button[type="submit"]').click();
  check(await page.locator('#quick-modal input[name="name"]').evaluate(e => !e.validity.valid), 'Empty medicine name receives native validation');
  await page.locator('#quick-modal input[name="name"]').fill('Synthetic manual medicine');
  await page.locator('#quick-modal button[type="submit"]').click();
  check(await page.locator('#quick-modal').evaluate(e => e.open), 'Missing manual strength keeps the form and edits available');
  check(await page.locator('#quick-modal input[name="dose"]').evaluate(e => e === document.activeElement), 'Manual strength error focuses the field needing correction');
  await page.locator('#quick-modal input[name="dose"]').fill('Synthetic 10 mg');
  await page.locator('#quick-modal button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById('quick-modal').open);
  await page.waitForTimeout(1200);
  let health = await json(page, '/api/health/state');
  check(health.state.medications.filter(item => item.name === 'Synthetic manual medicine').length === 1, 'Manual medicine reaches the real synthetic health handler once');
  await goto(page, 'appointments');
  await page.locator('#view-appointments [data-modal="appointment"]').click();
  const form = page.locator('[data-modal-form="appointment"]');
  await form.locator('[name="title"]').fill('Synthetic visit');
  await form.locator('[name="date"]').fill('2026-10-20');
  await form.locator('[name="time"]').fill('10:30');
  await form.locator('[type="submit"]').click(); await page.waitForTimeout(1200);
  check((await json(page, '/api/health/state')).state.appointments.some(item => item.title === 'Synthetic visit'), 'Appointment save uses the same scoped health handler');
  await goto(page, 'health');
  await page.locator('#view-health [data-modal="health"]').first().click();
  await page.locator('[data-modal-form="health"] [name="notes"]').fill('Synthetic private note for self');
  await page.locator('[data-modal-form="health"] [type="submit"]').click(); await page.waitForTimeout(1200);
  check((await json(page, '/api/health/state')).state.profile.notes === 'Synthetic private note for self', 'Health notes save for the verified owner');
  await goto(page);
  const chatBefore = requests.filter(item => item.path === '/api/chat').length;
  await page.locator('.home-briefing-link').click();
  check(requests.filter(item => item.path === '/api/chat').length === chatBefore, 'Opening the health overview sends no AI request');
  await page.locator('[data-generate-today-briefing]').click();
  check(requests.filter(item => item.path === '/api/chat').length === chatBefore, 'Briefing without consent sends no AI request');
  await page.locator('[data-briefing-medication]').first().check();
  await page.locator('[data-briefing-consent]').check();
  await json(page, '/__test/latency?providerMs=500');
  await page.locator('[data-generate-today-briefing]').evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(() => document.getElementById('today-ai-output').textContent.includes('Synthetic educational'));
  check(requests.filter(item => item.path === '/api/chat').length === chatBefore + 1, 'Double activation sends one selected-record briefing');
  check(!await page.locator('[data-briefing-consent]').isChecked(), 'Briefing consent is cleared after this request');
  await axe(page, 'briefing dialog'); await page.keyboard.press('Escape');
  await page.locator('[data-open-medication-scanner]').first().click();
  check(await page.locator('#medication-scanner-modal').evaluate(e => e.open), 'Scanner choices open without starting a camera');
  check(await page.locator('#medication-scanner-video').evaluate(e => !e.srcObject), 'No camera stream starts on scanner open');
  await axe(page, 'scanner dialog'); await page.keyboard.press('Escape');
  await goto(page, 'documents');
  await page.locator('#document-upload-inline').setInputFiles({ name: 'synthetic-note.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic document only') });
  await page.waitForFunction(() => document.getElementById('view-documents').textContent.includes('synthetic-note.txt'));
  const documents = await json(page, '/api/documents');
  check(documents.documents.some(doc => (doc.name || doc.title).includes('synthetic-note')), 'Supported synthetic file is stored through the scoped mocked Blob handler');
  await page.locator('#document-upload-inline').setInputFiles({ name: 'unsupported.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('Synthetic only') });
  check((await json(page, '/api/documents')).documents.length === documents.documents.length, 'Unsupported file leaves the library unchanged');
  await goto(page, 'profile');
  await page.locator('[data-add-person]').click();
  await page.locator('[data-modal-form="managed-person"] [name="name"]').fill('Synthetic adult');
  await page.locator('[name="authorityBasis"]').selectOption('adult_permission_or_authority');
  await page.locator('[name="authorityConfirmed"]').check();
  await page.locator('[data-modal-form="managed-person"] [type="submit"]').click();
  await page.waitForFunction(() => document.getElementById('active-person-select').options.length === 2);
  const people = await json(page, '/api/health/profiles'); const person = people.profiles.find(p => p.name === 'Synthetic adult');
  await page.locator('#active-person-select').selectOption(person.id);
  await page.waitForFunction(() => document.getElementById('active-person-select').value !== 'self' && !document.getElementById('active-person-select').disabled);
  check(!await page.locator('#view-health').textContent().then(text => text.includes('Synthetic private note for self')), 'Switching people clears the self note from the displayed record');
  await page.locator('#active-person-select').selectOption('self');
  await page.waitForFunction(() => document.getElementById('active-person-select').value === 'self' && !document.getElementById('active-person-select').disabled);
  }
  await goto(page, 'medications');
  await page.locator('.sidebar .nav-item[data-view="appointments"]').click();
  await page.goBack();
  check(await page.locator('#view-medications').isVisible(), 'Browser Back restores the prior Hub view');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ['today', 'medications', 'appointments', 'health', 'documents', 'profile', 'ask']) {
      await goto(page, view); await axe(page, `${view} at ${width}px`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} reflows at ${width}px`);
      if ([1440, 390].includes(width) && ['today', 'medications', 'profile'].includes(view)) await page.screenshot({ path: path.join(output, `after-${view}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 768, height: 1000 });
  await goto(page, 'medications');
  await page.addStyleTag({ content: 'html {font-size:200% !important} * {letter-spacing:.12em !important;word-spacing:.16em !important;line-height:1.5 !important} p {margin-bottom:2em !important}' });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Medicine page reflows with doubled root text and WCAG text spacing');
  await page.screenshot({ path: path.join(output, 'after-medications-text-spacing.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/subscription', '/research', '/download', '/medication-list-template', '/appointment-checklist']) {
    await page.goto(origin + route); await axe(page, route + ' mobile');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' mobile reflow');
    if (route === '/') await page.screenshot({ path: path.join(output, 'after-home-mobile.png'), fullPage: true });
  }
  check(await page.locator('body').textContent().then(text => !text.includes('Synthetic private note')), 'Public resources contain no private record content');
  await page.goto(origin + '/subscription');
  check(await page.locator('[data-subscribe]').isDisabled(), 'Integrated preview billing remains unavailable');
  await json(page, '/__test/auth?auto=0&fail=1');
  await page.goto(origin + '/health-hub#profile');
  await page.waitForFunction(() => document.querySelector('.profile-trigger-name').textContent === 'Sign in');
  check(!await page.locator('body').textContent().then(text => text.includes('Synthetic private note for self')), 'Authentication failure hides owner health content');
  check(errors.length === 0, 'No page JavaScript errors in tested screens or flows');
  fs.writeFileSync(path.join(output, 'web-verification.json'), JSON.stringify({ synthetic: true, checks, audits, errors, requests, limitations: ['No actual deployed OAuth/KV/Blob E2E', 'No real paid API or camera hardware', 'Chromium only; screen-reader and native Android QA remain separate', 'Automated audits and sampled flows do not establish WCAG conformance'] }, null, 2));
  console.log(JSON.stringify({ checksPassed: checks.length, axeStates: audits.length, javascriptErrors: errors, evidence: output, paidCalls: 0, externalHealthStorage: 0 }, null, 2));
})().catch(error => {
  fs.writeFileSync(path.join(output, 'web-verification-failure.json'), JSON.stringify({ error: error.stack, checks, audits, errors }, null, 2));
  console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); server.kill('SIGTERM'); });
