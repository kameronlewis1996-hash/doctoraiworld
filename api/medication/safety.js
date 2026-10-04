'use strict';

const core = require('../../server-src/_lib/doctorai-core.cjs');
const { review } = require('../../server-src/medication/safety-engine.cjs');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return core.json(response, 405, { error: 'Method not allowed.' });

  let account;
  try {
    account = await core.identityFromRequest(request);
  } catch {
    account = null;
  }
  if (!account) return core.json(response, 401, { error: 'Sign in before running a medication check.' });

  let storageReady = false;
  try {
    storageReady = core.storageConfigured();
  } catch {
    storageReady = false;
  }
  if (!storageReady) return core.json(response, 503, { error: 'Secure account access is temporarily unavailable. Please try again shortly.' });

  let access;
  try {
    access = await core.activeEntitlement(request, account);
  } catch {
    return core.json(response, 503, { error: 'DoctorAI Pro access could not be verified. Please try again shortly.' });
  }
  const expiresAt = Number(access?.exp);
  if (!access || access.tier !== 'pro' || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || access.revokedAt) {
    return core.json(response, 403, { error: 'Medication checks are a DoctorAI Pro feature.' });
  }

  let body = request.body;
  try {
    body = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return core.json(response, 400, { error: 'Invalid request.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return core.json(response, 400, { error: 'Invalid medication check request.' });
  if (body.consent !== true) return core.json(response, 400, { error: 'Consent is required to send these medicine names and profile terms to DoctorAI for this one-time check.' });
  if (!Array.isArray(body.medications) || !body.medications.length) return core.json(response, 400, { error: 'Supply at least one medicine in a medications array.' });
  if (body.medications.length > 30) return core.json(response, 400, { error: 'This check supports at most 30 medicines. No partial list was checked.' });

  for (const key of ['medications', 'allergies', 'conditions']) {
    if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].length > 50)) {
      return core.json(response, 400, { error: 'Each profile-term list supports at most 50 entries. No partial list was checked.' });
    }
    if ((body[key] || []).some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) {
      return core.json(response, 400, { error: 'Use non-empty text entries of at most 500 characters.' });
    }
  }

  const medications = body.medications;
  const allergies = body.allergies || [];
  const conditions = body.conditions || [];
  return core.json(response, 200, review({ medications, allergies, conditions }));
};
