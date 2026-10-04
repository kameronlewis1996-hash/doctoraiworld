'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/medication/[...action].js');
const root = path.resolve(__dirname, '..');
const retired = ['ingredient-search', 'nzf-interactions', 'nzf-product-search', 'safety-check'];
const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
(async () => {
  let outbound = 0;
  global.fetch = async () => { outbound++; throw new Error('A retired provider request must never reach the network.'); };
  for (const action of retired) {
    const result = response();
    await handler({ method: 'POST', url: `/api/medication/${action}`, headers: {}, query: { action }, body: { consent: true } }, result);
    assert.equal(result.statusCode, 410, `${action} must be retired`);
    assert.equal(result.headers['Cache-Control'], 'no-store, max-age=0');
    assert.match(result.body.error, /retired/i);
  }
  for (const file of [
    'api/medication/_handlers/ingredient-search.js', 'api/medication/_handlers/nzf-interactions.js',
    'api/medication/_handlers/nzf-product-search.js', 'api/medication/_handlers/safety-check.js',
    'api/medication/_lib/drugbank.cjs', 'api/medication/_lib/nzf-fhir.cjs', 'scripts/verify-nzf-fhir.js'
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must not remain callable`);
  const source = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
  assert.doesNotMatch(source, /\/api\/medication\/(?:ingredient-search|nzf-interactions|nzf-product-search|safety-check)|buildDrugBankSafetyPayload|data-nzf-product-search|data-medication-match-ingredients/);
  assert.match(source, /data-run-local-medication-safety-check/);
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.doesNotMatch(env, /(?:DRUGBANK|NZF_FHIR|NZF_INTERACTION)/);
  const localCheck = fs.readFileSync(path.join(root, 'api/medication/safety.js'), 'utf8');
  assert.match(localCheck, /safety-engine\.cjs/); assert.doesNotMatch(localCheck, /DrugBank|NZF|https?:\/\//);
  assert.equal(outbound, 0, 'Retired handler calls must not make outbound requests.');
  console.log('Medication provider retirement passed: legacy API aliases return uncached 410, provider handlers/credentials are removed, local safety route remains local, and synthetic test observed zero outbound calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
