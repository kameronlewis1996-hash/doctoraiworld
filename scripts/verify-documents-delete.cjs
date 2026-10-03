'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const core = require('../server-src/_lib/doctorai-core.cjs');

const documentPath = path.resolve(__dirname, '../api/documents.js');
const originalLoad = Module._load;
const coreNames = ['identityFromRequest', 'storageConfigured', 'documentStorageConfigured', 'resolveProfileScope', 'removeDocumentHealthReferences', 'rateLimit', 'accountKey', 'readDocumentMetadata', 'deleteDocumentMetadata', 'noStore'];
const originals = Object.fromEntries(coreNames.map(name => [name, core[name]]));
const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
let deleteBlob;
let metadataDeletes = 0;

core.identityFromRequest = async () => ({ email: 'synthetic@example.test', sub: 'synthetic-document-delete' });
core.storageConfigured = () => true;
core.documentStorageConfigured = () => true;
core.resolveProfileScope = async () => null;
core.removeDocumentHealthReferences = async () => ({});
core.rateLimit = async () => ({ allowed: true });
core.accountKey = () => 'synthetic-account-key';
core.readDocumentMetadata = async () => ({ id: 'doc-synthetic', blobPath: 'doctorai-private/synthetic/doc-synthetic.enc' });
core.deleteDocumentMetadata = async () => { metadataDeletes += 1; };
core.noStore = () => {};
process.env.BLOB_READ_WRITE_TOKEN = 'synthetic-token';
Module._load = function(request, parent, isMain) {
  if (parent?.filename === documentPath && request === '@vercel/blob') return { put: async () => {}, get: async () => null, del: (...args) => deleteBlob(...args) };
  if (parent?.filename === documentPath && request === '../server-src/_lib/doctorai-core.cjs') return core;
  return originalLoad.call(this, request, parent, isMain);
};

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader() {},
    json(body) { this.body = body; return this; }
  };
}

(async () => {
  delete require.cache[documentPath];
  const handler = require(documentPath);
  const request = { method: 'DELETE', query: { id: 'doc-synthetic' }, headers: {} };

  deleteBlob = async () => { throw new Error('synthetic blob deletion failure'); };
  metadataDeletes = 0;
  const failed = responseRecorder();
  await handler(request, failed);
  assert.equal(failed.statusCode, 503, 'A Blob deletion failure must be reported to the caller.');
  assert.equal(metadataDeletes, 0, 'Metadata must remain so the document deletion can be retried.');

  deleteBlob = async () => {};
  const succeeded = responseRecorder();
  await handler(request, succeeded);
  assert.equal(succeeded.statusCode, 200);
  assert.equal(metadataDeletes, 1, 'Metadata is removed only after Blob deletion succeeds.');
  process.stdout.write('Document deletion verification passed with synthetic Blob responses; no stored document was accessed.\n');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
  coreNames.forEach(name => { core[name] = originals[name]; });
  if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  delete require.cache[documentPath];
});
