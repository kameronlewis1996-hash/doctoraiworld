const core = require('../../server-src/_lib/doctorai-core.cjs');

module.exports = async function handler(request, response) {
  core.noStore(response);
  const account = await core.identityFromRequest(request);
  if (!account) return response.status(401).json({ error: 'Sign in is required to access private health data.' });
  if (!core.storageConfigured()) return response.status(503).json({
    error: 'Secure shared health storage is not connected yet.',
    code: 'secure_storage_not_configured',
    configured: false
  });
  const limit = await core.rateLimit(request, `health-state:${core.accountKey(account)}`, 90, 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    return response.status(429).json({ error: 'Too many account updates. Please try again shortly.' });
  }
  try {
    if (request.method === 'GET') {
      const record = await core.readHealthState(account);
      return response.status(200).json({ configured: true, updatedAt: record?.updatedAt || null, state: record?.state || null });
    }
    if (request.method === 'PUT') {
      let body = request.body || {};
      try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch { return response.status(400).json({ error: 'Invalid private health data request.' }); }
      const state = body?.state;
      if (!core.validHealthState(state)) return response.status(400).json({ error: 'The health update was not valid.' });
      await core.saveHealthState(account, state);
      return response.status(200).json({ ok: true, updatedAt: Date.now() });
    }
    if (request.method === 'DELETE') {
      await core.deleteHealthState(account);
      return response.status(200).json({ ok: true, deleted: true });
    }
    return response.status(405).json({ error: 'Method not allowed.' });
  } catch {
    return response.status(503).json({ error: 'Secure shared health storage is temporarily unavailable.' });
  }
}
