'use strict';

const handlers = {
  scan: () => require('./_handlers/scan.js'),
};
const retiredActions = new Set(['ingredient-search', 'nzf-interactions', 'nzf-product-search', 'safety-check']);

module.exports = async function medicationAction(request, response) {
  const raw = request.query?.action;
  const fromPath = String(request.url || '').split('?')[0].split('/').filter(Boolean).pop();
  const action = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : '') : String(raw || fromPath || '').split('/')[0];
  if (retiredActions.has(action)) {
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    return response.status(410).json({ error: 'This medication provider feature has been retired. Only the limited DoctorAI local rules check remains available.' });
  }
  const load = handlers[action];
  if (!load) {
    response.setHeader('Cache-Control', 'no-store');
    return response.status(404).json({ error: 'Medication action not found.' });
  }
  return (await load())(request, response);
};
