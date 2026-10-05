'use strict';

const assert = require('node:assert/strict');
const core = require('../server-src/_lib/doctorai-core.cjs');

const original = {
  identityFromRequest: core.identityFromRequest,
  storageConfigured: core.storageConfigured,
  activeEntitlement: core.activeEntitlement,
  rateLimit: core.rateLimit,
  reportError: core.reportError,
  fetch: global.fetch
};
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_VISION_MODEL;

function responseRecorder() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

async function run() {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_VISION_MODEL = 'gpt-5-mini';
  core.identityFromRequest = async () => ({ email: 'test@example.invalid', sub: 'test' });
  core.storageConfigured = () => true;
  core.activeEntitlement = async () => ({ tier: 'pro', exp: Math.floor(Date.now() / 1000) + 600 });
  core.rateLimit = async () => ({ allowed: true, retryAfter: 0 });
  core.reportError = () => {};

  const medication = {
    name: 'Test medicine', dose: '10 mg', frequency: 'Once daily', time: '08:30', instructions: 'Take one daily',
    supply: '28', refill: '', startDate: '2026-09-01', endDate: '', prescriptionExpiry: '', repeats: '2 repeats'
  };
  let providerRequest;
  const serviceFailureCases = [];
  const expectServiceFailure = (name, response, status) => {
    assert.equal(response.statusCode, status, `${name} status`);
    assert.equal(response.headers['cache-control'], 'no-store, max-age=0', `${name} must not be cached`);
    serviceFailureCases.push({ name, status });
  };
  global.fetch = async (_url, options) => {
    providerRequest = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(medication) }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  delete require.cache[require.resolve('../api/medication/_handlers/scan.js')];
  const handler = require('../api/medication/_handlers/scan.js');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S0AAAAASUVORK5CYII=';
  const success = responseRecorder();
  await handler({ method: 'POST', headers: { 'content-length': String(png.length + 30) }, body: { image: png, consent: true }, socket: {} }, success);
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.medication.name, 'Test medicine');
  assert.equal(success.body.medication.time, '08:30');
  assert.equal(success.body.review.required, true);
  assert.equal(success.body.review.confirmed, false);
  assert.equal(success.body.review.fields.name.status, 'extracted');
  assert.equal(success.body.review.fields.name.confidence, 'not_reported');
  assert.equal(success.body.review.fields.activeIngredients.status, 'not_extracted');
  assert.equal(providerRequest.store, false);
  assert.equal(providerRequest.text.format.type, 'json_schema');
  assert.equal(providerRequest.text.format.strict, true);
  assert.equal(providerRequest.input[0].content[1].detail, 'high');

  providerRequest = null;
  const missingConsent = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { image: png }, socket: {} }, missingConsent);
  assert.equal(missingConsent.statusCode, 400);
  assert.match(missingConsent.body.error, /Confirm that you want to send/i);
  assert.equal(providerRequest, null, 'Missing image consent must stop the provider request.');

  const invalidImage = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { image: 'data:image/png;base64,ZmFrZQ==', consent: true }, socket: {} }, invalidImage);
  assert.equal(invalidImage.statusCode, 400);

  const oversized = responseRecorder();
  await handler({ method: 'POST', headers: { 'content-length': '4000001' }, body: {}, socket: {} }, oversized);
  assert.equal(oversized.statusCode, 413);

  global.fetch = async () => new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const incomplete = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { image: png, consent: true }, socket: {} }, incomplete);
  expectServiceFailure('incomplete OCR response', incomplete, 502);
  assert.match(incomplete.body.error, /could not finish/i);

  global.fetch = async () => new Response(JSON.stringify({ error: { type: 'invalid_api_key' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  const providerAuthFailure = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { image: png, consent: true }, socket: {} }, providerAuthFailure);
  expectServiceFailure('OCR provider authentication failure', providerAuthFailure, 503);
  assert.match(providerAuthFailure.body.error, /temporarily unavailable/i);

  global.fetch = async () => new Response(JSON.stringify({ status: 'completed', output_text: '{not-json' }), { status: 200, headers: { 'content-type': 'application/json' } });
  const malformedProviderOutput = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { image: png, consent: true }, socket: {} }, malformedProviderOutput);
  expectServiceFailure('malformed OCR output', malformedProviderOutput, 502);
  assert.match(malformedProviderOutput.body.error, /could not be read/i);

  global.fetch = async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'synthetic refusal' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const refused = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { image: png, consent: true }, socket: {} }, refused);
  expectServiceFailure('OCR refusal', refused, 422);
  assert.match(refused.body.error, /could not be read safely/i);

  global.fetch = async () => { const error = new Error('synthetic timeout'); error.name = 'AbortError'; throw error; };
  const timedOut = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { image: png, consent: true }, socket: {} }, timedOut);
  expectServiceFailure('OCR provider timeout', timedOut, 504);
  assert.match(timedOut.body.error, /too long/i);

  assert.deepEqual(serviceFailureCases.map(item => item.status), [502, 503, 502, 422, 504]);
  process.stdout.write(`Medication scan verification passed: ${serviceFailureCases.length} synthetic OCR service failures returned no-store 502/503/502/422/504 responses; consent, image bounds, parse/refusal/timeout handling and per-field uncertainty also passed.\n`);
}

run().finally(() => {
  core.identityFromRequest = original.identityFromRequest;
  core.storageConfigured = original.storageConfigured;
  core.activeEntitlement = original.activeEntitlement;
  core.rateLimit = original.rateLimit;
  core.reportError = original.reportError;
  global.fetch = original.fetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_VISION_MODEL; else process.env.OPENAI_VISION_MODEL = originalModel;
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
