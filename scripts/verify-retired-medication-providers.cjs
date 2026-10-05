'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dispatch = require('../api/medication/[...action].js');

function responseRecorder() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

(async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (...args) => { calls.push(args); throw new Error('Unexpected outbound request'); };
  try {
    for (const action of ['ingredient-search', 'nzf-interactions', 'nzf-product-search', 'safety-check']) {
      const response = responseRecorder();
      await dispatch({ method: 'POST', url: '/api/medication/' + action, query: { action }, body: { consent: true } }, response);
      assert.equal(response.statusCode, 410, action + ' must return Gone');
      assert.equal(response.headers['cache-control'], 'no-store, max-age=0');
      assert.match(response.body.error, /retired/i);
    }
    assert.equal(calls.length, 0, 'Retired routes must never call an external provider');
  } finally {
    global.fetch = originalFetch;
  }

  const root = path.join(__dirname, '..');
  const removedFiles = [
    'api/medication/_handlers/ingredient-search.js',
    'api/medication/_handlers/nzf-interactions.js',
    'api/medication/_handlers/nzf-product-search.js',
    'api/medication/_handlers/safety-check.js',
    'api/medication/_lib/drugbank.cjs',
    'api/medication/_lib/nzf-fhir.cjs',
    'scripts/verify-nzf-fhir.js'
  ];
  for (const file of removedFiles) assert.equal(fs.existsSync(path.join(root, file)), false, file + ' must stay retired');

  const app = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'health-hub.html'), 'utf8');
  const dispatcher = fs.readFileSync(path.join(root, 'api/medication/[...action].js'), 'utf8');
  const safetyApi = fs.readFileSync(path.join(root, 'api/medication/safety.js'), 'utf8');
  const safetyProvider = fs.readFileSync(path.join(root, 'server-src/medication/safety-provider.cjs'), 'utf8');
  assert.match(dispatcher, /scan:/, 'The consented label-photo route remains available');
  assert.match(app, /fetch\('\/api\/medication\/safety'/, 'The limited local rules path stays active');
  assert.match(safetyApi, /server-src\/medication\/safety-provider\.cjs/, 'The limited safety endpoint must use the replaceable local provider interface');
  assert.match(safetyProvider, /require\(['"]\.\/safety-engine\.cjs['"]\)/, 'The default provider must delegate to the existing local rule engine');
  for (const retired of ['/api/medication/nzf-product-search', '/api/medication/nzf-interactions', '/api/medication/ingredient-search', '/api/medication/safety-check']) {
    assert.equal(app.includes(retired), false, 'The UI must not request ' + retired);
  }
  for (const removedControl of ['data-nzf-product-search', 'data-medication-match-ingredients', 'data-run-medication-safety-check', 'data-run-ingredient-safety-check', 'data-medication-safety-profile']) {
    assert.equal(app.includes(removedControl), false, 'The retired UI control remains: ' + removedControl);
  }
  assert.equal(app.includes('BarcodeDetector'), false, 'The camera must remain a label-photo flow');
  assert.equal(html.includes('barcode'), false, 'The UI must not advertise the retired barcode lookup');
  assert.equal(/(?:nzfProduct|nzfProductConfirmed|resolvedIngredients)\s*:/.test(app), false, 'Editing must not rewrite legacy provider metadata');
  assert.match(app, /\.\.\.\(existingMedication \|\| \{\}\)/, 'Medication edits must retain unknown legacy record fields');
  assert.match(app, /activeIngredientsManuallyConfirmed === true/, 'Legacy provider-derived ingredient confirmation must not be treated as user-confirmed');
  assert.match(app, /older provider match details remain in this private record but are not used/i);
  assert.match(html, /health-hub\.css\?v=70/);
  assert.match(html, /health-hub\.js\?v=65/);

  console.log('Medication provider retirement verified: retired routes are no-store 410s with zero outbound calls; the local endpoint, scan route, and inert legacy record preservation remain.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
