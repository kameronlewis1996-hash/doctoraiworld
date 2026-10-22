'use strict';
// Local-only visual regression review. APIs are unavailable or explicitly mocked
// with fictional fixtures; no credentials, production records or paid calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.WELCOME_EVIDENCE_DIR || path.join(require('node:os').tmpdir(), 'doctorai-welcome-system');
fs.mkdirSync(out, { recursive: true });
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json')));
const types = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  let route = new URL(req.url, 'http://localhost').pathname;
  const redirect = config.redirects.find(r => r.source === route);
  if (redirect) return res.writeHead(308, {Location:redirect.destination}).end();
  if (route.startsWith('/api/')) return res.writeHead(503, {'Content-Type':'application/json'}).end('{"error":"Local review: service unavailable","allowed":false,"authenticated":false}');
  if (route === '/') route = '/index.html';
  if (!path.extname(route)) route += '.html';
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.existsSync(file)) return res.writeHead(404).end();
  for (const h of config.headers.find(h => h.source === '/(.*)').headers) res.setHeader(h.key, h.value.replace('; upgrade-insecure-requests',''));
  res.setHeader('Content-Type', types[path.extname(file)]);
  res.end(fs.readFileSync(file));
});
const routes = ['/', '/about', '/appointment-checklist', '/medication-list-template', '/research', '/subscription', '/download', '/terms', '/privacy', '/staff', '/mobile-auth', '/professional-brief-demo', ...['today','health','medications','diary','appointments','visit-prep','profile','alerts','add','documents','results','timeline','ask'].map(r => '/health-hub#'+r)];
const report = { mode:'Local Chromium, repository CSP, blocked external requests, fictional fixtures only; system font fallback when Google Fonts is unavailable', routes:[], checks:[], errors:[], screenshots:[] };
async function capture(page, name) {
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  report.screenshots.push(name+'.png');
}
async function layout(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1), false, label+' horizontal overflow');
}
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']} : {})});
  try {
    for (const width of [1440,390,320]) {
      const context = await browser.newContext({viewport:{width,height:width===1440?960:844},serviceWorkers:'block',reducedMotion:'reduce'});
      await context.route('https://**/*',r=>r.abort());
      const page = await context.newPage();
      page.on('pageerror',e=>report.errors.push(e.message));
      for (const route of routes) {
        await page.goto(base+route,{waitUntil:'networkidle'});
        const consent=page.locator('#storage-consent [data-device-storage-session]');
        if (await consent.isVisible()) await consent.click();
        await layout(page,`${width} ${route}`);
        const details=await page.evaluate(()=>({title:document.title,heading:[...document.querySelectorAll('h1')].filter(e=>e.checkVisibility()).map(e=>e.textContent.trim()),background:getComputedStyle(document.body).backgroundImage,backgroundColor:getComputedStyle(document.body).backgroundColor}));
        assert.ok(details.heading.length,route+' visible heading');
        assert.notEqual(details.background,'none',route+' welcome atmosphere is visible on body');
        report.routes.push({route,width,...details});
        if (width!==320) await capture(page,(route==='/'?'welcome':route.slice(1).replace('#','-'))+'-'+width);
      }
      // Existing native public menu and keyboard interaction remain functional.
      await page.goto(base+'/research',{waitUntil:'networkidle'});
      if(width<820) {
        const menu=page.locator('.doctorai-site-menu-button');
        await menu.focus(); await page.keyboard.press('Enter');
        assert.equal(await menu.getAttribute('aria-expanded'),'true');
        await page.keyboard.press('Escape');
        assert.equal(await menu.getAttribute('aria-expanded'),'false');
      }
      // Research states: loading, empty and unavailable; no real index queried.
      await context.route('**/api/research?*',r=>r.fulfill({json:{results:[]}}));
      await page.goto(base+'/research#explore',{waitUntil:'networkidle'});
      await page.reload({waitUntil:'networkidle'});
      await page.waitForFunction(()=>document.querySelector('#research-results').getAttribute('aria-busy')==='false');
      assert.match(await page.locator('#research-results').textContent(),/No matching publications/);
      await capture(page,'research-empty-'+width);
      await context.unroute('**/api/research?*');
      let releaseResearch;
      await context.route('**/api/research?*',async r=>{await new Promise(resolve=>{releaseResearch=resolve;});await r.fulfill({status:503,json:{error:'Fictional unavailable state'}});});
      await page.locator('#research-topic').fill('Fictional search');
      await page.locator('#research-search').click();
      await page.waitForFunction(()=>document.querySelector('#research-results').getAttribute('aria-busy')==='true');
      await capture(page,'research-loading-'+width);
      await page.waitForFunction(()=>document.querySelector('#research-results').textContent.includes('Finding'));
      while(!releaseResearch) await new Promise(r=>setTimeout(r,10));
      releaseResearch();
      await page.waitForFunction(()=>document.querySelector('#research-results').getAttribute('aria-busy')==='false');
      assert.match(await page.locator('#research-results').textContent(),/taking a moment/);
      await context.unroute('**/api/research?*');
      // Access denied is enforced before rendering protected staff sections.
      await context.route('**/api/staff/access',r=>r.fulfill({status:403,json:{allowed:false,reason:'Fictional access denied'}}));
      await page.goto(base+'/staff#ideas-lab',{waitUntil:'networkidle'});
      assert.equal(await page.locator('#staff-content').isVisible(),false);
      assert.equal(await page.locator('#restricted').isVisible(),true);
      await context.unroute('**/api/staff/access');
      // Mocked allowed response exercises only local presentation of private UI.
      await context.route('**/api/staff/access',r=>r.fulfill({json:{allowed:true,email:'visual-review@example.invalid'}}));
      await page.reload({waitUntil:'networkidle'});
      await page.locator('#staff-ideas-tab').click();
      await page.locator('#staff-idea-title').fill('Fictional visual review');
      await page.locator('#staff-idea-details').fill('Test idea with no health or source data.');
      await page.locator('#staff-idea-form button[type="submit"]').click();
      assert.match(await page.locator('#staff-idea-list').textContent(),/Fictional visual review/);
      await layout(page,'staff ideas '+width); await capture(page,'staff-ideas-'+width);
      await page.locator('#staff-tools-tab').focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#staff-medication-review-tab').getAttribute('aria-selected'),'true');
      await page.waitForFunction(()=>document.querySelector('#staff-review-status').classList.contains('error'));
      await capture(page,'staff-review-error-'+width);
      const packet={title:'Fictional review packet',release:{summary:'Visual fixture only; no candidate data loaded.',active:['Fixture'],inactiveCandidateCount:0},candidate:{status:'Inactive fixture',scope:'Layout-only sample.',source:{summary:'No source content loaded.',label:'Fictional source',reviewed:'Not clinical evidence',url:'https://example.invalid/'},blockers:['Fictional review requirement']},requirements:['Fictional review requirement'],catalogue:{summary:'Fictional catalogue disclosure.',safeguards:['Fictional safeguard'],ocr:'No scan performed.'},notice:'Fictional local fixture only.'};
      await context.route('**/api/staff/medication-review',r=>r.fulfill({json:{packet}}));
      await page.locator('.review-retry').click();
      await page.locator('#staff-review-content').waitFor({state:'visible'});
      await layout(page,'staff review '+width); await capture(page,'staff-review-fixture-'+width);
      await page.locator('#staff-medication-tests-tab').click();
      await layout(page,'staff testing '+width); await capture(page,'staff-testing-'+width);
      // Fresh fictional records exercise the real engine/renderer, without a
      // race between a display-only injection and an in-flight account check.
      const backgrounds=[];
      for(const expected of ['orange','red']) {
        const alertContext=await browser.newContext({viewport:{width,height:width===1440?960:844},serviceWorkers:'block',reducedMotion:'reduce'});
        await alertContext.route('https://**/*',r=>r.abort());
        await alertContext.route('**/api/**',r=>r.fulfill({json:{authenticated:false,active:false}}));
        await alertContext.addInitScript(level=>{
          const prefix='doctorai-health-hub-';
          localStorage.setItem(prefix+'device-storage-consent','yes');
          localStorage.setItem(prefix+'medications',JSON.stringify(level==='red'?[{id:'one',name:'Marevan'},{id:'two',name:'Trisul'}]:[{id:'one',name:'Fictional unmatched medicine'}]));
        },expected);
        const alertPage=await alertContext.newPage();
        alertPage.on('pageerror',e=>report.errors.push(e.message));
        await alertPage.goto(base+'/health-hub#health',{waitUntil:'networkidle'});
        await alertPage.waitForFunction(level=>document.body.dataset.healthAlertLevel===level,expected);
        const bg=await alertPage.locator('body').evaluate(e=>getComputedStyle(e).backgroundImage);
        backgrounds.push(bg);
        assert.ok(bg.includes(expected==='red'?'248, 180, 185':'255, 207, 139'),'semantic atmosphere '+expected);
        assert.equal(await alertPage.locator('.hub-severity-banner').isVisible(),true);
        await layout(alertPage,'semantic '+expected+' '+width);
        if(width!==320) await capture(alertPage,'hub-'+expected+'-'+width);
        await alertContext.close();
      }
      assert.notEqual(backgrounds[0],backgrounds[1]);
      // Print resource fields and checkboxes stay usable; printing is not invoked.
      await page.goto(base+'/appointment-checklist',{waitUntil:'networkidle'});
      await page.locator('#visit-details').check();
      assert.equal(await page.locator('#visit-details').isChecked(),true);
      await page.locator('#clear-checklist').click();
      assert.equal(await page.locator('#visit-details').isChecked(),false);
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
      await page.emulateMedia({media:'screen'});
      report.checks.push(`${width}: public menu keyboard; research loading/empty/error; staff denied gate, fictional ideas form, tab keyboard, review error and testing layout; orange/red actual alert renderer; checklist form/reset and print background`);
      await context.close();
    }
    assert.deepEqual(report.errors,[]);
    report.result='passed';
    console.log(JSON.stringify({result:report.result,routes:report.routes.length,checks:report.checks,screenshots:report.screenshots.length}));
  } finally {
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    await browser.close(); server.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
