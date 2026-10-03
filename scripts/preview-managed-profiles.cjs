'use strict';
// Local synthetic preview only. Never deploy this helper or connect real storage.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { installTestStore } = require('./managed-profile-test-store.cjs');
installTestStore();
const core = require('../server-src/_lib/doctorai-core.cjs');
const root = path.resolve(__dirname, '..');
const owner = core.createSession({ sub: 'demo-owner', email: 'demo-owner@example.invalid', name: 'Demo Owner' });
const other = core.createSession({ sub: 'demo-other', email: 'demo-other@example.invalid', name: 'Other Demo' });
const routes = { '/api/health/state': require('../server-src/health/state.js'), '/api/health/profiles': require('../server-src/health/profiles.js'), '/api/documents': require('../api/documents.js'), '/api/medication/safety': require('../api/medication/safety.js'), '/api/chat': require('../api/chat.js'), '/api/medication/scan': require('../api/medication/[...action].js') };
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let delayMs = 0;
let getDelayMs = 0;
let providerDelayMs = 0;
let failSave = false;
let autoSignIn = true;
let failAuth = false;
const healthWrites = [];
// Use real handlers with synthetic provider output. All other outbound calls
// still go through the in-memory store's strict origin guard.
const syntheticStorageFetch = global.fetch;
process.env.OPENAI_API_KEY = 'synthetic-mocked-key-only';
global.fetch = async (url, options) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') return syntheticStorageFetch(url, options);
  if (providerDelayMs) await new Promise(resolve => setTimeout(resolve, providerDelayMs));
  const request = JSON.parse(options.body);
  const answer = request.text ? JSON.stringify({ name: 'Synthetic label medicine', dose: '10 mg', frequency: 'Once daily', instructions: 'Synthetic label directions' }) : 'Synthetic educational response. This preview made no AI call.';
  return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: answer }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
(async () => {
  await core.activateSession(owner); await core.activateSession(other);
  await core.saveEntitlement(owner, { tier: 'pro', exp: core.nowSeconds() + 3600, source: 'synthetic' });
  await core.saveHealthState(owner, { profile: { name: 'Self Demo', allergies: 'Self-only allergy' }, medications: [{ id: 'self-med', name: 'Self medicine', dose: 'Synthetic', frequency: 'Once a day' }], appointments: [], providers: [], timeline: [], documents: [], measurements: [], tasks: [], memoryDetails: [] });
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      response.status = code => { response.statusCode = code; return response; };
      response.json = value => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
      response.send = value => response.end(value);
      if (url.pathname === '/__test/plan') { await core.saveEntitlement(owner, { tier: url.searchParams.get('tier') === 'free' ? 'free' : 'pro', exp: core.nowSeconds() + 3600 }); return response.json({ synthetic: true }); }
      if (url.pathname === '/__test/account') { const account = url.searchParams.get('other') === '1' ? other : owner; response.setHeader('Set-Cookie', `doctorai_session=${core.signedToken(account)}; Path=/; HttpOnly; SameSite=Lax`); return response.json({ synthetic: true }); }
      if (url.pathname === '/__test/auth') { autoSignIn = url.searchParams.get('auto') !== '0'; failAuth = url.searchParams.get('fail') === '1'; return response.json({ synthetic: true }); }
      if (url.pathname === '/__test/writes') return response.json({ synthetic: true, writes: healthWrites });
      if (url.pathname === '/__test/latency') { delayMs = Math.min(3000, Number(url.searchParams.get('ms')) || 0); getDelayMs = Math.min(3000, Number(url.searchParams.get('getMs')) || 0); providerDelayMs = Math.min(3000, Number(url.searchParams.get('providerMs')) || 0); failSave = url.searchParams.get('fail') === '1'; return response.json({ synthetic: true }); }
      if (url.pathname.startsWith('/api/')) {
        request.query = Object.fromEntries(url.searchParams);
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        request.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        if (url.pathname === '/api/auth/google') {
          if (request.method === 'DELETE') { response.setHeader('Set-Cookie', 'doctorai_session=; Path=/; Max-Age=0'); return response.json({ authenticated: false }); }
          if (failAuth) return response.status(503).json({ error: 'Synthetic authentication outage' });
          const account = await core.identityFromRequest(request);
          return response.json({ authenticated: Boolean(account), user: account ? { accountId: core.accountKey(account), name: account.name, email: account.email, sub: account.sub } : null });
        }
        if (url.pathname === '/api/auth/config') return response.json({ configured: false });
        if (url.pathname === '/api/stripe/entitlement') { const account = await core.identityFromRequest(request); const entitlement = await core.activeEntitlement(request, account); return response.json({ active: Boolean(entitlement), tier: entitlement ? 'pro' : 'free', expiresAt: entitlement?.exp }); }
        if (url.pathname === '/api/health/state' && request.method === 'PUT') {
          const account = await core.identityFromRequest(request);
          healthWrites.push({ ownerId: account ? core.accountKey(account) : null, profileId: request.query.profileId || request.headers['x-doctorai-profile'] || 'self', state: request.body.state });
          if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
          if (failSave) return response.status(503).json({ error: 'Synthetic save failure' });
        }
        if (url.pathname === '/api/health/state' && request.method === 'GET' && getDelayMs) await new Promise(resolve => setTimeout(resolve, getDelayMs));
        const route = routes[url.pathname];
        if (route) return await route(request, response);
        return response.status(409).json({ error: 'Disabled in synthetic preview. No external providers are called.' });
      }
      let filename = url.pathname === '/health-hub' || url.pathname === '/' ? 'health-hub.html' : url.pathname.slice(1);
      if (!path.extname(filename) && fs.existsSync(path.resolve(root, filename + '.html'))) filename += '.html';
      const file = path.resolve(root, filename);
      if (!file.startsWith(root + path.sep) || filename.startsWith('.') || /^(server-src|scripts|api|node_modules)\//.test(filename) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.status(404).end();
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      // The preview signs in a synthetic owner only; no real OAuth credentials.
      if (autoSignIn && filename === 'health-hub.html' && !request.headers.cookie?.includes('doctorai_session=')) response.setHeader('Set-Cookie', `doctorai_session=${core.signedToken(owner)}; Path=/; HttpOnly; SameSite=Lax`);
      response.end(fs.readFileSync(file));
    } catch { response.statusCode = 500; response.end('Synthetic preview error'); }
  });
  const port = Number(process.env.PROFILE_PREVIEW_PORT) || 4173;
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic managed-profile preview: http://127.0.0.1:${port}/health-hub#profile (in-memory storage only)`));
})().catch(error => { console.error(error); process.exitCode = 1; });
