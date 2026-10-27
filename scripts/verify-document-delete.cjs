'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'documents.js'), 'utf8');

async function exercise({ failBlobDelete = false, authenticated = true } = {}) {
  const calls = [];
  let metadataPresent = true;
  const core = {
    noStore() {}, storageConfigured: () => true, documentStorageConfigured: () => true,
    identityFromRequest: async () => authenticated ? { id: 'synthetic-account' } : null,
    rateLimit: async () => ({ allowed: true }), accountKey: () => 'synthetic-account',
    documentStorageToken: () => 'synthetic-token',
    readDocumentMetadata: async () => metadataPresent ? { blobPath: 'synthetic/path.enc' } : null,
    deleteDocumentMetadata: async () => { calls.push('metadata'); metadataPresent = false; }
  };
  const blob = { put() {}, get() {}, async del() { calls.push('blob'); if (failBlobDelete) throw new Error('synthetic storage failure'); } };
  const sandbox = { module: { exports: {} }, Buffer, Response, require(name) {
    if (name === '../server-src/_lib/doctorai-core.cjs') return core;
    if (name === '@vercel/blob') return blob;
    return require(name);
  } };
  vm.runInNewContext(source, sandbox, { filename: 'documents.js' });
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await sandbox.module.exports({ method: 'DELETE', query: { id: 'synthetic-document' } }, response);
  return { calls, metadataPresent, response };
}

(async () => {
  const failure = await exercise({ failBlobDelete: true });
  assert.equal(failure.response.code, 503, 'storage failure must be reported');
  assert.deepEqual(failure.calls, ['blob'], 'retain metadata so deletion can be retried');
  assert.equal(failure.metadataPresent, true);
  const success = await exercise();
  assert.equal(success.response.code, 200);
  assert.deepEqual(success.calls, ['blob', 'metadata']);
  assert.equal(success.metadataPresent, false);
  const anonymous = await exercise({ authenticated: false });
  assert.equal(anonymous.response.code, 401);
  assert.deepEqual(anonymous.calls, []);
  console.log('Document deletion: synthetic failure retains metadata; successful deletion and authentication guard pass.');
})().catch(error => { console.error(error); process.exitCode = 1; });
