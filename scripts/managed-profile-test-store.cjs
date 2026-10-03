'use strict';
// Synthetic transport; optional actual local Redis command adapter for Lua QA.
// No external Redis/Blob/provider request is possible.
const assert = require('node:assert/strict');
function installTestStore({ redisCommand = null } = {}) {
  process.env.AUTH_SECRET = 'synthetic-test-secret-with-sufficient-length';
  process.env.KV_REST_API_URL = 'https://synthetic-store.invalid';
  process.env.KV_REST_API_TOKEN = 'synthetic-only';
  process.env.BLOB_READ_WRITE_TOKEN = 'synthetic-only';
  const hashes = new Map();
  const blobs = new Map();
  const calls = [];
  const blobCalls = [];
  const controls = { beforeCas: null };
  const casMetrics = { calls: 0, conflicts: 0, commits: 0 };
  global.fetch = async (input, options = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://synthetic-store.invalid', 'Tests must never contact live storage or paid providers.');
    const [command, key, field] = url.pathname.slice(1).split('/').map(decodeURIComponent);
    calls.push({ command, key, field });
    if (command === '') {
      const [operation, script, keyCount, hashKey, healthField, expected, next] = JSON.parse(options.body);
      assert.equal(operation, 'EVAL'); assert.equal(keyCount, 1);
      assert.match(script, /doctorai-health-cas-v1/);
      if (controls.beforeCas) await controls.beforeCas({ hashKey, field: healthField, expected, next });
      if (redisCommand) {
        const result = await redisCommand([operation, script, keyCount, hashKey, healthField, expected, next]);
        casMetrics.calls++; if (result === 0) casMetrics.conflicts++; else if (result === 1) casMetrics.commits++;
        return { ok: true, json: async () => ({ result }) };
      }
      const hash = hashes.get(hashKey) || new Map(); hashes.set(hashKey, hash);
      const result = (hash.get(healthField) || '') === expected ? 1 : 0;
      if (result) hash.set(healthField, next);
      return { ok: true, json: async () => ({ result }) };
    }
    if (command === 'pipeline') return { ok: true, json: async () => [{ result: 1 }, { result: 1 }] };
    if (redisCommand) {
      assert.ok(['hget', 'hvals', 'hdel', 'hsetnx', 'hset'].includes(command));
      const args = [command, key]; if (field !== undefined) args.push(field);
      if (['hset', 'hsetnx'].includes(command)) args.push(JSON.parse(options.body));
      const result = await redisCommand(args);
      return { ok: true, json: async () => ({ result }) };
    }
    const hash = hashes.get(key) || new Map();
    hashes.set(key, hash);
    let result;
    if (command === 'hget') result = hash.get(field) ?? null;
    else if (command === 'hvals') result = [...hash.values()];
    else if (command === 'hdel') result = Number(hash.delete(field));
    else if (command === 'hsetnx') { result = Number(!hash.has(field)); if (result) hash.set(field, JSON.parse(options.body)); }
    else if (command === 'hset') { hash.set(field, JSON.parse(options.body)); result = 1; }
    else throw new Error(`Unsupported synthetic operation: ${command}`);
    return { ok: true, json: async () => ({ result }) };
  };
  const blobModule = require.resolve('@vercel/blob');
  require.cache[blobModule] = { id: blobModule, filename: blobModule, loaded: true, exports: {
    put: async (path, bytes, options) => { blobCalls.push({ operation: 'put', token: options?.token }); blobs.set(path, bytes); return { pathname: path }; },
    get: async (path, options) => { blobCalls.push({ operation: 'get', token: options?.token }); return blobs.has(path) ? { stream: new ReadableStream({ start(controller) { controller.enqueue(blobs.get(path)); controller.close(); } }) } : null; },
    del: async (path, options) => { blobCalls.push({ operation: 'del', token: options?.token }); blobs.delete(path); }
  } };
  return { hashes, blobs, calls, blobCalls, controls, casMetrics };
}
function responseRecorder() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
}
module.exports = { installTestStore, responseRecorder };
