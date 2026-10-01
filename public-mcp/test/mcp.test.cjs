'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/mcp.js');

async function request(method, params = {}, headers = {}, options = {}) {
  const req = { method: options.httpMethod || 'POST', headers, body: options.body ?? { jsonrpc: '2.0', id: 1, method, params } };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, end(body) { this.body = body ? JSON.parse(body) : undefined; } };
  await handler(req, res);
  return res;
}
const call = (name, args) => request('tools/call', { name, arguments: args });

test('initialize negotiates all supported HTTP protocols', async () => {
  for (const protocolVersion of ['2025-03-26', '2025-06-18', '2025-11-25', '2026-01-26']) {
    const res = await request('initialize', { protocolVersion });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.result.protocolVersion, protocolVersion);
    assert.equal(res.body.result.serverInfo.version, '1.3.0');
  }
});
test('HTTP GET advertises the absence of SSE; notification accepts 202', async () => {
  assert.equal((await request('', {}, {}, { httpMethod: 'GET' })).statusCode, 405);
  const res = await request('', {}, {}, { body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body, undefined);
});
test('rejects foreign origins, unsupported protocol, malformed JSON and oversized parsed bodies', async () => {
  assert.equal((await request('tools/list', {}, { origin: 'https://untrusted.example' })).statusCode, 403);
  assert.equal((await request('tools/list', {}, { 'mcp-protocol-version': 'invalid' })).statusCode, 400);
  assert.equal((await request('', {}, {}, { body: '{' })).statusCode, 400);
  assert.equal((await request('', {}, {}, { body: { data: 'x'.repeat(32001) } })).statusCode, 413);
});
test('catalog has three read-only tools and no private, plans, or payment capability', async () => {
  const tools = (await request('tools/list')).body.result.tools;
  assert.equal(tools.length, 3);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.additionalProperties, false);
  }
  assert.ok(!tools[0].inputSchema.properties.feature.enum.includes('plans'));
  assert.ok(!tools[1].inputSchema.properties.destination.enum.includes('plans'));
});
test('curated feature results comply with their closed output schema', async () => {
  const tools = (await request('tools/list')).body.result.tools;
  for (const feature of tools[0].inputSchema.properties.feature.enum) {
    const res = (await call('doctorai_website_guide', { feature })).body.result;
    assert.ok(!res.isError);
    assert.deepEqual(Object.keys(res.structuredContent).sort(), tools[0].outputSchema.required.slice().sort());
    assert.ok(res.structuredContent.url.startsWith('https://www.doctoraiworld.com/health-hub#'));
  }
});
test('five positive reviewer tool flows return public content', async () => {
  for (const feature of ['overview', 'prescription_scan', 'care_summary']) {
    assert.ok(!(await call('doctorai_website_guide', { feature })).body.result.isError);
  }
  assert.equal((await call('doctorai_open_site', { destination: 'medications' })).body.result.structuredContent.url, 'https://www.doctoraiworld.com/health-hub#medications');
  const original = global.fetch;
  global.fetch = async url => {
    assert.equal(url.origin, 'https://www.ebi.ac.uk');
    assert.equal(url.searchParams.get('query'), 'symptom tracking');
    return { ok: true, json: async () => ({ resultList: { result: [{ title: 'Public abstract', pmid: '123', pubYear: '2026' }] } }) };
  };
  try { assert.equal((await call('search_health_research', { topic: 'symptom tracking' })).body.result.structuredContent.results.length, 1); }
  finally { global.fetch = original; }
});
test('negative reviewer boundaries reject account reads, diagnosis, and health writes', async () => {
  for (const name of ['check_private_medications', 'diagnose_and_prescribe', 'add_health_record']) {
    assert.equal((await call(name, {})).body.result.isError, true);
  }
});
test('rejects hidden arguments, inherited feature names, nonstrings and identifying search before network', async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('No network request should occur'); };
  try {
    for (const [name, args] of [
      ['doctorai_website_guide', { feature: 'constructor' }],
      ['doctorai_open_site', { destination: 'plans' }],
      ['doctorai_website_guide', { feature: 'overview', patient: 'example' }],
      ['search_health_research', { topic: 12 }],
      ['search_health_research', { topic: 'my symptoms' }],
      ['search_health_research', { topic: 'person@example.test' }],
      ['search_health_research', { topic: 'DOB 2000-01-02' }]
    ]) assert.equal((await call(name, args)).body.result.isError, true);
  } finally { global.fetch = original; }
});
