'use strict';
const core = require('../_lib/doctorai-core.cjs');
const publicProfile = ({ id, name, relationship, createdAt, updatedAt, archivedAt }) => ({ id, name, relationship, createdAt, updatedAt, archivedAt });
const cleanText = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;

module.exports = async function profiles(request, response) {
  core.noStore(response);
  const account = await core.identityFromRequest(request);
  if (!account) return core.json(response, 401, { error: 'Sign in to manage family profiles.' });
  if (!core.storageConfigured()) return core.json(response, 503, { error: 'Secure profile storage is not configured.' });
  try {
    core.validateOwnerContext(request, account);
    const limit = await core.rateLimit(request, `profiles:${core.accountKey(account)}`, 40, 60_000);
    if (!limit.allowed) return core.json(response, 429, { error: 'Please wait before trying again.' });
    if (request.method === 'GET') return core.json(response, 200, { profiles: (await core.listManagedProfiles(account)).map(publicProfile) });
    if (!['POST', 'PATCH'].includes(request.method)) return core.json(response, 405, { error: 'Method not allowed.' });
    let body;
    try { body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; } catch { return core.json(response, 400, { error: 'Invalid profile request.' }); }
    const allowed = request.method === 'POST' ? ['creationId', 'name', 'relationship'] : ['id', 'name', 'relationship', 'archived'];
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !allowed.includes(key))) return core.json(response, 400, { error: 'Invalid profile fields.' });
    const archiveOnly = request.method === 'PATCH' && body.archived === true && Object.keys(body).every(key => ['id', 'archived'].includes(key));
    if (!archiveOnly && !await core.activeEntitlement(request, account)) return core.json(response, 403, { error: 'Family & loved ones is included with DoctorAI Pro. Existing records remain available.' });
    const now = Date.now();
    if (request.method === 'POST') {
      const id = `person-${body.creationId}`;
      const name = cleanText(body.name, 80);
      const relationship = cleanText(body.relationship ?? '', 60);
      if (!core.validProfileId(id) || !name || relationship === null) return core.json(response, 400, { error: 'Enter a name (up to 80 characters) and an optional relationship (up to 60 characters).' });
      const profile = await core.createManagedProfile(account, { id, name, relationship, createdAt: now, updatedAt: now, archivedAt: null });
      return core.json(response, 201, { profile: publicProfile(profile) });
    }
    const profile = await core.readManagedProfile(account, body.id);
    if (body.archived !== undefined && typeof body.archived !== 'boolean') return core.json(response, 400, { error: 'Invalid archive selection.' });
    const name = body.name === undefined ? profile.name : cleanText(body.name, 80);
    const relationship = body.relationship === undefined ? profile.relationship : cleanText(body.relationship, 60);
    if (!name || relationship === null) return core.json(response, 400, { error: 'Enter a valid name and optional relationship.' });
    const updated = { ...profile, name, relationship, updatedAt: now, archivedAt: body.archived === undefined ? profile.archivedAt : body.archived ? (profile.archivedAt || now) : null };
    await core.saveManagedProfile(account, updated);
    return core.json(response, 200, { profile: publicProfile(updated) });
  } catch (error) { return core.json(response, error.status || 503, { error: error.status ? error.message : 'Secure profile storage is temporarily unavailable.' }); }
};
