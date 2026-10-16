const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the locally installed Playwright module.');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const base = process.env.COMPANION_BASE_URL || 'http://127.0.0.1:4196';
const evidence = process.env.COMPANION_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-companion-evidence');
fs.mkdirSync(evidence, { recursive: true });
const report = { base, cases: [], screenshots: [], axe: [] };

async function audit(page, label) {
  await page.addScriptTag({ url: base + '/__qa/axe.min.js' });
  const result = await page.evaluate(async () => {
    const outcome = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return outcome.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target.join(' ')) }));
  });
  report.axe.push({ label, violations: result });
  assert.deepEqual(result, [], label + ' accessibility violations');
}
async function widthOkay(page, label) {
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  assert(dimensions.scroll <= dimensions.view + 1, `${label} horizontal overflow ${JSON.stringify(dimensions)}`);
  report.cases.push({ label, result: 'passed', dimensions });
}
async function capture(page, label) {
  const file = path.join(evidence, label + '.png');
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => { const link = document.querySelector('.doctorai-skip-link'); if (link) link.hidden = true; });
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  await page.evaluate(() => { const link = document.querySelector('.doctorai-skip-link'); if (link) link.hidden = false; });
  report.screenshots.push(file);
}
function futureDate() {
  const day = new Date(); day.setDate(day.getDate() + 30);
  return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 780 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const apiCalls = [];
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url()); });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/next-steps-demo#plan', { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
      assert.equal(await page.locator('a[data-companion-tab="plan"]').getAttribute('aria-current'), 'page');
      await widthOkay(page, `${width} empty plan`);
      await audit(page, `${width} empty plan`);
      await page.locator('#step-form button[type="submit"]').click();
      assert.match(await page.locator('#step-error').innerText(), /Write one action/);
      await page.locator('#step-title').fill('Ask when my result may be ready');
      await page.locator('#step-source').fill('My own appointment note: I want to ask the clinic about timing.');
      await page.locator('#step-date').fill(futureDate());
      await page.locator('#step-form button[type="submit"]').click();
      assert.equal(await page.locator('#draft-steps .step-card').count(), 1);
      assert.match(await page.locator('#draft-steps').innerText(), /From your note/);
      await page.locator('[data-confirm-step]').click();
      assert.equal(await page.locator('#plan-steps .step-card').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.matches('[data-step-progress]')), true, 'focus follows confirmed step');
      await page.locator('[data-step-progress]').selectOption('requested');
      assert.equal(await page.locator('#waiting-steps .step-card').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.matches('[data-step-progress]')), true, 'focus follows moved step');
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('#waiting-steps .step-card').count(), 1, 'demo should survive reload in the same tab');
      await widthOkay(page, `${width} populated plan`);
      await capture(page, `plan-${width}`);
      await page.locator('[data-preview-brief]').click();
      assert(await page.locator('#brief-dialog').evaluate(dialog => dialog.open));
      assert.match(await page.locator('#brief-steps').innerText(), /Ask when my result may be ready/);
      await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
      await page.locator('[data-print-brief]').click();
      assert.equal(await page.evaluate(() => window.__printed), true, 'print remains user initiated');
      await page.locator('[data-close-brief]').first().click();
      await page.locator('[data-edit-step]').click();
      assert.equal(await page.locator('#step-title').inputValue(), 'Ask when my result may be ready');
      await page.locator('#step-title').fill('Ask the clinic when my result may be ready');
      await page.locator('#step-form button[type="submit"]').click();
      assert.equal(await page.locator('#draft-steps .step-card').count(), 1, 'editing requires fresh review');
      await page.locator('[data-confirm-step]').click();
      await page.locator('[data-load-example]').click();
      assert.match(await page.locator('#draft-steps').innerText(), /Fictional example/);
      await page.locator('#draft-steps [data-edit-step]').click();
      await page.locator('#step-title').fill('My own revised question');
      await page.locator('#step-source').fill('My own note, not the fictional sample.');
      await page.locator('#step-form button[type="submit"]').click();
      assert.doesNotMatch(await page.locator('#draft-steps').innerText(), /Fictional example/);
      await page.locator('#draft-steps [data-remove-step]').click();
      await page.locator('#step-title').fill('<img src=x onerror=alert(1)>');
      await page.locator('#step-source').fill('A literal note, not markup.');
      await page.locator('#step-form button[type="submit"]').click();
      assert.equal(await page.locator('#draft-steps img').count(), 0, 'entered text must never become markup');
      await page.locator('#draft-steps [data-remove-step]').click();
      await page.locator('a[data-companion-tab="say"]').click();
      await page.waitForFunction(() => !document.querySelector('#panel-say').hidden);
      assert.equal(await page.locator('#panel-say').isVisible(), true);
      await page.locator('#say-concern').fill('I would like to understand the next step.');
      await page.locator('#say-context').fill('This is my own note.');
      await page.locator('#say-question').fill('What should I bring to the next visit?');
      await page.locator('#say-form button[type="submit"]').click();
      assert.match(await page.locator('#say-output').inputValue(), /This is my own note/);
      await page.locator('#say-output').fill('My edited wording for the next visit.');
      await page.locator('[data-save-question]').click();
      assert.match(await page.locator('#question-list').innerText(), /My edited wording/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('#panel-say').isVisible(), true);
      assert.equal(await page.locator('#say-output').inputValue(), 'My edited wording for the next visit.');
      await widthOkay(page, `${width} wording`);
      await audit(page, `${width} wording`);
      if (width === 390) await capture(page, 'say-390');
      await page.locator('a[data-companion-tab="family"]').click();
      await page.waitForFunction(() => !document.querySelector('#panel-family').hidden);
      assert.equal(await page.locator('#panel-family').isVisible(), true);
      assert.match(await page.locator('#family-state').innerText(), /No one has access/);
      await page.locator('[name="family-scope"][value="summary"]').check();
      await page.locator('#family-expiry').fill(futureDate());
      await page.locator('#family-verify').check();
      await page.locator('#family-form button[type="submit"]').click();
      assert.equal(await page.locator('[data-approve-family]').isEnabled(), true);
      await page.locator('[data-approve-family]').click();
      assert.match(await page.locator('#family-state').innerText(), /No invitation was sent and no one has access/);
      assert.equal(await page.evaluate(() => document.activeElement.matches('[data-revoke-family]')), true, 'focus moves to revoke after simulated approval');
      assert.match(await page.locator('#family-share-preview').innerText(), /fictional preview only/i);
      assert.doesNotMatch(await page.locator('#family-share-preview').innerText(), /billing/i);
      await widthOkay(page, `${width} family preview`);
      await audit(page, `${width} family preview`);
      if (width === 1440) await capture(page, 'family-1440');
      await page.locator('[data-revoke-family]').click();
      assert.match(await page.locator('#family-state').innerText(), /No one has access/);
      assert.equal(apiCalls.length, 0, 'prototype must not call site APIs');
      assert.deepEqual(errors, [], `page errors at ${width}`);
      if (width === 1440) {
        await page.evaluate(() => { const channel = new BroadcastChannel('doctorai-companion-demo-v1'); channel.postMessage({ type: 'clear' }); channel.close(); });
        await page.waitForFunction(() => document.querySelector('#question-count').textContent === '0');
        assert.equal(await page.locator('#plan-count').innerText(), '0');
        report.cases.push({ label: 'cross-tab account-change clear signal', result: 'passed' });
      }
      if (width === 390) {
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-clear-demo]').click();
        await page.reload({ waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('#draft-count').innerText(), '0');
        assert.equal(await page.locator('#question-count').innerText(), '0');
        assert.match(await page.locator('#family-state').innerText(), /No one has access/);
        report.cases.push({ label: '390 reset and reload', result: 'passed' });
      }
      await page.goto(base + '/health-hub#appointments', { waitUntil: 'domcontentloaded' });
      const consent = page.locator('#storage-consent [data-device-storage-session]');
      if (await consent.isVisible()) await consent.click();
      await page.locator('#view-diary .hub-companion-link').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#view-diary .hub-companion-link').getAttribute('href'), '/next-steps-demo');
      await widthOkay(page, `${width} hub companion entry`);
      if (width === 390) { await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('show')); await capture(page, 'hub-entry-390'); }
      await page.locator('#view-diary .hub-companion-link').click();
      await page.waitForURL('**/next-steps-demo');
      assert.equal(await page.locator('#panel-plan').isVisible(), true);
      report.cases.push({ label: `${width} nested navigation opens isolated preview`, result: 'passed' });
      await context.close();
    }
    const isolation = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const fresh = await isolation.newPage();
    await fresh.goto(base + '/next-steps-demo#family');
    assert.equal(await fresh.locator('#draft-count').innerText(), '0');
    assert.match(await fresh.locator('#family-state').innerText(), /No one has access/);
    await fresh.keyboard.press('Tab');
    assert.equal(await fresh.evaluate(() => document.activeElement.classList.contains('doctorai-skip-link')), true);
    assert.equal(await fresh.locator('.doctorai-skip-link').isVisible(), true);
    await fresh.keyboard.press('Enter');
    assert.equal(await fresh.evaluate(() => document.activeElement.id), 'main');
    await isolation.close();
    report.cases.push({ label: 'separate browser context has no demo records', result: 'passed' });
    report.cases.push({ label: 'keyboard skip link reaches main content', result: 'passed' });
    fs.writeFileSync(path.join(evidence, 'companion-qa.json'), JSON.stringify(report, null, 2));
    console.log(`Companion browser: ${report.cases.length} checks, ${report.axe.length} axe states, ${report.screenshots.length} screenshots passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
