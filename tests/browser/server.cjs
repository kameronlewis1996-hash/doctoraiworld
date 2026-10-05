'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const core = require('../../server-src/_lib/doctorai-core.cjs');
const syntheticAccount = { sub: 'synthetic-browser-account', email: 'synthetic@example.invalid', name: 'Synthetic Tester' };
const syntheticLabel = {
  name: 'Synthetic Sample',
  dose: '10 mg per tablet',
  activeIngredients: [],
  frequency: 'Once daily',
  time: '',
  instructions: 'Synthetic directions',
  supply: '',
  refill: '',
  startDate: '',
  endDate: '',
  prescriptionExpiry: '',
  repeats: ''
};

process.env.OPENAI_API_KEY = 'synthetic-browser-test-key';
process.env.OPENAI_VISION_MODEL = 'synthetic-browser-test-model';
core.identityFromRequest = async () => syntheticAccount;
core.storageConfigured = () => true;
core.activeEntitlement = async () => ({ tier: 'pro', exp: Math.floor(Date.now() / 1000) + 3600 });
core.reportError = () => {};

const scanHandler = require('../../api/medication/_handlers/scan.js');
const safetyHandler = require('../../api/medication/safety.js');

let scanMode = 'success';
let cloudMode = 'available';
let mockOcrCalls = 0;
let unsafeOcrStoreCalls = 0;
let blockedServerFetches = [];
let calls = [];
let state = emptyState();

function emptyState() {
  return {
    medications: [],
    appointments: [],
    providers: [],
    timeline: [],
    documents: [],
    measurements: [],
    tasks: [],
    profile: { name: '', bloodType: '', allergies: '', conditions: '', notes: '' },
    memoryEnabled: false,
    memoryDetails: []
  };
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 35 * 1024 * 1024) throw new Error('Synthetic test request exceeded its bound.');
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

function recordCall(method, pathname, body) {
  calls.push({
    method,
    pathname,
    bodyKeys: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [],
    hasConsent: body?.consent === true,
    hasImage: typeof body?.image === 'string' && body.image.length > 0
  });
}

function mockApiResponse() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; }
  };
}

global.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input?.url || input);
  if (url.startsWith('https://api.openai.com/')) {
    mockOcrCalls += 1;
    try {
      const payload = JSON.parse(init.body || '{}');
      if (payload.store !== false) unsafeOcrStoreCalls += 1;
    } catch {
      unsafeOcrStoreCalls += 1;
    }
    if (scanMode === 'failure') return new Response('Synthetic OCR unavailable', { status: 503 });
    return new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(syntheticLabel) }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  blockedServerFetches.push(url);
  throw new Error('Outbound network is disabled in the browser test server.');
};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp'
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');

  try {
    if (url.pathname === '/__test__/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true, environment: 'synthetic-in-memory' });
      return;
    }
    if (url.pathname === '/__test__/reset' && request.method === 'POST') {
      const body = await readJson(request);
      scanMode = body.scanMode === 'failure' ? 'failure' : 'success';
      cloudMode = body.cloudMode === 'unavailable' ? 'unavailable' : 'available';
      mockOcrCalls = 0;
      unsafeOcrStoreCalls = 0;
      blockedServerFetches = [];
      calls = [];
      state = emptyState();
      sendJson(response, 200, { ok: true });
      return;
    }
    if (url.pathname === '/__test__/status' && request.method === 'GET') {
      sendJson(response, 200, {
        state,
        calls,
        mockOcrCalls,
        unsafeOcrStoreCalls,
        blockedServerFetches,
        scanMode,
        cloudMode
      });
      return;
    }

    if (url.pathname === '/api/auth/config') {
      sendJson(response, 200, {
        ready: false,
        googleClientId: '',
        services: { authentication: false, accountStorage: false, documentStorage: false, subscriptions: false, ai: false }
      });
      return;
    }
    if (url.pathname === '/api/auth/google') {
      recordCall(request.method, url.pathname, {});
      if (request.method === 'DELETE') { sendJson(response, 200, { ok: true }); return; }
      sendJson(response, 200, { authenticated: true, user: syntheticAccount });
      return;
    }
    if (url.pathname === '/api/stripe/entitlement') {
      recordCall(request.method, url.pathname, {});
      sendJson(response, 200, { active: true, expiresAt: Math.floor(Date.now() / 1000) + 3600, synthetic: true });
      return;
    }
    if (url.pathname.startsWith('/api/stripe/')) {
      recordCall(request.method, url.pathname, {});
      sendJson(response, 503, { error: 'Payment actions are disabled in browser tests.', synthetic: true });
      return;
    }
    if (url.pathname === '/api/health/state') {
      if (cloudMode === 'unavailable') {
        recordCall(request.method, url.pathname, {});
        sendJson(response, 503, { error: 'Synthetic account storage unavailable.', code: 'storage_unavailable' });
        return;
      }
      if (request.method === 'GET') {
        recordCall(request.method, url.pathname, {});
        sendJson(response, 200, { state, updatedAt: 1 });
        return;
      }
      if (request.method === 'PUT') {
        const body = await readJson(request);
        recordCall(request.method, url.pathname, body);
        if (!body.state || typeof body.state !== 'object') {
          sendJson(response, 400, { error: 'Synthetic state was required.' });
          return;
        }
        state = body.state;
        sendJson(response, 200, { updatedAt: Date.now(), synthetic: true });
        return;
      }
      if (request.method === 'DELETE') {
        recordCall(request.method, url.pathname, {});
        state = emptyState();
        sendJson(response, 200, { deleted: true, synthetic: true });
        return;
      }
    }
    if (url.pathname === '/api/medication/scan' && request.method === 'POST') {
      const body = await readJson(request);
      recordCall(request.method, url.pathname, body);
      const apiRequest = { method: request.method, headers: request.headers, body, socket: request.socket };
      const apiResponse = mockApiResponse();
      await scanHandler(apiRequest, apiResponse);
      sendJson(response, apiResponse.statusCode, apiResponse.body || {}, apiResponse.headers);
      return;
    }
    if (url.pathname === '/api/medication/safety' && request.method === 'POST') {
      const body = await readJson(request);
      recordCall(request.method, url.pathname, body);
      const apiRequest = { method: request.method, headers: request.headers, body, socket: request.socket };
      const apiResponse = mockApiResponse();
      await safetyHandler(apiRequest, apiResponse);
      sendJson(response, apiResponse.statusCode, apiResponse.body || {}, apiResponse.headers);
      return;
    }
    if (url.pathname === '/api/chat') {
      recordCall(request.method, url.pathname, {});
      sendJson(response, 503, { error: 'AI requests are disabled in browser tests.', synthetic: true });
      return;
    }
    if (url.pathname === '/api/documents') {
      recordCall(request.method, url.pathname, {});
      sendJson(response, 503, { error: 'Document storage is disabled in browser tests.', synthetic: true });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'No synthetic API route is configured for this request.' });
      return;
    }

    let pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!path.extname(pathname)) {
      const cleanUrlHtml = path.resolve(root, `.${pathname}.html`);
      if (cleanUrlHtml.startsWith(root + path.sep) && fs.existsSync(cleanUrlHtml)) pathname += '.html';
    }
    const target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(403, { 'cache-control': 'no-store' });
      response.end('Forbidden');
      return;
    }
    const content = await fs.promises.readFile(target);
    response.writeHead(200, {
      'content-type': mimeTypes[path.extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(content);
  } catch (error) {
    if (!response.headersSent) sendJson(response, 500, { error: String(error?.message || error), synthetic: true });
    else response.destroy(error);
  }
});

server.listen(Number(process.env.PORT || 4173), '127.0.0.1');

function stop() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
