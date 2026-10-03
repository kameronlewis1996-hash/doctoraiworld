'use strict';

const handlers = {
  'ingredient-search': () => require('./_handlers/ingredient-search.js'),
  'nzf-interactions': () => require('./_handlers/nzf-interactions.js'),
  'nzf-product-search': () => require('./_handlers/nzf-product-search.js'),
  'safety-check': () => require('./_handlers/safety-check.js'),
  scan: () => require('./_handlers/scan.js'),
};

module.exports = async function medicationAction(request, response) {
  const raw = request.query?.action;
  const fromPath = String(request.url || '').split('?')[0].split('/').filter(Boolean).pop();
  const action = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : '') : String(raw || fromPath || '').split('/')[0];
  if (request.headers?.['x-doctorai-profile'] !== undefined || request.query?.profileId !== undefined) {
    const core = require('../../server-src/_lib/doctorai-core.cjs');
    const account = await core.identityFromRequest(request);
    if (!account) return core.json(response, 401, { error: 'Sign in to access a managed profile.' });
    if (action !== 'scan' && await core.rejectUnsupportedManagedAction(request, response, account)) return;
  }
  const load = handlers[action];
  if (!load) {
    response.setHeader('Cache-Control', 'no-store');
    return response.status(404).json({ error: 'Medication action not found.' });
  }
  return (await load())(request, response);
};
