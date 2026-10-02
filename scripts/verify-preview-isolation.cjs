'use strict';

const assert = require('node:assert/strict');
const core = require('../server-src/_lib/doctorai-core.cjs');

const names = ['VERCEL_ENV', 'DOCTORAI_PREVIEW_STORAGE_ISOLATED', 'PREVIEW_AUTH_SECRET', 'PREVIEW_KV_REST_API_URL', 'PREVIEW_KV_REST_API_TOKEN', 'AUTH_SECRET', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
try {
  process.env.VERCEL_ENV = 'preview';
  process.env.AUTH_SECRET = 'synthetic-shared-secret';
  process.env.KV_REST_API_URL = 'https://shared.example.test';
  process.env.KV_REST_API_TOKEN = 'synthetic-shared-token';
  delete process.env.DOCTORAI_PREVIEW_STORAGE_ISOLATED;
  delete process.env.PREVIEW_AUTH_SECRET;
  delete process.env.PREVIEW_KV_REST_API_URL;
  delete process.env.PREVIEW_KV_REST_API_TOKEN;
  assert.equal(core.storageConfigured(), false, 'Preview must fail closed when only shared/default storage credentials exist.');

  process.env.DOCTORAI_PREVIEW_STORAGE_ISOLATED = 'true';
  process.env.PREVIEW_AUTH_SECRET = 'synthetic-preview-secret';
  process.env.PREVIEW_KV_REST_API_URL = 'https://isolated-preview.example.test';
  process.env.PREVIEW_KV_REST_API_TOKEN = 'synthetic-preview-token';
  assert.equal(core.storageConfigured(), true, 'Explicit dedicated preview credentials may enable preview storage.');
  process.stdout.write('Preview storage isolation verification passed using synthetic settings; no storage request was made.\n');
} finally {
  names.forEach(name => { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; });
}
