'use strict';
// Fictional signed-out fixtures only: exercise scrolling without opening records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.MOBILE_CLEARANCE_EVIDENCE_DIR || path.join(os.tmpdir(), 'doctorai-mobile-clearance');
fs.mkdirSync(out, { recursive: true });
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((request, response) => {
  let pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type':'application/json' });
    return response.end(pathname === '/api/auth/google' ? '{"authenticated":false}' : '{"active":false,"authenticated":false}');
  }
  if (pathname === '/') pathname = '/index.html';
  if (!path.extname(pathname)) pathname += '.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return response.writeHead(404).end();
  response.setHeader('content-type', types[path.extname(file)] || 'text/plain');
  fs.createReadStream(file).pipe(response);
});
const routes = ['health','medications','visit-prep','profile','add','diary','alerts','ask','documents','appointments','results','symptoms','timeline','scan'];
(async () => {
  assert.match(fs.readFileSync(path.join(root, 'health-hub.css'), 'utf8'), /env\(safe-area-inset-bottom\)/, 'Bottom navigation includes safe-area CSS; a real device inset remains untested.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless:true, ...(executablePath ? { executablePath, args:['--no-sandbox'] } : {}) });
  const report = [];
  try {
    for (const [width,height] of [[320,568],[390,844],[568,320]]) {
      const context = await browser.newContext({ viewport:{width,height}, serviceWorkers:'block', reducedMotion:'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(() => localStorage.setItem('doctorai-health-hub-device-storage-consent','yes'));
      const page = await context.newPage();
      for (const route of routes) {
        await page.goto(`${base}/health-hub#${route}`, { waitUntil:'networkidle' });
        await page.locator('[data-auth-status-control][data-auth-state="signed-out"]').first().waitFor({ state:'attached' });
        if (route === 'scan') {
          await page.waitForFunction(() => document.activeElement?.matches('#view-medications [data-open-medication-scanner]'));
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const result = await page.evaluate(async () => {
          const active = document.querySelector('.view.active'), nav = document.querySelector('.mobile-bottom-nav'), header = document.querySelector('.hub-topbar');
          if (!active || !nav || !header) return { error:'missing active view or navigation' };
          const elements = [...active.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),summary')].filter(element => {
            const style = getComputedStyle(element), closed = element.closest('details:not([open])');
            return element.getClientRects().length && style.visibility !== 'hidden' && !element.closest('[hidden],[inert]') && (!closed || (element.tagName === 'SUMMARY' && element.parentElement === closed));
          });
          const obscured = [];
          for (const element of elements) {
            element.scrollIntoView({ block:'center', inline:'nearest', behavior:'instant' });
            await new Promise(resolve => requestAnimationFrame(resolve));
            const r = element.getBoundingClientRect(), n = nav.getBoundingClientRect(), h = header.getBoundingClientRect();
            if (r.bottom > n.top + 1 || r.top < h.bottom - 1) obscured.push({ label:(element.getAttribute('aria-label') || element.textContent || element.name || element.tagName).trim().slice(0,60), top:Math.round(r.top), bottom:Math.round(r.bottom), navTop:Math.round(n.top), headerBottom:Math.round(h.bottom) });
          }
          const last = elements.at(-1);
          scrollTo(0, document.documentElement.scrollHeight);
          await new Promise(resolve => requestAnimationFrame(resolve));
          return { count:elements.length, obscured, last:last ? { bottom:Math.round(last.getBoundingClientRect().bottom), navTop:Math.round(nav.getBoundingClientRect().top) } : null };
        });
        report.push({ route,width,height,...result });
        if (result.error || result.obscured?.length || (result.last && result.last.bottom > result.last.navTop + 1)) await page.screenshot({ path:path.join(out, `${route}-${width}x${height}.png`) });
      }
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(report, null, 2));
    assert.equal(report.length, 42);
    for (const item of report) {
      assert.ok(item.count > 0, `${item.route} ${item.width}: expected visible controls`);
      assert.deepEqual(item.obscured, [], `${item.route} ${item.width}: each visible control can be scrolled clear of fixed navigation`);
      assert.ok(item.last && item.last.bottom <= item.last.navTop + 1, `${item.route} ${item.width}: last control clears navigation at scroll end`);
    }
    console.log('Mobile clearance passed: 42 synthetic route/viewport cases; real device safe-area insets remain untested.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
