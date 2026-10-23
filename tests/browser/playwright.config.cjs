'use strict';

const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const port = String(Number(process.env.BROWSER_TEST_PORT || 4173));

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.cjs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30000,
  globalTimeout: 5 * 60 * 1000,
  expect: { timeout: 5000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'test-results', 'results.json') }]
  ],
  outputDir: path.join(__dirname, 'test-results', 'artifacts'),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/browser/server.cjs',
    cwd: path.resolve(__dirname, '../..'),
    url: `http://127.0.0.1:${port}/__test__/health`,
    reuseExistingServer: false,
    timeout: 30000,
    env: { NODE_ENV: 'test', PORT: port }
  }
});
