const handlers = {
  'grant-pro': () => require('../../server-src/staff/grant-pro.js'),
  'redeem-pro': () => require('../../server-src/staff/redeem-pro.js'),
  'revoke-pro': () => import('../../server-src/staff/revoke-pro.mjs').then(module => module.default || module),
  'medication-clash-test': () => {
    const core = require('../../server-src/_lib/doctorai-core.cjs');
    const { createMedicationClashTestHandler } = require('../../server-src/staff/medication-clash-test.cjs');
    return createMedicationClashTestHandler({ core });
  },
};

module.exports = async function staffAction(request, response) {
  const raw = request.query?.action;
  const fromPath = String(request.url || '').split('?')[0].split('/').filter(Boolean).pop();
  const action = Array.isArray(raw) ? raw[0] : String(raw || fromPath || '').split('/')[0];
  const load = handlers[action];
  if (!load) return response.status(404).json({ error: 'Staff action not found.' });
  return (await load())(request, response);
};
