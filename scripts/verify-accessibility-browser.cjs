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
async function keyboardFocus(page, selector) {
  // Arrive by a real backward Tab, including controls initially below the fold.
  await page.locator(selector).first().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator(selector).first().evaluate(e=>e===document.activeElement), true, `${selector}: keyboard focus returned to the requested control`);
}
async function waitForSignedOut(page) {
  await page.locator('[data-auth-status-control][data-auth-state="signed-out"]').first().waitFor({state:'attached'});
  // Allow the route's scheduled heading focus to settle before keyboard input.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base = 'http://127.0.0.1:'+server.address().port;
  const executablePath = process.env.CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : null);
  const browser = await chromium.launch(executablePath ? {executablePath, headless:true, args:['--no-sandbox']} : {channel:'msedge',headless:true});
  try {
    for (const width of [1440,390,320]) {
      const c = await browser.newContext({viewport:{width,height:width>800?1000:844},reducedMotion:'reduce',serviceWorkers:'block'});
      await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/auth/google'?{authenticated:false}:{active:false,authenticated:false}});return route.continue();});
      await c.addInitScript(()=>localStorage.setItem('doctorai-health-hub-device-storage-consent','yes'));
      const page = await c.newPage();
      page.on('pageerror',e=>report.errors.push(e.message));
      page.on('dialog',d=>d.accept());
      await page.goto(base+'/health-hub#medications',{waitUntil:'networkidle'});
      await waitForSignedOut(page);
      await page.keyboard.press('Tab');
      check(await page.locator('.skip-link').evaluate(e=>e===document.activeElement),true,width+': skip link is first keyboard stop');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(30);
      check(await page.locator('.view.active > .page-heading h1').evaluate(e=>e===document.activeElement),true,width+': skip link focuses the active content heading');
      check(new URL(page.url()).hash,'#medications',width+': skip link preserves the active route');
      await page.keyboard.press('Tab');
      check(await page.locator('.view.active').evaluate(e=>e.contains(document.activeElement)),true,width+': next Tab stays in active content after skip');
      await page.goto(base+'/health-hub#medications',{waitUntil:'networkidle'});
      await waitForSignedOut(page);

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
      check(await page.locator('#quick-modal [name="name"]').evaluate(e=>e===document.activeElement),true,width+': missing required medicine name receives focus');
      await page.locator('#quick-modal [name="name"]').fill('Synthetic accessibility record');
      await page.locator('#quick-modal [name="dose"]').fill('Fictional strength');
      await page.locator('#quick-modal button[type="submit"]').click();
      await page.waitForFunction(()=>!document.querySelector('#quick-modal').open);
      await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), add);
      check(await page.locator(add).first().evaluate(e=>e===document.activeElement),true,width+': add save returns focus to its opener');
      check(await visibleFocus(page),true,width+': add save restores a visible keyboard position');
      check(await page.locator('#medication-library .library-item-actions button').evaluateAll(items=>items.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})),true,width+': medicine actions have 44px targets');
      if (width<=800) check(await page.locator('#medication-library .library-copy').first().evaluate(e=>e.getBoundingClientRect().width>=180),true,width+': mobile medicine copy has a readable column');

      const edit = '#medication-library [data-edit-medication]';
      await keyboardFocus(page,edit);await page.keyboard.press('Enter');
      await page.locator('#quick-modal [name="dose"]').fill('Edited fictional strength');
      await page.locator('#quick-modal button[type="submit"]').click();
      await page.waitForFunction(()=>!document.querySelector('#quick-modal').open);
      await page.waitForFunction(()=>document.activeElement === document.querySelector('.view.active > .page-heading h1'));
      check(await page.locator('.view.active > .page-heading h1').evaluate(e=>e===document.activeElement),true,width+': edit save focuses the current heading after its opener is replaced');
      check(await visibleFocus(page),true,width+': edit save restores a visible keyboard position');
      await shot(page,'medicine-after-save-'+width);
      await keyboardFocus(page,'#medication-library [data-delete-medication]');await page.keyboard.press('Enter');
      check(await visibleFocus(page),true,width+': delete retains a visible keyboard position');
      check(await page.locator('#medication-library [data-edit-medication]').count(),0,width+': synthetic medicine removed');

      await page.goto(base+'/health-hub#profile',{waitUntil:'networkidle'});
      await waitForSignedOut(page);
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
      await waitForSignedOut(page);
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
    check(report.errors,[],'No browser exceptions');
  } finally {await browser.close();server.close();if(out)fs.writeFileSync(path.join(out,'accessibility-interactions.json'),JSON.stringify(report,null,2));}
  console.log(JSON.stringify({suite:'accessibility-browser',result:report.failures.length?'baseline defects recorded':'passed',checks:report.checks.length,failures:report.failures,errors:report.errors,screenshots:report.screenshots},null,2));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
