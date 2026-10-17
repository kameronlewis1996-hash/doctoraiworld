'use strict';

// Run from anywhere: node plugin/readiness/verify.cjs [--live]
// The optional live check sends only MCP initialize and tools/list requests.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'plugin/plugin.json'), 'utf8'));
const connection = JSON.parse(readFileSync(path.join(root, 'plugin/mcp.json'), 'utf8'));
const servicePackage = JSON.parse(readFileSync(path.join(root, 'public-mcp/package.json'), 'utf8'));
const handler = require(path.join(root, 'public-mcp/api/mcp.js'));
const endpoint = connection.mcpServers.doctoraiworld?.url;
let nextId = 1;

async function localRequest(method, params = {}) {
  const req = {
    method: 'POST',
    headers: {},
    body: { jsonrpc: '2.0', id: nextId++, method, params }
  };
  const res = {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    end(body) { this.body = body === undefined ? undefined : JSON.parse(body); }
  };
  await handler(req, res);
  assert.equal(res.statusCode, 200, `${method} HTTP status`);
  return res.body.result;
}

async function liveRequest(method, params = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    signal: AbortSignal.timeout(8000)
  });
  assert.equal(response.status, 200, `${method} live HTTP status`);
  const body = await response.json();
  assert.ok(body.result, `${method} live MCP result`);
  return body.result;
}

async function main() {
  assert.equal(manifest.version, servicePackage.version, 'plugin and server versions should match');
  assert.equal(new URL(endpoint).protocol, 'https:');
  assert.equal(connection.mcpServers.doctoraiworld.type, 'streamable-http');
  for (const icon of [manifest.extensions['com.openai'].interface.logo, manifest.extensions['com.openai'].interface.composerIcon]) {
    assert.ok(existsSync(path.join(root, 'plugin', icon)), `missing icon: ${icon}`);
  }

  const initialized = await localRequest('initialize', {
    protocolVersion: '2026-01-26', capabilities: {}, clientInfo: { name: 'fictional-local-probe', version: '0.1' }
  });
  assert.equal(initialized.serverInfo.version, servicePackage.version);
  assert.ok(initialized.capabilities.tools);

  const localTools = (await localRequest('tools/list')).tools;
  assert.deepEqual(localTools.map(tool => tool.name), [
    'doctorai_website_guide', 'doctorai_open_site', 'search_health_research'
  ]);
  for (const tool of localTools) {
    assert.equal(tool.annotations.readOnlyHint, true, `${tool.name} must be read-only`);
    assert.equal(tool.annotations.destructiveHint, false, `${tool.name} must be non-destructive`);
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} must reject hidden inputs`);
  }
  const research = localTools.find(tool => tool.name === 'search_health_research');
  assert.ok(research.inputSchema.properties.topic.enum.includes('symptom tracking'));
  assert.equal(research.inputSchema.properties.topic.enum.length, 11);
  assert.equal(research.annotations.openWorldHint, true);

  const guide = await localRequest('tools/call', { name: 'doctorai_website_guide', arguments: { feature: 'overview' } });
  assert.equal(guide.isError, undefined);
  assert.match(guide.structuredContent.url, /^https:\/\/www\.doctoraiworld\.com\//);
  const link = await localRequest('tools/call', { name: 'doctorai_open_site', arguments: { destination: 'medications' } });
  assert.equal(link.structuredContent.url, 'https://www.doctoraiworld.com/health-hub#medications');

  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async url => {
    fetchCount++;
    assert.equal(url.origin, 'https://www.ebi.ac.uk');
    assert.equal(url.searchParams.get('query'), 'symptom tracking');
    return { ok: true, json: async () => ({ resultList: { result: [
      { title: 'Fictional public abstract for contract testing', pmid: '00000000', pubYear: '2026' }
    ] } }) };
  };
  try {
    const result = await localRequest('tools/call', { name: 'search_health_research', arguments: { topic: 'symptom tracking' } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.results.length, 1);
    assert.equal(fetchCount, 1);
    for (const [name, args] of [
      ['search_health_research', { topic: 'fictional unlisted topic' }],
      ['doctorai_website_guide', { feature: 'overview', privateRecord: 'fictional' }],
      ['read_private_health_record', {}]
    ]) {
      const rejected = await localRequest('tools/call', { name, arguments: args });
      assert.equal(rejected.isError, true, `${name} must reject unsupported requests`);
    }
    assert.equal(fetchCount, 1, 'rejected arguments must not reach the network');
  } finally {
    global.fetch = originalFetch;
  }
  console.log('PASS local package, MCP metadata, public tool flows, and fictional boundary fixtures');

  if (process.argv.includes('--live')) {
    const liveInit = await liveRequest('initialize', {
      protocolVersion: '2026-01-26', capabilities: {}, clientInfo: { name: 'doctorai-readonly-probe', version: '0.1' }
    });
    const liveTools = (await liveRequest('tools/list')).tools;
    const differences = [];
    if (liveInit.serverInfo.version !== servicePackage.version) {
      differences.push(`server version: live ${liveInit.serverInfo.version}, checkout ${servicePackage.version}`);
    }
    if (JSON.stringify(liveTools) !== JSON.stringify(localTools)) {
      differences.push('advertised tool metadata differs from checkout');
      const liveResearch = liveTools.find(tool => tool.name === 'search_health_research');
      if (JSON.stringify(liveResearch?.inputSchema) !== JSON.stringify(research.inputSchema)) {
        differences.push('search_health_research input schema differs');
      }
    }
    if (differences.length) throw new Error(differences.join('; '));
    console.log('PASS read-only live MCP metadata matches checkout');
  }
}

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
