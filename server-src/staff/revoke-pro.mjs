import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../_lib/doctorai-core.cjs');

export default async function handler(request, response) {
  core.noStore(response);
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  const admin = await core.identityFromRequest(request);
  if (!core.isAdmin(admin)) return response.status(403).json({ error: 'Staff admin access is required.' });
  if (!core.storageConfigured()) return response.status(503).json({ error: 'Secure grant storage is not connected yet.' });
  const limit = await core.rateLimit(request, `staff-revoke:${core.accountKey(admin)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) { response.setHeader('Retry-After', String(limit.retryAfter)); return response.status(429).json({ error: 'Too many complimentary Pro changes. Please try again later.' }); }
  let body = request.body || {};
  try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch { return response.status(400).json({ error: 'Invalid complimentary Pro revoke request.' }); }
  const email = core.normaliseEmail(body?.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
  try {
    const result = await core.revokeFreeGrant({ email }, admin);
    if (!result.found) return response.status(404).json({ error: 'No complimentary Pro grant was found for this account.' });
    return response.status(200).json({ ok: true, email });
  } catch {
    return response.status(503).json({ error: 'The complimentary Pro grant could not be revoked right now.' });
  }
}
