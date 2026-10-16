'use strict';
// Fictional records in fresh browser contexts. Never reads a real profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TODAY_BASE_URL || 'http://127.0.0.1:4198';
const out = process.env.TODAY_EVIDENCE_DIR || path.join(require('node:os').tmpdir(), 'doctorai-today-records');
fs.mkdirSync(out, { recursive: true });
const longName = 'Fictional extended-release medicine with a long brand and full ingredient identity';
const populated = {
  medications: [{ id: 'one', name: longName, dose: '250 mg', time: '08:00' }, { id: 'two', name: 'Paracetamol', dose: '500 mg' }, { id: 'old', name: 'Stopped fictional medicine', status: 'stopped' }],
  profile: { conditionEntries: [{ id: 'custom:one', label: 'Asthma', status: 'current' }, { id: 'custom:old', label: 'Historical fictional condition', status: 'historical' }], allergyEntries: [{ id: 'custom:allergy', substance: 'Penicillin', reaction: 'Rash', certainty: 'suspected' }] },
  timeline: [{ id: 'question', source: 'user-question', type: 'question', date: '2026-10-16', description: 'Could I discuss my saved medicine list at my next visit?' }],
  appointments: [{ id: 'visit', title: 'Review appointment', provider: 'Fictional clinic', date: '2099-10-20', time: '10:30' }]
};
const report = { checks: [], axe: [], errors: [], screenshots: [] };
async function mock(context, account = () => null, cloud = () => ({})) {
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/google') { const user = account(); return route.fulfill({ json: user ? { authenticated: true, user, medicationLoginId: 'a'.repeat(64) } : { authenticated: false } }); }
    if (url.pathname === '/api/health/state') return route.fulfill({ json: { state: cloud(), updatedAt: Date.now() } });
    return route.fulfill({ json: { active: false, authenticated: false } });
  });
}
async function seed(context, data) {
  await context.addInitScript(value => {
    if (sessionStorage.getItem('today-fixture')) return;
    sessionStorage.setItem('today-fixture', 'yes');
    const prefix = 'doctorai-health-hub-';
    localStorage.setItem(prefix + 'device-storage-consent', 'yes');
    for (const [key, item] of Object.entries(value)) localStorage.setItem(prefix + key, JSON.stringify(item));
  }, data);
}
async function capture(page, name) { await page.screenshot({ path: path.join(out, name), fullPage: true }); report.screenshots.push(name); }
async function verifyLayout(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, label + ' overflow');
  for (const selector of ['#view-today [aria-label="Add medicine"]', '#view-today [data-view="medications"]', '#view-today [data-open-medication-scanner]']) {
    const rect = await page.locator(selector).boundingBox(); assert.ok(rect && rect.height >= 43 && rect.width >= 43, label + ' touch target: ' + selector);
  }
  if (process.env.AXE_URL) {
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ url: process.env.AXE_URL });
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } })).violations.map(v => ({ id:v.id, targets:v.nodes.map(n=>n.target) })));
    report.axe.push({ label, violations }); assert.deepEqual(violations, [], label + ' accessibility');
  }
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440,390,320]) {
      for (const mode of ['empty','populated']) {
        const context = await browser.newContext({ viewport:{width,height:width===1440?1000:844}, serviceWorkers:'block', reducedMotion:'reduce' });
        await mock(context); await seed(context, mode==='populated'?populated:{});
        const page = await context.newPage(); page.on('pageerror',error=>report.errors.push(error.message));
        await page.goto(base+'/health-hub#today', {waitUntil:'networkidle'});
        await page.waitForFunction(()=>document.querySelector('#today-record-status').hidden);
        const medicines=page.locator('#today-compact-medicine-list');
        if(mode==='empty') { assert.match(await medicines.textContent(),/No current medicines saved/); assert.equal(await page.locator('body').getAttribute('data-health-alert-level'),'neutral'); }
        else {
          assert.equal(await medicines.locator('li').count(),2); assert.ok((await medicines.textContent()).includes(longName)); assert.doesNotMatch(await medicines.textContent(),/Stopped fictional/);
          assert.match(await page.locator('#today-condition-list').textContent(),/Asthma/); assert.doesNotMatch(await page.locator('#today-condition-list').textContent(),/Historical fictional/);
          assert.match(await page.locator('#today-allergy-list').textContent(),/Penicillin[\s\S]*Rash[\s\S]*Possible reaction/);
          assert.match(await page.locator('#today-compact-appointment-copy').textContent(),/Review appointment/);
        }
        await verifyLayout(page,`${mode}-${width}`); await capture(page,`after-${mode}-${width}.png`);
        if(mode==='empty') {
          const add=page.locator('#view-today [aria-label="Add medicine"]'); await add.focus(); await page.keyboard.press('Enter');
          await page.locator('#quick-modal input[name="name"]').fill('Fictional saved medicine'); await page.locator('#quick-modal input[name="dose"]').fill('25 mg'); await page.locator('#quick-modal button[type="submit"]').click();
          await page.goto(base+'/health-hub#today'); assert.match(await medicines.textContent(),/Fictional saved medicine[\s\S]*25 mg/);
          await medicines.locator('[data-edit-medication]').click(); await page.locator('#quick-modal input[name="dose"]').fill('50 mg'); await page.locator('#quick-modal button[type="submit"]').click();
          await page.goto(base+'/health-hub#today'); assert.match(await medicines.textContent(),/50 mg/);
          await page.locator('#view-today [data-view="medications"]').click(); assert.equal(await page.locator('#view-medications').isVisible(),true); assert.equal(await page.locator('body').getAttribute('data-hub-panel'),'medications');
          page.on('dialog',d=>d.accept()); await page.locator('#medication-library [data-delete-medication]').click(); await page.goto(base+'/health-hub#today'); assert.match(await medicines.textContent(),/No current medicines saved/);
          await page.locator('#view-today [aria-label="Add condition"]').click(); assert.equal(await page.locator('#term-condition-search').evaluate(e=>e===document.activeElement),true);
          await page.locator('[data-term-other="condition"]').click(); await page.locator('#term-condition-search').fill('Fictional current condition'); await page.locator('[data-term-add="condition"]').click(); await page.locator('#quick-modal button[type="submit"]').click(); assert.match(await page.locator('#today-condition-list').textContent(),/Fictional current condition/);
          await page.locator('#view-today [aria-label="Add allergy or reaction"]').click(); assert.equal(await page.locator('#term-substance-search').evaluate(e=>e===document.activeElement),true); await page.keyboard.press('Escape');
          await page.locator('#view-today [data-open-medication-scanner]').click(); assert.equal(await page.locator('#view-medications').isVisible(),true); assert.equal(await page.locator('#google-signin-modal').isVisible(),true); await page.keyboard.press('Escape');
          report.checks.push(`${width}: keyboard Add, save/edit/remove medicine, nested Manage, targeted condition/allergy forms and Scan sign-in gate`);
        }
        if(mode==='populated'&&width===1440) {
          await page.evaluate(()=>document.documentElement.style.zoom='2'); await verifyLayout(page,'200-percent-css-zoom'); assert.equal(await page.locator('.today-records-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1,'Record cards stack at 200% zoom'); await capture(page,'after-zoom-200.png');
        }
        report.checks.push(`${mode}-${width}: real renderer, full medicine identity, current records and layout`);
        await context.close();
      }
    }
    const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
    let user={sub:'fictional-a',email:'a@example.invalid',name:'Fictional A'};
    await mock(c,()=>user,()=>user.sub==='fictional-a'?populated:{}); await seed(c,{medications:[{id:'legacy',name:'Anonymous record must stay separate'}]});
    const p=await c.newPage();p.on('pageerror',error=>report.errors.push(error.message));await p.goto(base+'/health-hub#today',{waitUntil:'networkidle'});
    assert.match(await p.locator('#today-compact-medicine-list').textContent(),/extended-release/); assert.doesNotMatch(await p.locator('#today-compact-medicine-list').textContent(),/Anonymous record/);
    user={sub:'fictional-b',email:'b@example.invalid',name:'Fictional B'};await p.reload({waitUntil:'networkidle'}); assert.match(await p.locator('#today-compact-medicine-list').textContent(),/No current medicines saved/); assert.doesNotMatch(await p.locator('#today-condition-list').textContent(),/Asthma/);
    await c.route('**/api/health/state',r=>r.fulfill({status:503,json:{error:'Fictional unavailable response'}}));await p.reload({waitUntil:'networkidle'});assert.match(await p.locator('#today-record-status').textContent(),/Account sync is unavailable/);assert.match(await p.locator('#today-compact-medicine-list').textContent(),/available in this view/);assert.equal(await p.locator('#view-today > .hub-alert-shortcut').isVisible(),false);assert.equal(await p.locator('#today-measurements-link').textContent(),'Measurements'); await capture(p,'after-account-unavailable-390.png');
    await c.unroute('**/api/health/state');await p.locator('[data-today-retry]').click();await p.waitForFunction(()=>document.querySelector('#today-record-status').hidden);
    report.checks.push('Signed accounts A/B and anonymous records stay isolated; account error is explicit; retry loads the current account');await c.close();
    const delayed=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});let release;const gate=new Promise(resolve=>{release=resolve});await delayed.route('**/api/auth/google',async route=>{await gate;await route.fulfill({json:{authenticated:false}})});const d=await delayed.newPage();await d.goto(base+'/health-hub#today',{waitUntil:'domcontentloaded'});assert.match(await d.locator('#today-record-status').textContent(),/Loading/);assert.equal(await d.locator('#view-today [aria-label="Add medicine"]').isDisabled(),true);await capture(d,'after-loading-390.png');release();await d.waitForFunction(()=>document.querySelector('#today-record-status').hidden);await delayed.close();report.checks.push('Pending identity shows loading without false empty records or editable stale content');
    assert.deepEqual(report.errors,[]);
    fs.writeFileSync(path.join(out,'today-records-qa.json'),JSON.stringify({result:'passed',...report},null,2));
    console.log(`Today records passed: ${report.checks.length} journey groups, ${report.axe.length} accessibility states, ${report.screenshots.length} screenshots.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
