const core = require('../_lib/doctorai-core.cjs');

module.exports = async function entitlement(req, res) {
  if (req.method !== 'GET') return core.json(res, 405, { error: 'Method not allowed.' });
  const account = await core.identityFromRequest(req);
  if (!account) return core.json(res, 200, { active: false, tier: 'free' });
  try {
    const entitlement = await core.activeEntitlement(req, account);
    if (!entitlement) return core.json(res, 200, { active: false, tier: 'free' });
    return core.json(res, 200, {
      active: true,
      tier: 'pro',
      plan: entitlement.plan || null,
      source: entitlement.source || 'stripe',
      expiresAt: Number(entitlement.exp),
      renewalDate: entitlement.renewalDate || null,
      cancelAtPeriodEnd: Boolean(entitlement.cancelAtPeriodEnd)
    });
  } catch {
    return core.json(res, 503, { error: 'Subscription access could not be checked right now.' });
  }
};
