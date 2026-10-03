const crypto = require('node:crypto');
const core = require('../_lib/doctorai-core.cjs');

const configuredCode = () => String(process.env.VERCEL_ENV === 'preview' ? process.env.PREVIEW_DOCTORAI_FREE_PRO_CODE || '' : process.env.DOCTORAI_FREE_PRO_CODE || '').trim().toUpperCase();
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
  if (code.length > 4096) return json(response, 400, { error: 'The access code is too long.' });
  const expected = configuredCode();
  const promotionalCode = code.toUpperCase();
  const matchesPromotion = Boolean(expected) && Buffer.byteLength(promotionalCode) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(promotionalCode), Buffer.from(expected));
  let grant = null;
  if (!matchesPromotion) {
    try {
      const parsed = core.verifySignedToken(code);
      if (parsed) {
        const accountEmail = String(account.email).trim().toLowerCase();
        if (parsed.tier === 'pro' && parsed.source === 'staff-grant' && String(parsed.email).trim().toLowerCase() === accountEmail && Number(parsed.exp) > Math.floor(Date.now() / 1000)) grant = parsed;
      }
    } catch { grant = null; }
  }
  if (!matchesPromotion && !grant) return json(response, 400, { error: 'This Pro access code is invalid or has expired.' });

  const existing = await core.activeEntitlement(request, account);
  if (existing) {
    return json(response, 409, { error: 'This account already has active DoctorAI Pro access.' });
  }

  let storedGrant = null;
  const grantSnapshot = await core.readPrivateGlobalRecord('doctorai:free-pro:grants', core.accountKey(account));
  if (grant) {
    storedGrant = grantSnapshot.value;
    const tokenHash = crypto.createHash('sha256').update(code).digest('base64url');
    if (!storedGrant || storedGrant.revokedAt || storedGrant.tokenHash !== tokenHash || storedGrant.redeemedAt || Number(storedGrant.exp) !== Number(grant.exp)) {
      return json(response, 400, { error: 'This staff Pro access code is invalid, already used, or has been revoked.' });
    }
  } else {
    const previousPromotion = grantSnapshot.value;
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
  const stored = await core.readPrivateRecord('accounts', account, 'complimentary-pro');
  // The existing global grant key is retained; compare its exact encrypted
  // snapshot together with the new independent entitlement in one transaction.
  const redemption = await core.readPrivateRecord('accounts', account, 'complimentary-redemption');
  if (redemption.value?.tokenHash === crypto.createHash('sha256').update(code).digest('base64url') || (!grant && redemption.value?.promotionUsed)) return json(response, 409, { error: 'This account has already used this complimentary access code.' });
  const saved = await core.commitPrivateRecords([
    { namespace: 'accounts', account, field: 'complimentary-pro', raw: stored.raw, value: { tier: 'pro', source, email: entry.email, exp, plan: 'complimentary', status: 'active', renewalDate: null, cancelAtPeriodEnd: true } },
    { namespace: 'accounts', account, field: 'complimentary-redemption', raw: redemption.raw, value: { ...redemption.value, tokenHash: crypto.createHash('sha256').update(code).digest('base64url'), promotionUsed: !grant || Boolean(redemption.value?.promotionUsed), redeemedAt: entry.redeemedAt } },
    { globalKey: 'doctorai:free-pro:grants', field: core.accountKey(account), raw: grantSnapshot.raw, value: entry },
    { globalKey: 'doctorai:audit', field: crypto.randomUUID(), raw: null, value: { type: 'free-pro-redeemed', at: entry.redeemedAt, actor: entry.actor, accountEmail: entry.email, expiresAt: entry.expiresAt } }
  ]);
  if (!saved) return json(response, 409, { error: 'Complimentary access changed. Reload before trying again.' });
  core.setEntitlementCookie(response, { tier: 'pro', source, email: entry.email, exp }, 'doctorai_free_pro');
  return json(response, 200, { active: true, expiresAt: exp, email: entry.email });
};
