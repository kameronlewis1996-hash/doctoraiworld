'use strict';

// Exercise the actual API handler with in-memory account storage and a mocked
// Blob SDK. This verification never connects to private storage or real APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const handlerPath = require.resolve('../api/documents.js');
const handlerSource = fs.readFileSync(handlerPath, 'utf8');

class BlobNotFoundError extends Error {}
class BlobStoreNotFoundError extends Error {}

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function fixture() {
  const owner = { sub: 'fictional-owner', email: 'owner@example.invalid' };
  const other = { sub: 'fictional-other', email: 'other@example.invalid' };
  const document = {
    id: 'doc-fictional', name: 'Fictional private result',
    blobPath: 'doctorai-private/fictional-owner/doc-fictional.enc'
  };
  const token = 'fictional-private-storage-token';
  const metadata = new Map([[`${owner.sub}:${document.id}`, { ...document }]]);
  const blobs = new Set([document.blobPath]);
  const operations = [];
  let blobFailure = null;
  let metadataFailure = null;
  let metadataResult = true;
  const core = {
    noStore: response => response.setHeader('Cache-Control', 'no-store'),
    identityFromRequest: async request => request.account,
    accountKey: account => account.sub,
    rateLimit: async () => ({ allowed: true }),
    storageConfigured: () => true,
    documentStorageConfigured: () => true,
    documentStorageToken: () => token,
    readDocumentMetadata: async (account, id) => {
      operations.push(['read', account.sub, id]);
      return metadata.get(`${account.sub}:${id}`) || null;
    },
    deleteDocumentMetadata: async (account, id) => {
      operations.push(['metadata', account.sub, id]);
      if (metadataFailure) throw metadataFailure;
      if (!metadataResult) return false;
      metadata.delete(`${account.sub}:${id}`);
      return true;
    }
  };
  const blob = {
    BlobNotFoundError,
    del: async (path, options) => {
      operations.push(['blob', path]);
      assert.equal(options.token, token);
      if (blobFailure) throw blobFailure;
      if (!blobs.has(path)) throw new BlobNotFoundError('The fictional blob is already absent.');
      blobs.delete(path);
    }
  };
  const loaded = new Module(handlerPath, module);
  loaded.filename = handlerPath;
  loaded.require = name => {
    if (name === '../server-src/_lib/doctorai-core.cjs') return core;
    if (name === '@vercel/blob') return blob;
    if (name === 'node:crypto') return require(name);
    throw new Error(`Unexpected dependency in document deletion verification: ${name}`);
  };
  loaded._compile(handlerSource, handlerPath);

  return {
    owner, other, document, metadata, blobs, operations,
    failBlob: error => { blobFailure = error; },
    failMetadata: error => { metadataFailure = error; },
    metadataResult: value => { metadataResult = value; },
    async request(account = owner, id = document.id) {
      const response = responseRecorder();
      await loaded.exports({ method: 'DELETE', query: { id }, account }, response);
      assert.equal(response.headers['cache-control'], 'no-store');
      const payload = JSON.stringify(response.body);
      for (const privateValue of [document.name, document.blobPath, owner.email, token]) {
        assert.ok(!payload.includes(privateValue), 'Deletion responses must not expose private document or account details.');
      }
      return response;
    }
  };
}

function assertIncomplete(response) {
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    error: 'Document deletion could not finish. Please try again.',
    code: 'document_deletion_incomplete'
  });
}

(async () => {
  // A storage error must not orphan the file by erasing its retry information.
  const failedBlob = fixture();
  failedBlob.failBlob(new Error(`Sensitive storage error: ${failedBlob.document.name} ${failedBlob.document.blobPath}`));
  assertIncomplete(await failedBlob.request());
  assert.equal(failedBlob.metadata.size, 1);
  assert.equal(failedBlob.blobs.size, 1);
  assert.deepEqual(failedBlob.operations.map(operation => operation[0]), ['read', 'blob']);
  failedBlob.failBlob(null);
  const retriedBlob = await failedBlob.request();
  assert.equal(retriedBlob.statusCode, 200);
  assert.deepEqual(retriedBlob.body, { ok: true, id: failedBlob.document.id });
  assert.equal(failedBlob.metadata.size, 0);
  assert.equal(failedBlob.blobs.size, 0);
  assert.deepEqual(failedBlob.operations.map(operation => operation[0]), ['read', 'blob', 'read', 'blob', 'metadata']);

  // If only metadata removal fails, the next deletion accepts a typed missing
  // blob error and finishes removing the owner's metadata.
  for (const failureMode of ['throw', 'false']) {
    const failedMetadata = fixture();
    if (failureMode === 'throw') failedMetadata.failMetadata(new Error('Fictional metadata service unavailable.'));
    else failedMetadata.metadataResult(false);
    assertIncomplete(await failedMetadata.request());
    assert.equal(failedMetadata.metadata.size, 1);
    assert.equal(failedMetadata.blobs.size, 0);
    failedMetadata.failMetadata(null);
    failedMetadata.metadataResult(true);
    const retriedMetadata = await failedMetadata.request();
    assert.equal(retriedMetadata.statusCode, 200);
    assert.equal(failedMetadata.metadata.size, 0);
    assert.deepEqual(failedMetadata.operations.map(operation => operation[0]), ['read', 'blob', 'metadata', 'read', 'blob', 'metadata']);
    const repeated = await failedMetadata.request();
    assert.equal(repeated.statusCode, 404, 'An absent account document remains indistinguishable from another owner\'s ID.');
    assert.equal(failedMetadata.operations.filter(operation => operation[0] === 'blob').length, 2);
  }

  // Missing stores and similarly named generic failures do not prove that a
  // file is absent. They must preserve metadata and report incomplete deletion.
  for (const error of [new BlobStoreNotFoundError('Fictional store unavailable.'), Object.assign(new Error('Fictional blob error.'), { name: 'BlobNotFoundError' })]) {
    const unavailable = fixture();
    unavailable.failBlob(error);
    assertIncomplete(await unavailable.request());
    assert.equal(unavailable.metadata.size, 1);
    assert.equal(unavailable.blobs.size, 1);
    assert.ok(!unavailable.operations.some(operation => operation[0] === 'metadata'));
  }

  // Guessing another owner's ID cannot read or delete the file or its metadata.
  const isolated = fixture();
  const otherOwner = await isolated.request(isolated.other);
  assert.equal(otherOwner.statusCode, 404);
  assert.deepEqual(isolated.operations, [['read', isolated.other.sub, isolated.document.id]]);
  assert.equal(isolated.metadata.size, 1);
  assert.equal(isolated.blobs.size, 1);
  assert.equal((await isolated.request()).statusCode, 200);
  assert.equal(isolated.metadata.size, 0);

  const unsigned = fixture();
  assert.equal((await unsigned.request(null)).statusCode, 401);
  assert.equal(unsigned.operations.length, 0);
  const missingId = fixture();
  assert.equal((await missingId.request(missingId.owner, '')).statusCode, 400);
  assert.equal(missingId.operations.length, 0);

  console.log('Document deletion verification passed: Blob failure retains retry metadata, successful retry, metadata throw/false and already-absent Blob retry, missing-store rejection, owner isolation, authentication and input validation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
