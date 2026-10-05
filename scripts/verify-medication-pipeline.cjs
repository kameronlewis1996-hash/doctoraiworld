'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../server-src/_lib/doctorai-core.cjs');

const original = {
  identityFromRequest: core.identityFromRequest,
  storageConfigured: core.storageConfigured,
  activeEntitlement: core.activeEntitlement,
  reportError: core.reportError,
  fetch: global.fetch,
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_VISION_MODEL
};

function responseRecorder() {
  return { statusCode: 0, headers: {}, setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

async function call(handler, body) {
  const response = responseRecorder();
  await handler({ method: 'POST', headers: {}, body }, response);
  return response;
}

async function run() {
  process.env.OPENAI_API_KEY = 'synthetic-stub-key';
  process.env.OPENAI_VISION_MODEL = 'gpt-5-mini';
  core.identityFromRequest = async () => ({ sub: 'synthetic-pipeline-account', email: 'synthetic@example.invalid' });
  core.storageConfigured = () => true;
  core.activeEntitlement = async () => ({ tier: 'pro', exp: Math.floor(Date.now() / 1000) + 600 });
  core.reportError = () => {};

  const scanHandler = require('../api/medication/_handlers/scan.js');
  const safetyHandler = require('../api/medication/safety.js');
  const scannedLabel = { name: 'Nurofen', dose: '2000 mg per tablet', activeIngredients: ['ibuprofen'], instructions: 'Synthetic directions', frequency: '', time: '', supply: '', refill: '', startDate: '', endDate: '', prescriptionExpiry: '', repeats: '' };
  let scanProviderRequest;
  global.fetch = async (_url, options) => {
    scanProviderRequest = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(scannedLabel) }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S0AAAAASUVORK5CYII=';
  const scan = await call(scanHandler, { image: png, consent: true });
  assert.equal(scan.statusCode, 200);
  assert.equal(scanProviderRequest.store, false);
  assert.equal(scan.body.review.required, true);
  assert.equal(scan.body.review.confirmed, false);
  assert.equal(scan.body.review.fields.name.status, 'extracted');
  assert.equal(scan.body.review.fields.name.confidence, 'not_reported');

  const ui = fs.readFileSync(path.join(__dirname, '../health-hub.js'), 'utf8');
  assert.match(ui, /data-scan-review-required=/, 'successful OCR must mark the form for review');
  assert.match(ui, /values\.scanFieldsReviewed === 'on'/, 'saving OCR fields must require explicit review');
  assert.match(ui, /if \(scanReviewRequired && !scanFieldsReviewed\)/, 'the review check must gate saving');
  assert.match(ui, /ingredientCheck\.checked = false/, 'editing a confirmed ingredient must revoke prior confirmation');
  assert.match(ui, /ingredientInput\.addEventListener\('input', \(\) => \{\s*if \(medicationForm\.elements\.scanFieldsReviewed\) medicationForm\.elements\.scanFieldsReviewed\.checked = false;/, 'editing an ingredient must also revoke scan-field review');

  const confirmedScannedMedicine = {
    name: scan.body.medication.name,
    dose: scan.body.medication.dose,
    activeIngredients: scan.body.medication.activeIngredients,
    activeIngredientsConfirmed: true
  };
  const result = await call(safetyHandler, {
    consent: true,
    medications: [
      { name: 'Marevan', dose: '1 mg', activeIngredients: ['warfarin'], activeIngredientsConfirmed: true },
      confirmedScannedMedicine
    ],
    allergies: [],
    conditions: []
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.coverage.confirmedLabels, 2);
  assert.equal(result.body.coverage.strengthUnverified, 1);
  assert.equal(result.body.coverage.doseAssessment, 'not_performed');
  assert.ok(result.body.alerts.some(alert => alert.ruleId === 'warfarin-nsaid'));
  assert.ok(result.body.alerts.some(alert => alert.type === 'strength-review'));

  const wrongLabel = await call(safetyHandler, {
    consent: true,
    medications: [
      { name: 'Marevan', dose: '1 mg', activeIngredients: ['warfarin'], activeIngredientsConfirmed: true },
      { ...confirmedScannedMedicine, activeIngredients: ['paracetamol'] }
    ]
  });
  assert.equal(wrongLabel.statusCode, 200);
  assert.equal(wrongLabel.body.resolved[1].matchState, 'name_label_mismatch');
  assert.equal(wrongLabel.body.coverage.mismatched, 1);
  assert.equal(wrongLabel.body.alerts.some(alert => alert.ruleId === 'warfarin-nsaid'), false, 'a name/label mismatch must not emit a guessed ingredient interaction');

  const unconfirmed = await call(safetyHandler, { consent: true, medications: [{ ...confirmedScannedMedicine, activeIngredientsConfirmed: false }] });
  assert.equal(unconfirmed.statusCode, 400, 'the server must reject active ingredients without user confirmation');

  process.stdout.write('Synthetic scan→review→confirmed label→save gate→local rules pipeline passed. OCR confidence remains unknown; unverified strength and name/label mismatch states are preserved.\n');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  core.identityFromRequest = original.identityFromRequest;
  core.storageConfigured = original.storageConfigured;
  core.activeEntitlement = original.activeEntitlement;
  core.reportError = original.reportError;
  global.fetch = original.fetch;
  if (original.apiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original.apiKey;
  if (original.model === undefined) delete process.env.OPENAI_VISION_MODEL; else process.env.OPENAI_VISION_MODEL = original.model;
});
