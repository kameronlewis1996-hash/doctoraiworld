'use strict';

const assert = require('node:assert/strict');
const core = require('../server-src/_lib/doctorai-core.cjs');
const routePath = require.resolve('../api/chat.js');
const route = require(routePath);
const coreNames = ['identityFromRequest', 'rateLimit'];
const originals = Object.fromEntries(coreNames.map(name => [name, core[name]]));
const originalFetch = global.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
let sentPayload = null;
let providerCalls = 0;

core.identityFromRequest = async () => ({ email: 'synthetic@example.test', sub: 'synthetic-chat' });
core.rateLimit = async () => ({ allowed: true });
process.env.OPENAI_API_KEY = 'synthetic-api-key';
global.fetch = async (_url, options) => {
  providerCalls += 1;
  sentPayload = JSON.parse(options.body);
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    body: null,
    json: async () => ({ output_text: 'Synthetic answer.' })
  };
};

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

(async () => {
  const missingConsent = responseRecorder();
  await route({ method: 'POST', body: { messages: [{ role: 'user', content: 'synthetic question' }] }, headers: {} }, missingConsent);
  assert.equal(missingConsent.statusCode, 400);
  assert.equal(providerCalls, 0, 'The provider must not be called without explicit request consent.');

  const response = responseRecorder();
  await route({ method: 'POST', body: { consent: true, messages: [{ role: 'user', content: 'synthetic question' }] }, headers: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.answer, 'Synthetic answer.');
  assert.equal(providerCalls, 1);
  assert.equal(sentPayload.store, false, 'Every Responses API request must disable stored application state.');
  process.stdout.write('Chat privacy verification passed: missing consent stops the request and the provider payload sets store:false.\n');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  coreNames.forEach(name => { core[name] = originals[name]; });
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalApiKey;
});
