const core = require('../_lib/doctorai-core.cjs');

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
    const profile = await core.resolveProfileScope(request, account, { write: request.method === 'PUT' });
    const profileId = profile?.id || null;
    if (request.method === 'GET') {
      const record = await core.readHealthState(account, profileId);
      return response.status(200).json({ configured: true, profileId: profileId || 'self', revision: record?.revision || null, updatedAt: record?.updatedAt || null, state: record?.state || null });
    }
    if (request.method === 'PUT') {
      let body = request.body || {};
      try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch { return response.status(400).json({ error: 'Invalid private health data request.' }); }
      const state = body?.state;
      if (!core.validHealthState(state)) return response.status(400).json({ error: 'The health update was not valid.' });
      if (!Object.hasOwn(body, 'revision') || !(body.revision === null || (typeof body.revision === 'string' && /^[A-Za-z0-9_-]{43}$/.test(body.revision)))) return response.status(400).json({ error: 'Reload these records before saving; a valid record revision is required.' });
      const saved = await core.saveHealthState(account, state, profileId, { expectedRevision: body.revision });
      return response.status(200).json({ ok: true, revision: saved.revision, updatedAt: saved.updatedAt });
    }
    if (request.method === 'DELETE') {
      await core.deleteHealthState(account, profileId);
      return response.status(200).json({ ok: true, deleted: true });
    }
    return response.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    return response.status(503).json({ error: 'Secure shared health storage is temporarily unavailable.' });
  }
}
