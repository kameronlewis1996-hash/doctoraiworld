const assert = require('node:assert/strict');
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the locally installed Playwright module.');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const base = process.env.COMPANION_BASE_URL || 'http://127.0.0.1:4196';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    let account = 'a';
    await context.route('**/api/auth/google', async route => {
      if (route.request().method() === 'DELETE') { account = ''; await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); return; }
      const user = account ? { email: `${account}@example.test`, name: `Test ${account.toUpperCase()}` } : null;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: !!user, user }) });
    });
    const hub = await context.newPage();
    const demo = await context.newPage();
    hub.setDefaultTimeout(5000);
    demo.setDefaultTimeout(5000);
    await hub.goto(base + '/health-hub#appointments', { waitUntil: 'domcontentloaded' });
    await hub.waitForFunction(() => document.querySelector('.drawer-signout')?.hasAttribute('data-google-signout'));
    await demo.goto(base + '/next-steps-demo');
    await demo.locator('#step-title').fill('My private local test note');
    await demo.locator('#step-form button[type="submit"]').click();
    assert.equal(await demo.locator('#draft-count').innerText(), '1');

    await hub.evaluate(() => document.querySelector('[data-google-signout]').click());
    await hub.waitForFunction(() => !document.querySelector('.drawer-signout')?.hasAttribute('data-google-signout'));
    await demo.waitForFunction(() => document.querySelector('#draft-count')?.textContent === '0');
    assert.match(await demo.locator('#demo-status').innerText(), /account change cleared/i);
    await demo.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await demo.locator('#draft-count').innerText(), '0');

    account = 'b';
    await hub.reload({ waitUntil: 'domcontentloaded' });
    await hub.waitForFunction(() => document.querySelector('.drawer-signout')?.hasAttribute('data-google-signout'));
    await hub.goto(base + '/next-steps-demo');
    await hub.locator('#step-title').fill('A same-tab local note');
    await hub.locator('#step-form button[type="submit"]').click();
    await hub.goto(base + '/health-hub#appointments', { waitUntil: 'domcontentloaded' });
    await hub.waitForFunction(() => document.querySelector('.drawer-signout')?.hasAttribute('data-google-signout'));
    await hub.goto(base + '/next-steps-demo');
    assert.equal(await hub.locator('#draft-count').innerText(), '1', 'same owner may return to a local demo in this tab');
    account = 'c';
    await hub.goto(base + '/health-hub#appointments', { waitUntil: 'domcontentloaded' });
    await hub.waitForFunction(() => document.querySelector('.drawer-signout')?.hasAttribute('data-google-signout'));
    await hub.goto(base + '/next-steps-demo');
    assert.equal(await hub.locator('#draft-count').innerText(), '0', 'another account clears previous notes');
    await context.close();
    console.log('Companion account boundary: successful sign-out clears another open tab; same account preserves notes; account change clears same-tab notes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
