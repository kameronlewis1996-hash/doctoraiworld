const core = require('../../server-src/_lib/doctorai-core.cjs');

module.exports = async function handler(request, response) {
  core.noStore(response);
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!core.configured()) return response.status(503).json({ error: 'Secure mobile sign-in is not configured.' });
  if (!core.storageConfigured()) return response.status(503).json({ error: 'Secure account storage is not configured.' });
  const limit = await core.rateLimit(request, 'mobile-auth', 12, 10 * 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    return response.status(429).json({ error: 'Too many sign-in attempts. Please try again shortly.' });
  }
  try {
    let body = request.body || {};
    try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch { return response.status(400).json({ error: 'Invalid mobile sign-in request.' }); }
    const state = String(body?.state || '').trim();
    if (!/^[A-Za-z0-9_-]{24,160}$/.test(state)) return response.status(400).json({ error: 'The app sign-in request has expired. Return to the app and try again.' });
    const profile = await core.verifyGoogleCredential(body?.credential);
    const session = core.createSession(profile);
    const activated = await core.activateSession(session);
    if (!activated) return response.status(503).json({ error: 'Secure account storage is temporarily unavailable.' });
    core.sessionCookie(response, session);
    const accessToken = core.createMobileToken(session, state);
    if (!accessToken) return response.status(503).json({ error: 'Secure mobile sign-in is not configured.' });
    return response.status(200).json({ ok: true, accessToken, user: { email: session.email, name: session.name, picture: session.picture } });
  } catch (error) {
    const message = String(error?.message || '');
    const status = /credential|verification/i.test(message) ? 401 : /configured|storage|unavailable|network|fetch failed|time(?:d?\s*out)|abort|econn|socket/i.test(message) ? 503 : 500;
    return response.status(status).json({ error: status === 500 ? 'Unable to create a secure mobile session.' : message });
  }
}
