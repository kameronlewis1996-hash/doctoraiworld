'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
const root = path.resolve(__dirname, '..');
const phase = process.env.AUDIT_PHASE || 'before';
const out = path.join(process.env.AUDIT_EVIDENCE_DIR || path.join(require('node:os').tmpdir(),'doctorai-accessibility-audit'), phase);
fs.mkdirSync(out, {recursive:true});
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res)=>{
  let route = new URL(req.url,'http://localhost').pathname;
  if(route==='/') route='/index.html';
  if(!path.extname(route)) route+='.html';
  const file = path.resolve(root, '.'+route);
  if(!file.startsWith(root+path.sep)||!types[path.extname(file)]||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
const report={phase,checks:[],errors:[],screenshots:[]};
const routes=process.env.AUDIT_ROUTES?.split(',') || ['/',...['today','health','medications','documents','results','timeline','ask','diary','appointments','visit-prep','profile','alerts','add'].map(r=>'/health-hub#'+r),'/research','/subscription','/about','/download','/privacy','/terms','/appointment-checklist','/medication-list-template'];
async function record(page,label,width,screenshot=true){
  const layout=await page.evaluate(()=>{
    const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,focus:document.activeElement?.outerHTML.slice(0,250),smallTargets:[...document.querySelectorAll('button,a,input,select,textarea,summary')].filter(visible).map(e=>({label:e.getAttribute('aria-label')||e.innerText||e.getAttribute('name'),rect:e.getBoundingClientRect().toJSON(),html:e.outerHTML.slice(0,200)})).filter(e=>e.rect.width<24||e.rect.height<24),clipped:[...document.querySelectorAll('main *,dialog[open] *')].filter(visible).filter(e=>e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX==='hidden'&&e.textContent.trim()).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.trim().slice(0,160)})).slice(0,25)};
  });
  if(process.env.AXE_PATH){await page.addScriptTag({path:process.env.AXE_PATH});layout.violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html}))})));}
  report.checks.push({label,width,...layout});
  if(screenshot){const name=label.replace(/[^a-z0-9]+/gi,'-')+'-'+width+'.png';await page.screenshot({path:path.join(out,name),fullPage:true});report.screenshots.push(name);}
  console.log(JSON.stringify({label,width,overflow:layout.overflow,violations:layout.violations?.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length})),smallTargets:layout.smallTargets.length,clipped:layout.clipped.length}));
  fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of (process.env.AUDIT_WIDTHS||'1440,390,320').split(',').map(Number)){
   const c=await browser.newContext({viewport:{width,height:width>800?1000:844},reducedMotion:'reduce',serviceWorkers:'block'});
   await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/auth/google'?{authenticated:false}:{active:false,authenticated:false}});return route.continue();});
   await c.addInitScript(()=>localStorage.setItem('doctorai-health-hub-device-storage-consent','yes'));
   const page=await c.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   for(const route of routes){await page.goto(base+route,{waitUntil:'networkidle'});await record(page,route==='/'?'home':route.replace('/health-hub#','hub-'),width,width!==320);}
   if(!process.env.AUDIT_ROUTES){
    await page.goto(base+'/health-hub#medications',{waitUntil:'networkidle'});
    await page.locator('#view-medications [data-modal="medication"]').first().click();
    await record(page,'medicine-empty-dialog',width);
    await page.locator('#quick-modal [name="name"]').fill('Abacavir/Lamivudine Viatris');
    await page.locator('.medication-catalogue-choice').first().waitFor();await record(page,'medicine-search',width);
    await page.locator('.medication-catalogue-choice').first().focus();await page.keyboard.press('Enter');
    await page.locator('#quick-modal [name="dose"]').fill('Fictional strength');await record(page,'medicine-selected',width);
    await page.locator('#quick-modal button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#quick-modal').open);
    await record(page,'medicine-saved',width);
    await page.locator('#medication-library [data-edit-medication]').first().click();await record(page,'medicine-edit',width);
    await page.keyboard.press('Escape');
    await page.goto(base+'/health-hub#summary',{waitUntil:'networkidle'});await record(page,'visit-brief-dialog',width);
    await page.keyboard.press('Escape');
    await page.goto(base+'/health-hub#privacy',{waitUntil:'networkidle'});await record(page,'privacy-dialog',width);
    await page.keyboard.press('Escape');
    for(const type of ['health','symptom','appointment','measurement']){
      await page.goto(base+'/health-hub#add',{waitUntil:'networkidle'});
      await page.locator('#view-add [data-modal="'+type+'"]').click();await record(page,type+'-entry-dialog',width);
      await page.keyboard.press('Escape');
    }
    await page.goto(base+'/health-hub#today',{waitUntil:'networkidle'});
    for(const severity of ['moderate','high']){
      await page.evaluate(severity=>window.DoctorAIAlertStatus.render({alerts:[{severity}],coverage:{}}),severity);
      await record(page,'synthetic-'+severity+'-status',width);
    }
   }
   await c.close();
  }
 }finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
