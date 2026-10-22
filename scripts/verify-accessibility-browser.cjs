'use strict';
// Fresh signed-out local fixture, synthetic records, and no external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.ACCESSIBILITY_EVIDENCE_DIR;
const baseline = process.env.ACCESSIBILITY_BASELINE === '1';
const sourceRef = process.env.ACCESSIBILITY_SOURCE_REF;
const sourceFiles = new Map();
if (out) fs.mkdirSync(out, {recursive:true});
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res)=>{
  let route = new URL(req.url,'http://localhost').pathname;
  if (route === '/') route = '/index.html';
  if (!path.extname(route)) route += '.html';
  const file = path.resolve(root, '.'+route);
  if (!file.startsWith(root+path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) {res.writeHead(404).end();return;}
  res.writeHead(200, {'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});
  if (sourceRef && /\.(html|css|js)$/.test(file)) {
    if (!sourceFiles.has(file)) sourceFiles.set(file, execFileSync('git',['show',sourceRef+':'+path.relative(root,file).split(path.sep).join('/')],{cwd:root,maxBuffer:32*1024*1024}));
    res.end(sourceFiles.get(file));
  } else fs.createReadStream(file).pipe(res);
});
const report = {baseline, sourceRef:sourceRef || 'working tree', checks:[], failures:[], errors:[], screenshots:[]};
function check(value, expected, label) {
  report.checks.push({label,actual:value,expected});
  if (baseline) {if (JSON.stringify(value)!==JSON.stringify(expected)) report.failures.push(label);}
  else assert.deepEqual(value, expected, label);
}
async function shot(page, name) {
  if (!out) return;
  await page.screenshot({path:path.join(out,name+'.png')});
  report.screenshots.push(name+'.png');
}
async function visibleFocus(page) {
  return page.evaluate(()=>{const e=document.activeElement;return e!==document.body && !!e?.getClientRects().length && !e.closest('[hidden],[inert]');});
}
async function ring(page, selector) {
  return page.locator(selector).first().evaluate(e=>{const s=getComputedStyle(e);return {color:s.outlineColor,width:parseFloat(s.outlineWidth),style:s.outlineStyle};});
}
function contrastAgainstWhite(color) {
  const channels = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!channels) return 0;
  const linear = channels.slice(1).map(Number).map(channel=>{const value=channel/255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;});
  return 1.05/(0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2]+0.05);
}
async function keyboardFocus(page, selector) {
  // Arrive by a real backward Tab, including controls initially below the fold.
  await page.locator(selector).first().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({...(process.env.PLAYWRIGHT_USE_BUNDLED_BROWSER==='1'?{}:{channel:'msedge'}),headless:true});
  try {
    for (const width of [1440,720,390,320]) {
      const c = await browser.newContext({viewport:{width,height:width>800?1000:844},deviceScaleFactor:width===720?2:1,reducedMotion:'reduce',serviceWorkers:'block'});
      await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/auth/google'?{authenticated:false}:{active:false,authenticated:false}});return route.continue();});
      await c.addInitScript(()=>localStorage.setItem('doctorai-health-hub-device-storage-consent','yes'));
      const page = await c.newPage();
      page.on('pageerror',e=>report.errors.push(e.message));
      page.on('dialog',d=>d.accept());
      await page.goto(base+'/health-hub#medications',{waitUntil:'networkidle'});
      check(await page.locator('#today-record-status').evaluate(e=>[e.getAttribute('role'),e.getAttribute('aria-live')]),['status','polite'],width+': loading and sync status is announced politely');
      if(width<=800){
        check(await page.locator('[data-mobile-menu]').getAttribute('aria-label'),'Open Health Hub menu',width+': mobile menu has a clear accessible name');
        check(await page.locator('[data-mobile-menu]').evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;}),true,width+': mobile menu meets the 44px touch target');
        check(await page.locator('.mobile-bottom-nav-item').evaluateAll(items=>items.length===4&&items.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})),true,width+': all four mobile destinations meet 44px touch targets');
      }
      await page.keyboard.press('Tab');
      check(await page.locator('.skip-link').evaluate(e=>e===document.activeElement),true,width+': skip link is first keyboard stop');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(30);
      check(await page.locator('.view.active > .page-heading h1').evaluate(e=>e===document.activeElement),true,width+': skip link focuses the active content heading');
      check(new URL(page.url()).hash,'#medications',width+': skip link preserves the active route');
      await page.keyboard.press('Tab');
      check(await page.locator('.view.active').evaluate(e=>e.contains(document.activeElement)),true,width+': next Tab stays in active content after skip');
      await page.goto(base+'/health-hub#medications',{waitUntil:'networkidle'});
      if (width<=800) {
        const menu = page.locator('[data-mobile-menu]');
        await menu.focus();
        await page.keyboard.press('Enter');
        check(await menu.getAttribute('aria-expanded'),'true',width+': opening the menu updates its expanded state');
        check(await menu.getAttribute('aria-label'),'Close Health Hub menu',width+': open menu exposes a close action');
        await page.waitForFunction(()=>{const current=document.querySelector('#category-bar [aria-current="page"]')||document.querySelector('#category-bar [data-view]');return current===document.activeElement;});
        check(await page.locator('#category-bar').evaluate(e=>e.contains(document.activeElement)),true,width+': opening the menu moves focus to the current destination');
        await shot(page,'mobile-menu-keyboard-'+width);
        await page.keyboard.press('Tab');
        check(await page.locator('#category-bar').evaluate(e=>e.contains(document.activeElement)),true,width+': Tab advances through menu destinations');
        await page.keyboard.press('Escape');
        check(await menu.getAttribute('aria-expanded'),'false',width+': Escape closes the mobile menu');
        check(await menu.getAttribute('aria-label'),'Open Health Hub menu',width+': closed menu exposes its open action');
        check(await menu.evaluate(e=>e===document.activeElement),true,width+': Escape restores focus to the menu trigger');
      }

      const add = '#view-medications [data-modal="medication"]';
      await keyboardFocus(page,add);await page.keyboard.press('Enter');
      await page.locator('#quick-modal').waitFor({state:'visible'});
      check(await page.locator('#quick-modal').evaluate(e=>e.contains(document.activeElement)),true,width+': dialog receives focus');
      await keyboardFocus(page,'#quick-modal [data-close-modal]');
      const dialogRing = await ring(page,'#quick-modal [data-close-modal]');
      check(dialogRing.color,'rgb(7, 89, 182)',width+': dialog focus ring is opaque');
      await shot(page,'dialog-focus-'+width);
      const tabSteps = Math.min(30, await page.locator('#quick-modal :is(input, select, textarea, button, a, summary)').count()+1);
      const obscured = [];
      for (let step=0;step<tabSteps;step++) {
        await page.keyboard.press('Tab');
        const issue = await page.evaluate(()=>{
          const modal=document.querySelector('#quick-modal'), e=document.activeElement;
          // Native dialogs may briefly place focus on the document while
          // cycling through browser chrome. Check page controls when focused.
          if (!modal.contains(e)) return e===document.body ? '' : 'Focus left the modal';
          if (e.closest('.modal-header')) return '';
          const r=e.getBoundingClientRect(), top=modal.querySelector('.modal-header').getBoundingClientRect().bottom, bottom=modal.getBoundingClientRect().bottom;
          return r.bottom<=top || r.top>=bottom ? (e.name||e.textContent||e.tagName).slice(0,80) : '';
        });
        if (issue) obscured.push(issue);
      }
      check(obscured,[],width+': dialog Tab traversal never completely obscures a focused control');
      await page.locator('#quick-modal button[type="submit"]').click();
      const medicineName = page.locator('#quick-modal [name="name"]');
      check(await medicineName.evaluate(e=>e===document.activeElement),true,width+': missing required medicine name receives focus');
      check(await medicineName.getAttribute('aria-invalid'),'true',width+': missing medicine name is announced as invalid');
      check(await medicineName.evaluate(e=>e.getAttribute('aria-describedby')?.split(/\s+/).includes('medication-form-error')),true,width+': field description includes its validation error');
      check(await page.locator('#medication-form-error').getAttribute('role'),'alert',width+': validation error is announced to screen readers');
      check((await page.locator('#medication-form-error').textContent()).trim(),'Medication name is required. Copy it from your label.',width+': validation alert explains the required field');
      await medicineName.fill('Synthetic accessibility record');
      check(await medicineName.getAttribute('aria-invalid'),null,width+': editing clears the invalid state');
      check(await medicineName.evaluate(e=>!e.getAttribute('aria-describedby')?.split(/\s+/).includes('medication-form-error')),true,width+': editing removes the stale field error association');
      check((await page.locator('#medication-form-error').textContent()).trim(),'',width+': editing clears the stale validation alert');
      await page.locator('#quick-modal [name="dose"]').fill('Fictional strength');
      await page.locator('#quick-modal button[type="submit"]').click();
      await page.waitForFunction(()=>!document.querySelector('#quick-modal').open);
      check(await visibleFocus(page),true,width+': add save retains a visible keyboard position');
      check(await page.locator('#medication-library .library-item-actions button').evaluateAll(items=>items.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})),true,width+': medicine actions have 44px targets');
      if (width<=800) check(await page.locator('#medication-library .library-copy').first().evaluate(e=>e.getBoundingClientRect().width>=180),true,width+': mobile medicine copy has a readable column');

      const reactionAction = page.locator('#medication-library [data-record-medication-reaction]').first();
      await reactionAction.evaluate(e=>{const details=e.closest('details');if(details)details.open=true;});
      await keyboardFocus(page,'#medication-library [data-record-medication-reaction]');
      await page.keyboard.press('Enter');
      await page.locator('#quick-modal').waitFor({state:'visible'});
      const reaction = page.locator('#quick-modal [name="reaction"]');
      await page.locator('#quick-modal button[type="submit"]').click();
      check(await reaction.getAttribute('aria-invalid'),'true',width+': missing reaction details are marked invalid');
      check(await reaction.evaluate(e=>e.getAttribute('aria-describedby')?.split(/\s+/).includes('medication-form-error')),true,width+': reaction field references the announced error');
      check(await reaction.evaluate(e=>e.getAttribute('aria-describedby')?.split(/\s+/).includes('medication-reaction-help')),true,width+': reaction field keeps its original help text');
      check(await page.locator('#medication-form-error').getAttribute('role'),'alert',width+': reaction validation error is announced to screen readers');
      check((await page.locator('#medication-form-error').textContent()).trim(),'Describe what you noticed.',width+': reaction validation explains what is missing');
      await reaction.fill('Synthetic observation only');
      check(await reaction.getAttribute('aria-invalid'),null,width+': editing clears the reaction error state');
      check(await reaction.evaluate(e=>!e.getAttribute('aria-describedby')?.split(/\s+/).includes('medication-form-error')&&e.getAttribute('aria-describedby')?.split(/\s+/).includes('medication-reaction-help')),true,width+': editing removes only the error description');
      check((await page.locator('#medication-form-error').textContent()).trim(),'',width+': editing clears the reaction validation alert');
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('#quick-modal').open);

      const edit = '#medication-library [data-edit-medication]';
      await keyboardFocus(page,edit);await page.keyboard.press('Enter');
      await page.locator('#quick-modal [name="dose"]').fill('Edited fictional strength');
      await page.locator('#quick-modal button[type="submit"]').click();
      await page.waitForFunction(()=>!document.querySelector('#quick-modal').open);
      check(await visibleFocus(page),true,width+': edit save restores focus after list rerender');
      await shot(page,'medicine-after-save-'+width);
      await keyboardFocus(page,'#medication-library [data-delete-medication]');await page.keyboard.press('Enter');
      check(await visibleFocus(page),true,width+': delete retains a visible keyboard position');
      check(await page.locator('#medication-library [data-edit-medication]').count(),0,width+': synthetic medicine removed');

      await page.goto(base+'/health-hub#profile',{waitUntil:'networkidle'});
      await page.locator('#health-memory-details').evaluate(e=>e.open=true);
      await keyboardFocus(page,'#health-memory-toggle');
      const switchRing = await ring(page,'#health-memory-toggle + span');
      await shot(page,'memory-switch-focus-'+width);
      check(switchRing.color,'rgb(7, 89, 182)',width+': hidden checkbox paints focus on visible switch');
      check(switchRing.width>=3,true,width+': switch focus ring width');
      const switchTarget = await page.locator('#health-memory-toggle').evaluate(e=>{const r=e.closest('label').getBoundingClientRect();return r.width>=44&&r.height>=44;});
      check(switchTarget,true,width+': switch has 44px touch target');

      await keyboardFocus(page,'#view-profile [data-open-profile]');await page.keyboard.press('Enter');
      await page.waitForFunction(()=>!document.querySelector('#profile-drawer').hidden);
      await page.waitForTimeout(30);
      check(await page.locator('.drawer-panel').evaluate(e=>e.contains(document.activeElement)),true,width+': drawer starts focus inside named dialog');
      check(await page.locator('#hub-shell').evaluate(e=>e.inert),true,width+': drawer removes background from interaction/accessibility tree');
      const last = '.drawer-panel .drawer-signout';
      await keyboardFocus(page,last);await page.keyboard.press('Tab');
      check(await page.locator('.drawer-panel').evaluate(e=>e.contains(document.activeElement)),true,width+': drawer wraps Tab inside panel');
      await page.locator('.drawer-panel [data-show-privacy]').click();
      check(await page.locator('#privacy-modal').isVisible(),true,width+': drawer can open native privacy dialog');
      await page.keyboard.press('Escape');
      check(await page.locator('#privacy-modal').isVisible(),false,width+': Escape closes the nested dialog');
      check(await page.locator('#profile-drawer').evaluate(e=>!e.hidden),true,width+': nested Escape keeps the parent drawer open');
      check(await page.locator('.drawer-panel').evaluate(e=>e.contains(document.activeElement)),true,width+': nested dialog returns focus to drawer');
      await page.keyboard.press('Escape');
      check(await page.locator('#profile-drawer').evaluate(e=>e.hidden),true,width+': Escape closes drawer');
      check(await page.locator('#hub-shell').evaluate(e=>e.inert),false,width+': closing drawer restores background');
      check(await visibleFocus(page),true,width+': closing drawer restores focus');
      await keyboardFocus(page,'#view-profile [data-open-profile]');await page.keyboard.press('Enter');
      await page.locator('.drawer-panel [data-google-signin]').first().click();
      check(await page.locator('#google-signin-modal').isVisible(),true,width+': drawer sign-in opens native dialog');
      await page.keyboard.press('Escape');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      check(await visibleFocus(page),true,width+': sign-in dismissal restores focus outside hidden drawer');

      await page.goto(base+'/health-hub#ask',{waitUntil:'networkidle'});
      await keyboardFocus(page,'.response-length-picker input:checked');
      check((await ring(page,'.response-length-picker input:checked + span')).color,'rgb(7, 89, 182)',width+': answer length focus ring is opaque');
      check(await page.locator('.response-length-picker label').first().evaluate(e=>e.getBoundingClientRect().height>=44),true,width+': answer length touch target');
      await page.keyboard.press('ArrowRight');
      check(await page.locator('.response-length-picker input[value="detailed"]').isChecked(),true,width+': answer length supports native arrow keys');
      await shot(page,'answer-length-focus-'+width);

      await page.goto(base+'/research',{waitUntil:'networkidle'});
      if (width<=800) {await page.locator('.doctorai-site-menu-button').click();await page.keyboard.press('Escape');}
      await keyboardFocus(page,width<=800?'.doctorai-site-menu-button':'.doctorai-site-menu a:first-child');
      const publicRing = await ring(page,width<=800?'.doctorai-site-menu-button':'.doctorai-site-menu a:first-child');
      check(publicRing.color.startsWith('rgb(') && publicRing.width>=3 && publicRing.style==='solid',true,width+': public navigation has a solid opaque focus ring');
      await shot(page,'public-navigation-focus-'+width);
      if (width===320) {
        await page.goto(base+'/',{waitUntil:'networkidle'});
        await page.addStyleTag({content:'* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p {margin-bottom:2em!important}'});
        check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'320: homepage reflows with WCAG text-spacing overrides');
        check(await page.locator('.home-mobile-menu').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),true,'320: text spacing keeps the Menu control in view');
        check(await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running'&&a.effect.getComputedTiming().duration>100)),false,'Reduced motion stops sustained decorative CSS animation');
        await shot(page,'text-spacing-home-320');
        await page.goto(base+'/health-hub#profile',{waitUntil:'networkidle'});
        await page.locator('#health-memory-details').evaluate(e=>e.open=true);
        await page.emulateMedia({forcedColors:'active'});
        await keyboardFocus(page,'#health-memory-toggle');
        const forcedRing=await ring(page,'#health-memory-toggle + span');
        check(forcedRing.width>=3&&forcedRing.style==='solid',true,'Forced colors retain the switch focus outline');
        await shot(page,'forced-colors-memory-320');
      }
      await c.close();
    }
    const firstUseViewports = [
      {width:320,height:844,name:'320'},
      {width:390,height:844,name:'390'},
      {width:1440,height:1000,name:'desktop'},
      // A 720 CSS-pixel viewport represents the layout width of a 1440px
      // desktop viewport at 200% browser zoom; it exercises the same reflow.
      {width:720,height:500,deviceScaleFactor:2,name:'200-percent-layout'}
    ];
    for (const viewport of firstUseViewports) {
      const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.deviceScaleFactor||1,reducedMotion:'reduce',serviceWorkers:'block'});
      await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/auth/google'?{authenticated:false}:{active:false,authenticated:false}});return route.continue();});
      const page = await context.newPage();
      page.on('pageerror',e=>report.errors.push(e.message));
      page.on('dialog',d=>d.accept());
      await page.goto(base+'/health-hub',{waitUntil:'networkidle'});
      const label = viewport.name==='200-percent-layout'?'200% zoom layout (720 CSS px)':viewport.width+'px';
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label+': storage choice reflows without horizontal overflow');
      check(await page.locator('#storage-consent').isVisible(),true,label+': storage choice is visible');
      check(await page.locator('#storage-consent').evaluate(e=>[e.getAttribute('role'),e.getAttribute('aria-labelledby'),e.getAttribute('aria-describedby'),e.getAttribute('tabindex')]),['dialog','storage-consent-title','storage-consent-description','-1'],label+': choice is a named, described focus target');
      check(await page.locator('#storage-consent').evaluate(e=>e===document.activeElement),true,label+': focus enters the storage choice when it appears');
      const consentRing = await ring(page,'#storage-consent');
      check(consentRing.color,'rgb(7, 89, 182)',label+': focused storage choice has a visible blue outline');
      check(consentRing.width>=3 && consentRing.style==='solid',true,label+': storage-choice focus outline is at least 3px and solid');
      check(await page.locator('#storage-consent [data-device-storage-allow], #storage-consent [data-device-storage-session]').evaluateAll(items=>items.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})),true,label+': both storage choices meet 44px touch targets');
      await shot(page,'first-use-storage-choice-'+viewport.name);
      await page.keyboard.press('Tab');
      check(await page.locator('#storage-consent [data-device-storage-allow]').evaluate(e=>e===document.activeElement),true,label+': Tab reaches the device storage choice');
      await page.keyboard.press('Tab');
      check(await page.locator('#storage-consent [data-device-storage-session]').evaluate(e=>e===document.activeElement),true,label+': Tab reaches the session-only choice');
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('#storage-consent').hidden);
      await page.waitForFunction(()=>document.querySelector('.view.active > .page-heading h1')===document.activeElement);
      check(await visibleFocus(page),true,label+': choosing storage returns focus to the active page heading');
      const headingRing = await ring(page,'.view.active > .page-heading h1');
      await shot(page,'first-use-heading-focus-'+viewport.name);
      check(headingRing.width>=3 && headingRing.style==='solid' && contrastAgainstWhite(headingRing.color)>=3,true,label+': restored heading has a high-contrast 3px focus indicator');
      await page.reload({waitUntil:'networkidle'});
      check(await page.locator('#storage-consent').isHidden(),true,label+': repeat visit does not reopen the storage choice');
      await context.close();
    }

    const interruptedContext = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
    await interruptedContext.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/auth/google'?{authenticated:false}:{active:false,authenticated:false}});return route.continue();});
    const interruptedPage = await interruptedContext.newPage();
    interruptedPage.on('pageerror',e=>report.errors.push(e.message));
    interruptedPage.on('dialog',d=>d.accept());
    await interruptedPage.goto(base+'/health-hub#profile',{waitUntil:'networkidle'});
    check(await interruptedPage.locator('#storage-consent').isVisible(),true,'interrupted first use: storage choice remains available on a deep-linked view');
    await interruptedPage.keyboard.press('Tab');
    check(await interruptedPage.locator('#storage-consent [data-device-storage-allow]').evaluate(e=>e===document.activeElement),true,'interrupted first use: keyboard can choose device storage');
    await interruptedPage.keyboard.press('Enter');
    await interruptedPage.waitForFunction(()=>document.querySelector('#storage-consent').hidden);
    await interruptedPage.waitForFunction(()=>document.querySelector('#view-profile > .page-heading h1')===document.activeElement);
    check(await visibleFocus(interruptedPage),true,'interrupted first use: accepting on a deep link returns focus to the current view');
    await interruptedContext.close();
    check(report.errors,[],'No browser exceptions');
  } finally {await browser.close();server.close();if(out)fs.writeFileSync(path.join(out,'accessibility-interactions.json'),JSON.stringify(report,null,2));}
  console.log(JSON.stringify({suite:'accessibility-browser',result:report.failures.length?'baseline defects recorded':'passed',checks:report.checks.length,failures:report.failures,errors:report.errors,screenshots:report.screenshots},null,2));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
