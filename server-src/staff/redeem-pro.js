const crypto = require('node:crypto');
const core = require('../_lib/doctorai-core.cjs');

const sign = value => crypto.createHmac('sha256', process.env.AUTH_SECRET || '').update(value).digest('base64url');
const configuredCode = () => String(process.env.DOCTORAI_FREE_PRO_CODE || '').trim().toUpperCase();
const json = core.json;

module.exports = async function redeemPro(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' });
  const account = await core.identityFromRequest(request);
  if (!account?.email) return json(response, 401, { error: 'Sign in with Google before redeeming a Pro access code.' });
  if (!core.configured()) return json(response, 503, { error: 'Pro access is not configured yet.' });
  if (!core.storageConfigured()) return json(response, 503, { error: 'Complimentary Pro is waiting for secure account storage to be connected. Add KV_REST_API_URL and KV_REST_API_TOKEN in Vercel first.' });

  let body = {};
  try { body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {}); }
  catch { return json(response, 400, { error: 'Invalid Pro access request.' }); }

  const limit = await core.rateLimit(request, `pro-redeem:${core.accountKey(account)}`, 8, 60 * 60 * 1000);
  if (!limit.allowed) { response.setHeader('Retry-After', String(limit.retryAfter)); return json(response, 429, { error: 'Too many code attempts. Please try again later.' }); }

  const code = String(body.code || '').trim();
  const expected = configuredCode();
  if (!expected) return json(response, 503, { error: 'Complimentary Pro access is not configured yet.' });
  const promotionalCode = code.toUpperCase();
  const matchesPromotion = promotionalCode.length === expected.length && crypto.timingSafeEqual(Buffer.from(promotionalCode), Buffer.from(expected));
  let grant = null;
  if (!matchesPromotion) {
    try {
      const separator = code.lastIndexOf('.');
      const payload = code.slice(0, separator); const signature = code.slice(separator + 1); const calculated = sign(payload);
      if (separator > 0 && signature.length === calculated.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculated))) {
        const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        const accountEmail = String(account.email).trim().toLowerCase();
        if (parsed.tier === 'pro' && parsed.source === 'staff-grant' && String(parsed.email).trim().toLowerCase() === accountEmail && Number(parsed.exp) > Math.floor(Date.now() / 1000)) grant = parsed;
      }
    } catch { grant = null; }
  }
  if (!matchesPromotion && !grant) return json(response, 400, { error: 'This Pro access code is invalid or has expired.' });

  const existing = await core.readStoredEntitlement(account);
  if (existing && Number(existing.exp) > core.nowSeconds()) {
    return json(response, 409, { error: 'This account already has active DoctorAI Pro access.' });
  }

  let storedGrant = null;
  if (grant) {
    storedGrant = await core.readFreeGrant(account);
    const tokenHash = crypto.createHash('sha256').update(code).digest('base64url');
    if (!storedGrant || storedGrant.revokedAt || storedGrant.tokenHash !== tokenHash || storedGrant.redeemedAt || Number(storedGrant.exp) !== Number(grant.exp)) {
      return json(response, 400, { error: 'This staff Pro access code is invalid, already used, or has been revoked.' });
    }
  } else {
    const previousPromotion = await core.readFreeGrant(account);
    if (previousPromotion?.source === 'promotional-code' && previousPromotion.redeemedAt) {
      return json(response, 409, { error: 'This account has already used its complimentary Pro month.' });
    }
  }

  const exp = grant ? Number(grant.exp) : Math.floor(Date.now() / 1000) + 30 * 86400;
  const source = grant ? 'staff-grant' : 'promotional-code';
  const entry = {
    ...(storedGrant || {}),
    email: String(account.email).trim().toLowerCase(),
    name: String(account.name || ''),
    source,
    code: source,
    redeemedAt: new Date().toISOString(),
    expiresAt: new Date(exp * 1000).toISOString(),
    exp,
    actor: source === 'staff-grant' ? (storedGrant?.issuedBy || 'staff-grant') : 'self'
  };
  await core.saveEntitlement(account, { tier: 'pro', source, email: entry.email, exp, plan: 'complimentary', status: 'active', renewalDate: null, cancelAtPeriodEnd: true });
  await core.recordFreeGrant(account, entry);
  core.setEntitlementCookie(response, { tier: 'pro', source, email: entry.email, exp }, 'doctorai_free_pro');
  return json(response, 200, { active: true, expiresAt: exp, email: entry.email });
};
