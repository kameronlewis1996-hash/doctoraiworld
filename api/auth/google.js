const core = require('../../server-src/_lib/doctorai-core.cjs');

module.exports = async function handler(request, response) {
  core.noStore(response);
  if (request.method === 'GET') {
    const session = await core.identityFromRequest(request);
    return session
      ? response.status(200).json({ authenticated: true, user: { email: session.email, name: session.name, picture: session.picture } })
      : response.status(401).json({ authenticated: false });
  }
  if (request.method === 'DELETE') {
    const session = await core.identityFromRequest(request);
    await core.revokeSession(session).catch(() => {});
    core.clearSession(response);
    core.clearEntitlementCookies(response);
    return response.status(200).json({ ok: true });
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!core.configured()) return response.status(503).json({ error: 'Secure authentication is not configured.' });
  if (!core.storageConfigured()) return response.status(503).json({ error: 'Secure account storage is not configured.' });
  const limit = await core.rateLimit(request, 'google-auth', 12, 10 * 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    return response.status(429).json({ error: 'Too many sign-in attempts. Please try again shortly.' });
  }

  try {
    let body = request.body || {};
    try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch { return response.status(400).json({ error: 'Invalid secure sign-in request.' }); }
    const profile = await core.verifyGoogleCredential(body?.credential);
    const session = core.createSession(profile);
    const activated = await core.activateSession(session);
    if (!activated) return response.status(503).json({ error: 'Secure account storage is temporarily unavailable.' });
    core.sessionCookie(response, session);
    return response.status(200).json({ ok: true, user: { email: session.email, name: session.name, picture: session.picture } });
  } catch (error) {
    const message = String(error?.message || '');
    const status = /credential|verification/i.test(message) ? 401 : /configured/i.test(message) ? 503 : 500;
    return response.status(status).json({ error: status === 500 ? 'Unable to create a secure DoctorAI session.' : message });
  }
}
