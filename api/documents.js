const { randomUUID } = require('node:crypto');
const core = require('../server-src/_lib/doctorai-core.cjs');
const { put, get, del } = require('@vercel/blob');

// Keep uploads small enough to stay below a serverless JSON request limit once
// the file has been base64 encoded. Larger documents should use a future direct
// upload flow rather than silently failing here.
const MAX_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain'
]);
const safeCategory = value => ['prescription', 'result', 'referral', 'discharge', 'specialist', 'certificate', 'imaging', 'letter', 'other'].includes(value) ? value : 'other';
const safeName = value => String(value || 'health-document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 140) || 'health-document';
const storageReady = () => core.documentStorageConfigured();
const noCache = response => core.noStore(response);

async function requireIdentity(request, response) {
  const account = await core.identityFromRequest(request);
  if (!account) {
    noCache(response);
    response.status(401).json({ error: 'Sign in is required to access private documents.' });
    return null;
  }
  return account;
}

function requireDocumentStorage(response) {
  if (storageReady()) return true;
  noCache(response);
  response.status(503).json({
    error: 'Secure document storage is not connected yet.',
    code: 'secure_document_storage_not_configured',
    configured: false
  });
  return false;
}

function decodeUpload(value) {
  const match = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=\s]+)$/i.exec(String(value || ''));
  if (!match) throw new Error('Choose a supported document or image file.');
  const type = match[1].toLowerCase();
  if (!allowedTypes.has(type)) throw new Error('This file type is not supported for secure document storage.');
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Choose a file smaller than 2 MB.');
  return { type, bytes };
}

function serialiseMetadata(document) {
  return {
    id: document.id,
    name: document.name,
    category: document.category,
    type: document.type,
    size: document.size,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

module.exports = async function handler(request, response) {
  noCache(response);
  const account = await requireIdentity(request, response);
  if (!account) return;
  const limit = await core.rateLimit(request, `documents:${core.accountKey(account)}`, 40, 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    return response.status(429).json({ error: 'Too many document requests. Please try again shortly.' });
  }
  if (!requireDocumentStorage(response)) return;

  try {
    const profile = await core.resolveProfileScope(request, account, { write: request.method === 'POST' });
    const profileId = profile?.id || null;
    if (request.method === 'GET') {
      const id = String(request.query?.id || '').trim();
      if (!id) {
        const documents = await core.listDocumentMetadata(account, profileId);
        return response.status(200).json({ documents: documents.map(serialiseMetadata) });
      }
      const document = await core.readDocumentMetadata(account, id, profileId);
      if (!document?.blobPath) return response.status(404).json({ error: 'This private document could not be found.' });
      const stored = await get(document.blobPath, { access: 'private', useCache: false, token: core.documentStorageToken() });
      if (!stored?.stream) return response.status(404).json({ error: 'This private document could not be found.' });
      const encrypted = Buffer.from(await new Response(stored.stream).arrayBuffer());
      const bytes = core.unsealBuffer(encrypted);
      if (!bytes) return response.status(500).json({ error: 'This private document could not be opened safely.' });
      const download = String(request.query?.download || '') === '1';
      response.setHeader('Content-Type', document.contentType || 'application/octet-stream');
      response.setHeader('Content-Length', String(bytes.length));
      response.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${safeName(document.name).replace(/"/g, '')}"`);
      return response.status(200).send(bytes);
    }

    if (request.method === 'POST') {
      const entitlement = await core.activeEntitlement(request, account);
      if (!entitlement) return response.status(403).json({ error: 'Secure document uploads are included with DoctorAI Pro.' });
      let body;
      try {
        body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
      } catch {
        return response.status(400).json({ error: 'The document upload request was not valid.' });
      }
      const { type, bytes } = decodeUpload(body.data);
      const id = `doc-${randomUUID()}`;
      const now = Date.now();
      const document = {
        id,
        name: safeName(body.name),
        category: safeCategory(body.category),
        type: String(body.type || 'Medical document').slice(0, 80),
        contentType: type,
        size: bytes.length,
        createdAt: now,
        updatedAt: now,
        blobPath: `doctorai-private/${core.accountKey(account)}/${profileId ? `${profileId}/` : ''}${id}.enc`
      };
      await put(document.blobPath, core.sealBuffer(bytes), {
        token: core.documentStorageToken(),
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/octet-stream'
      });
      try {
        await core.saveDocumentMetadata(account, document, profileId);
      } catch (error) {
        await del(document.blobPath, { token: core.documentStorageToken() }).catch(() => {});
        throw error;
      }
      return response.status(201).json({ document: serialiseMetadata(document) });
    }

    if (request.method === 'DELETE') {
      const id = String(request.query?.id || request.body?.id || '').trim();
      if (!id) return response.status(400).json({ error: 'Choose a document to delete.' });
      const document = await core.readDocumentMetadata(account, id, profileId);
      if (!document?.blobPath) return response.status(404).json({ error: 'This private document could not be found.' });
      await del(document.blobPath, { token: core.documentStorageToken() });
      // Deletion is owner-authorized even after downgrade/archive. Only remove
      // this document's references; do not expose a general health-state write.
      const cleaned = await core.removeDocumentHealthReferences(account, document, profileId);
      await core.deleteDocumentMetadata(account, id, profileId);
      return response.status(200).json({ ok: true, id, ...cleaned });
    }

    return response.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    const message = error instanceof Error ? error.message : 'Secure document storage is unavailable right now.';
    const isUserInputError = /supported|smaller than|Choose a file/.test(message);
    return response.status(isUserInputError ? 400 : 503).json({ error: isUserInputError ? message : 'Secure document storage is unavailable right now.' });
  }
}
