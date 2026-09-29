const core = require('../../server-src/_lib/doctorai-core.cjs');

module.exports = async function handler(request, response) {
  core.noStore(response);
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });
  const session = await core.identityFromRequest(request);
  if (!session) return response.status(401).json({ allowed: false, reason: 'Sign in with Google to continue.' });
  const email = String(session.email || '').toLowerCase();
  if (!core.isAdmin(session)) return response.status(403).json({ allowed: false, reason: 'Staff access is restricted.' });
  const result = { allowed: true, role: 'staff-admin', email, admins: [...core.ADMIN_EMAILS], capabilities: ['site-editing', 'deployments', 'traffic-analytics', 'environment-settings', 'free-pro-management', 'free-pro-revocation', 'audit-log'] };
  if (request.query?.stats === '1') {
    try {
      const grants = await core.listFreeGrants();
      const users = grants.users.filter(value => value && value.redeemedAt && !value.revokedAt && new Date(value.expiresAt).getTime() > Date.now()).map(value => ({ email: value.email, name: value.name || '', source: value.source || value.code || 'promotional-code', redeemedAt: value.redeemedAt || null, expiresAt: value.expiresAt }));
      const history = grants.users.map(value => ({ email: value.email, name: value.name || '', source: value.source || value.code || 'promotional-code', issuedAt: value.issuedAt || null, redeemedAt: value.redeemedAt || null, revokedAt: value.revokedAt || null, expiresAt: value.expiresAt || null })).sort((a, b) => String(b.redeemedAt || b.issuedAt || '').localeCompare(String(a.redeemedAt || a.issuedAt || '')));
      result.stats = { configured: grants.configured, active: users.length, users, history, error: grants.configured ? null : 'Connect KV_REST_API_URL and KV_REST_API_TOKEN to store grants securely.' };
    } catch { result.stats = { configured: false, active: 0, users: [], error: 'Could not read redemption data.' }; }
  }
  if (request.query?.audit === '1') {
    try {
      const audit = await core.listAuditEntries(100);
      result.audit = { configured: audit.configured, entries: audit.entries.map(value => ({ type: value.type || 'staff-event', at: value.at || null, actor: value.actor || null, accountEmail: value.accountEmail || null, expiresAt: value.expiresAt || null })) };
    } catch { result.audit = { configured: false, entries: [], error: 'Could not read the staff audit log.' }; }
  }
  return response.status(200).json(result);
}
