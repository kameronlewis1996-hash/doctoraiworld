'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'documents.js'), 'utf8');

async function exercise({ signedIn = true, pro = true, putFails = false, metadataFails = false, cleanupFails = false } = {}) {
  const calls = [], logs = [];
  const core = {
    noStore() {}, storageConfigured: () => true, documentStorageConfigured: () => true,
    identityFromRequest: async () => signedIn ? { id: 'synthetic-account' } : null,
    accountKey: () => 'synthetic-account', rateLimit: async () => ({ allowed: true }),
    activeEntitlement: async () => pro, documentStorageToken: () => 'synthetic-token',
    sealBuffer: bytes => bytes,
    saveDocumentMetadata: async () => { calls.push('metadata'); if (metadataFails) throw new Error('synthetic metadata error'); }
  };
  const blob = {
    async put() { calls.push('put'); if (putFails) throw new Error('synthetic blob error'); },
    async del() { calls.push('cleanup'); if (cleanupFails) throw new Error('synthetic cleanup error'); }, get() {}
  };
  const sandbox = { module: { exports: {} }, Buffer, Response, console: { error: (...args) => logs.push(args) }, require(name) {
    if (name === '../server-src/_lib/doctorai-core.cjs') return core;
    if (name === '@vercel/blob') return blob;
    return require(name);
  } };
  vm.runInNewContext(source, sandbox, { filename: 'documents.js' });
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await sandbox.module.exports({ method: 'POST', body: { name: 'synthetic.pdf', data: 'data:application/pdf;base64,QQ==' } }, response);
  return { calls, response, logs };
}
(async () => {
  const anonymous = await exercise({ signedIn: false });
  assert.equal(anonymous.response.code, 401); assert.deepEqual(anonymous.calls, []);
  const free = await exercise({ pro: false });
  assert.equal(free.response.code, 403); assert.deepEqual(free.calls, []);
  const failedPut = await exercise({ putFails: true });
  assert.equal(failedPut.response.code, 503); assert.deepEqual(failedPut.calls, ['put']);
  const failedMetadata = await exercise({ metadataFails: true });
  assert.equal(failedMetadata.response.code, 503); assert.deepEqual(failedMetadata.calls, ['put', 'metadata', 'cleanup']);
  const failedCleanup = await exercise({ metadataFails: true, cleanupFails: true });
  assert.equal(failedCleanup.response.code, 503);
  assert.deepEqual(failedCleanup.calls, ['put', 'metadata', 'cleanup']);
  assert.equal(failedCleanup.response.body.code, 'document_cleanup_incomplete');
  assert.match(failedCleanup.response.body.error, /contact support/i);
  assert.match(failedCleanup.response.body.reference, /^doc-[0-9a-f-]{36}$/);
  assert.ok(failedCleanup.response.body.error.includes(failedCleanup.response.body.reference), 'the user can provide the reference to support');
  assert.equal(failedCleanup.logs.length, 1);
  assert.ok(JSON.stringify(failedCleanup.logs).includes(failedCleanup.response.body.reference));
  assert.doesNotMatch(JSON.stringify(failedCleanup.logs), /synthetic-account|synthetic\.pdf|synthetic cleanup error/);
  const success = await exercise();
  assert.equal(success.response.code, 201); assert.deepEqual(success.calls, ['put', 'metadata']);
  assert.ok(success.response.body.document.id);
  console.log('Document upload API synthetic identity, Pro, failure, cleanup and success checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
