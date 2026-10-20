'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TODAY_BASE_URL || 'http://127.0.0.1:4198';
const out=process.env.TODAY_LAYOUT_EVIDENCE_DIR || require('node:path').join(require('node:os').tmpdir(),'doctorai-today-layout');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']} : {})});const report={checks:[],errors:[],geometry:[]};
 try {for(const width of [320,390,1440]){
 const c=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 await c.route('https://**/*',r=>r.abort());await c.route('**/api/**',r=>r.fulfill({json:{authenticated:false,active:false}}));
 await c.addInitScript(()=>localStorage.setItem('doctorai-health-hub-device-storage-consent','yes'));
 const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());
 const geometry=async view=>p.locator('#view-'+view).evaluate(e=>{let h=e.querySelector('.page-heading'),s=getComputedStyle(h);return {left:h.getBoundingClientRect().x,width:h.getBoundingClientRect().width,top:h.getBoundingClientRect().y,padding:s.padding,border:s.border,borderRadius:s.borderRadius,margin:s.margin,background:s.background,shadow:s.boxShadow,fontSize:getComputedStyle(h.querySelector('h1')).fontSize,viewPadding:getComputedStyle(e).padding}});
 await p.goto(base+'/health-hub#health',{waitUntil:'networkidle'});const health=await geometry('health');
 await p.goto(base+'/health-hub#today',{waitUntil:'networkidle'});await p.waitForFunction(()=>document.querySelector('#today-record-status').hidden);const today=await geometry('today');
 assert.deepEqual(today,health,'Today/My Health hero and page geometry '+width);report.geometry.push({width,today,health});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow '+width);
 assert.equal(await p.locator('#view-today').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.equal(await p.locator('#hub-breadcrumb').innerText(),'Today');
 const pick=p.locator('[data-today-section-select]');const alert=p.locator('#view-today > .hub-alert-shortcut');const originalAlert=await alert.getAttribute('aria-label');
 for(const key of ['medicines','conditions','allergies','appointment','diary','all']){
 if(width<800){await pick.selectOption(key);assert.equal(await pick.evaluate(e=>e.value),key)}else{const b=p.locator(`[data-today-section-target="${key}"]`);await b.focus();await p.keyboard.press('Enter');assert.equal(await b.getAttribute('aria-current'),'true')}
 assert.equal(await p.locator('#view-today [data-today-section]:visible').count(),key==='all'?5:1);
 assert.equal(await alert.isVisible(),true);assert.equal(await alert.getAttribute('aria-label'),originalAlert);assert.equal(new URL(p.url()).hash,'#today');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
 if(width<800){await pick.focus();await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');assert.equal(await pick.inputValue(),'medicines');assert.equal(await p.locator('#view-today [data-today-section]:visible').count(),1);assert.equal(await pick.evaluate(e=>e===document.activeElement),true);await pick.selectOption('all');}
 await p.locator('#view-today .today-page-actions button').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#view-add').isVisible(),true);await p.waitForFunction(()=>document.activeElement?.id==='add-title');
 await p.locator('.mobile-bottom-nav [data-view="today"]').evaluate(e=>e.click());await p.waitForFunction(()=>document.activeElement?.id==='today-title');
 assert.equal(await p.locator('#view-today .today-page-actions button').isVisible(),true);
 await p.locator('#view-today [data-view="medications"]').click();assert.equal(await p.locator('#view-medications').isVisible(),true);
 await p.goto(base+'/health-hub#health',{waitUntil:'networkidle'});if(width<800){await p.locator('[data-hub-section-select]').selectOption('documents');assert.equal(await p.locator('#view-documents').isVisible(),true);}
 await p.goto(base+'/health-hub#today',{waitUntil:'networkidle'});
 await p.locator('.today-question-disclosure summary').click();await p.locator('#today-question').fill('Fictional layout test question');await p.locator('[data-diary-question-form="today"] button').click();await p.waitForFunction(()=>/Added to your diary/i.test(document.querySelector('[data-diary-question-form="today"] [data-diary-question-status]').textContent));
 if(width<800){await p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const last=await p.locator('.today-compact-boundary').boundingBox(),nav=await p.locator('.mobile-bottom-nav').boundingBox();assert.ok(last.y+last.height<=nav.y,'last content clears bottom nav');await p.locator('[data-today-section-select]').scrollIntoViewIfNeeded();await pick.selectOption('diary');await p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const diary=await p.locator('.today-question-disclosure').boundingBox();assert.ok(diary.y+diary.height<=nav.y,'filtered diary clears nav')}
 report.checks.push(`${width}: identical hero geometry, transparent page, no overflow, all six section choices, keyboard, always-visible alerts, Add/Manage, My Health picker, diary save, bottom clearance`);
 await c.close();}
 assert.deepEqual(report.errors,[]);report.result='passed';fs.writeFileSync(require('node:path').join(out,'layout-report.json'),JSON.stringify(report,null,2));console.log(report.checks.join('\n'));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
