'use strict';

const { test: base, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const baseURL = `http://127.0.0.1:${Number(process.env.BROWSER_TEST_PORT || 4173)}`;
const syntheticPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
  'base64'
);

const test = base.extend({
  sandbox: async ({ page, request }, use) => {
    const pageErrors = [];
    const blockedExternalRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) {
        blockedExternalRequests.push({ url: url.href, resourceType: route.request().resourceType() });
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.addInitScript(() => {
      localStorage.setItem('doctorai-health-hub-device-storage-consent', 'session');
      const media = navigator.mediaDevices || {};
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          ...media,
          getUserMedia: async () => {
            const error = new Error('Synthetic browser test: no camera available.');
            error.name = 'NotFoundError';
            throw error;
          }
        }
      });
    });
    await request.post(`${baseURL}/__test__/reset`, { data: { scanMode: 'success', cloudMode: 'available' } });
    await use({ page, request, pageErrors, blockedExternalRequests });
  }
});

async function openHub(page, view = 'today') {
  await page.goto(`/health-hub#${view}`);
  await expect(page.locator(`[data-view-panel="${view}"]`)).toBeVisible();
}

async function syntheticStatus(request) {
  const response = await request.get(`${baseURL}/__test__/status`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function expectNoPageErrors(pageErrors) {
  expect(pageErrors, 'The browser should not report uncaught JavaScript errors.').toEqual([]);
}

async function expectNoProviderEgress(blockedExternalRequests) {
  const attemptedProviderHosts = blockedExternalRequests
    .map(item => new URL(item.url).hostname)
    .filter(host => /(^|\.)(openai\.com|stripe\.com|vercel-storage\.com)$/i.test(host));
  expect(attemptedProviderHosts, 'The synthetic browser must not request AI, billing, or Blob services.')
    .toEqual([]);
  expect(blockedExternalRequests.filter(item => new URL(item.url).hostname === 'accounts.google.com')
    .every(item => item.resourceType === 'script'), 'The app OAuth bootstrap script must remain intercepted before network access.')
    .toBe(true);
}

test('public and hub pictures load from first-party assets', async ({ sandbox }) => {
  const { page, pageErrors } = sandbox;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /organise your health/i })).toBeVisible();
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
  const landingImages = await page.locator('img').evaluateAll(images => images.map(image => ({
    src: image.currentSrc,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    visible: Boolean(image.getClientRects().length)
  })));
  expect(landingImages.filter(image => image.visible && image.src.startsWith(baseURL)))
    .toEqual(expect.arrayContaining([expect.objectContaining({ complete: true })]));
  for (const image of landingImages.filter(item => item.visible && item.src.startsWith(baseURL))) {
    expect(image.naturalWidth, `Broken public image: ${image.src}`).toBeGreaterThan(0);
  }

  await openHub(page);
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
  const brokenHubImages = await page.locator('img').evaluateAll(images => images
    .filter(image => image.getClientRects().length && image.currentSrc.startsWith(location.origin) && image.naturalWidth === 0)
    .map(image => image.currentSrc));
  expect(brokenHubImages, 'Visible first-party images in the hub should decode.').toEqual([]);
  await expectNoPageErrors(pageErrors);
});

test('mobile navigation stays in the viewport and core views remain reachable', async ({ sandbox }) => {
  const { page, pageErrors } = sandbox;
  await page.setViewportSize({ width: 360, height: 800 });
  await openHub(page);
  const mobileNav = page.getByRole('navigation', { name: 'Primary mobile navigation' });
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole('button', { name: 'Chat' }).click();
  await expect(page.locator('[data-view-panel="ask"]')).toBeVisible();
  await mobileNav.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('[data-view-panel="today"]')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
  await expectNoPageErrors(pageErrors);
});

test('medication, appointment and symptom forms save synthetic records', async ({ sandbox }) => {
  const { page, request, pageErrors } = sandbox;
  await openHub(page, 'medications');

  await page.locator('#view-medications [data-modal="medication"]').click();
  const medicationForm = page.locator('[data-modal-form="medication"]');
  await expect(medicationForm).toBeVisible();
  await medicationForm.locator('[name="name"]').fill('Synthetic Sample');
  await medicationForm.locator('[name="dose"]').fill('10 mg per tablet');
  await medicationForm.locator('[name="frequency"]').selectOption('Once daily');
  await medicationForm.getByRole('button', { name: /save medication/i }).click();
  await expect(page.locator('#medication-library')).toContainText('Synthetic Sample');

  await page.locator('[data-view="appointments"]').first().click();
  await page.locator('#view-appointments [data-modal="appointment"]').click();
  const appointmentForm = page.locator('[data-modal-form="appointment"]');
  const futureDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
  await appointmentForm.locator('[name="title"]').fill('Synthetic follow-up');
  await appointmentForm.locator('[name="provider"]').fill('Example clinic');
  await appointmentForm.locator('[name="date"]').fill(futureDate);
  await appointmentForm.locator('[name="time"]').fill('10:30');
  await appointmentForm.getByRole('button', { name: /save appointment/i }).click();
  await expect(page.locator('#upcoming-appointments-list')).toContainText('Synthetic follow-up');

  await page.locator('[data-view="symptoms"]').first().click();
  await page.locator('#view-symptoms [data-modal="symptom"]').first().click();
  const symptomForm = page.locator('[data-modal-form="symptom"]');
  await symptomForm.locator('[name="name"]').fill('Synthetic note');
  await symptomForm.locator('summary').filter({ hasText: 'More detail' }).click();
  await symptomForm.locator('[name="notes"]').fill('Synthetic browser-test note; not a real health record.');
  await symptomForm.getByRole('button', { name: /add to diary/i }).click();
  await expect(page.locator('#symptom-list, #symptom-diary-list, #timeline-list').first()).toContainText('Synthetic note');

  await expect.poll(async () => {
    const status = await syntheticStatus(request);
    return {
      medication: status.state.medications.some(item => item.name === 'Synthetic Sample'),
      appointment: status.state.appointments.some(item => item.title === 'Synthetic follow-up'),
      symptom: status.state.timeline.some(item => item.name === 'Synthetic note'),
      saves: status.calls.filter(call => call.method === 'PUT' && call.pathname === '/api/health/state').length > 0
    };
  }).toEqual({ medication: true, appointment: true, symptom: true, saves: true });
  await expectNoPageErrors(pageErrors);
});

test('scanner requires consent and uses only synthetic OCR with store disabled', async ({ sandbox }) => {
  const { page, request, pageErrors, blockedExternalRequests } = sandbox;
  await openHub(page, 'medications');
  await page.getByRole('button', { name: /scan prescription/i }).click();
  const scanner = page.locator('#medication-scanner-modal');
  await expect(scanner).toBeVisible();
  await expect(page.locator('#medication-scanner-status')).toContainText(/no camera was found/i);

  await scanner.locator('[data-medication-photo]').click();
  await expect(page.locator('#medication-scanner-status')).toContainText(/check the consent box/i);
  let status = await syntheticStatus(request);
  expect(status.mockOcrCalls).toBe(0);
  expect(status.calls.some(call => call.pathname === '/api/medication/scan')).toBe(false);

  await scanner.locator('[data-medication-image-consent]').check();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await scanner.locator('[data-medication-photo]').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'synthetic-label.png', mimeType: 'image/png', buffer: syntheticPng });

  const medicationForm = page.locator('[data-modal-form="medication"]');
  await expect(medicationForm).toBeVisible();
  await expect(medicationForm.locator('[name="name"]')).toHaveValue('Synthetic Sample');
  await expect(medicationForm.locator('[name="dose"]')).toHaveValue('10 mg per tablet');
  await expect(medicationForm).toHaveAttribute('data-scan-attempted', 'true');
  status = await syntheticStatus(request);
  expect(status.mockOcrCalls).toBe(1);
  expect(status.unsafeOcrStoreCalls).toBe(0);
  expect(status.blockedServerFetches).toEqual([]);
  expect(status.calls.filter(call => call.pathname === '/api/medication/scan').at(-1).hasConsent).toBe(true);
  expect(status.calls.filter(call => call.pathname === '/api/medication/scan').at(-1).hasImage).toBe(true);
  await expectNoProviderEgress(blockedExternalRequests);
  await medicationForm.getByRole('button', { name: 'Cancel' }).click();
  status = await syntheticStatus(request);
  expect(status.state.medications).toEqual([]);
  await expectNoPageErrors(pageErrors);
});

test('scanner outage keeps manual entry available without saving a partial record', async ({ sandbox }) => {
  const { page, request, pageErrors, blockedExternalRequests } = sandbox;
  await request.post(`${baseURL}/__test__/reset`, { data: { scanMode: 'failure', cloudMode: 'available' } });
  await openHub(page, 'medications');
  await page.getByRole('button', { name: /scan prescription/i }).click();
  const scanner = page.locator('#medication-scanner-modal');
  await expect(scanner).toBeVisible();
  await scanner.locator('[data-medication-image-consent]').check();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await scanner.locator('[data-medication-photo]').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'synthetic-label.png', mimeType: 'image/png', buffer: syntheticPng });

  const medicationForm = page.locator('[data-modal-form="medication"]');
  await expect(medicationForm).toBeVisible();
  await expect(page.locator('.scan-result-error')).toContainText(/photo scan not completed/i);
  await expect(medicationForm.locator('[name="name"]')).toHaveValue('');
  let status = await syntheticStatus(request);
  expect(status.mockOcrCalls).toBe(1);
  expect(status.unsafeOcrStoreCalls).toBe(0);
  expect(status.state.medications).toEqual([]);
  await expectNoProviderEgress(blockedExternalRequests);

  await medicationForm.locator('[name="name"]').fill('Synthetic manually entered');
  await medicationForm.locator('[name="dose"]').fill('2 mg');
  await medicationForm.getByRole('button', { name: /save medication/i }).click();
  await expect(page.locator('#medication-library')).toContainText('Synthetic manually entered');
  await expect.poll(async () => (await syntheticStatus(request)).state.medications.length).toBe(1);
  status = await syntheticStatus(request);
  expect(status.state.medications).toHaveLength(1);
  expect(status.state.medications[0].name).toBe('Synthetic manually entered');
  await expectNoPageErrors(pageErrors);
});

test('public home and the health hub have no serious or critical axe findings', async ({ sandbox }) => {
  const { page, pageErrors } = sandbox;
  for (const path of ['/', '/health-hub']) {
    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');
    if (path === '/health-hub') {
      const toast = page.locator('#toast');
      await expect(toast).toHaveClass(/show/);
      await expect(toast).not.toHaveClass(/show/);
    }
    await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; scroll-behavior: auto !important; }' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const highImpact = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
    const summary = highImpact.map(item => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      nodes: item.nodes.map(node => ({ target: node.target, html: node.html, failureSummary: node.failureSummary }))
    }));
    expect(summary, `WCAG axe findings on ${path}`).toEqual([]);
  }
  await expectNoPageErrors(pageErrors);
});

test('account-storage outage stays inside the synthetic server and does not discard the visible draft', async ({ sandbox }) => {
  const { page, request, pageErrors } = sandbox;
  await request.post(`${baseURL}/__test__/reset`, { data: { scanMode: 'success', cloudMode: 'unavailable' } });
  await openHub(page, 'medications');
  await page.locator('#view-medications [data-modal="medication"]').click();
  const medicationForm = page.locator('[data-modal-form="medication"]');
  await medicationForm.locator('[name="name"]').fill('Synthetic outage draft');
  await medicationForm.locator('[name="dose"]').fill('1 mg');
  await medicationForm.getByRole('button', { name: /save medication/i }).click();
  await expect(page.locator('#medication-library')).toContainText('Synthetic outage draft');
  await expect(page.locator('#last-synced')).toContainText(/session only/i);
  await expect.poll(async () => {
    const status = await syntheticStatus(request);
    return status.calls.some(call => call.pathname === '/api/health/state' && call.method === 'PUT');
  }).toBe(true);
  const status = await syntheticStatus(request);
  expect(status.cloudMode).toBe('unavailable');
  expect(status.state.medications).toEqual([]);
  expect(status.calls.some(call => call.pathname === '/api/health/state' && call.method === 'PUT')).toBe(true);
  await expectNoPageErrors(pageErrors);
});
