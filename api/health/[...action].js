'use strict';
const core = require('../../server-src/_lib/doctorai-core.cjs');
const handlers = {
  state: () => require('../../server-src/health/state.js'),
  profiles: () => require('../../server-src/health/profiles.js')
};
module.exports = async function healthAction(request, response) {
  const raw = request.query?.action;
  const action = raw === undefined ? String(request.url || '').split('?')[0].split('/').pop() : Array.isArray(raw) ? (raw.length === 1 ? raw[0] : '') : raw;
  if (!Object.hasOwn(handlers, action)) return core.json(response, 404, { error: 'Health action not found.' });
  return handlers[action]()(request, response);
};
