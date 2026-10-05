'use strict';

const core = require('../../server-src/_lib/doctorai-core.cjs');
const { defaultMedicationSafetyProvider } = require('../../server-src/medication/safety-provider.cjs');

const errorResponse = (response, httpStatus, code, error) => core.json(response, httpStatus, { status: code, errorCode: code, error });

function createMedicationSafetyHandler({ provider = defaultMedicationSafetyProvider } = {}) {
  if (!provider || typeof provider.review !== 'function') throw new TypeError('Medication safety provider must implement review(input).');

  return async function handler(request, response) {
    if (request.method !== 'POST') return errorResponse(response, 405, 'method_not_allowed', 'Method not allowed.');

    let account;
    try { account = await core.identityFromRequest(request); } catch { account = null; }
    if (!account) return errorResponse(response, 401, 'authentication_required', 'Sign in before running a medication check.');

    let storageReady = false;
    try { storageReady = core.storageConfigured(); } catch { storageReady = false; }
    if (!storageReady) return errorResponse(response, 503, 'secure_storage_unavailable', 'Secure account access is temporarily unavailable. Please try again shortly.');

    let access;
    try { access = await core.activeEntitlement(request, account); }
    catch { return errorResponse(response, 503, 'entitlement_check_unavailable', 'DoctorAI Pro access could not be verified. Please try again shortly.'); }
    const expiresAt = Number(access?.exp);
    if (!access || access.tier !== 'pro' || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || access.revokedAt) {
      return errorResponse(response, 403, 'pro_entitlement_required', 'Medication checks are a DoctorAI Pro feature.');
    }

    let body = request.body;
    try { body = typeof body === 'string' ? JSON.parse(body) : body; }
    catch { return errorResponse(response, 400, 'invalid_json', 'Invalid request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse(response, 400, 'invalid_request', 'Invalid medication check request.');
    if (body.consent !== true) return errorResponse(response, 400, 'consent_required', 'Consent is required to send these medicine names, strength/dose values, confirmed label ingredients and profile terms to DoctorAI for this one-time check.');
    if (!Array.isArray(body.medications) || !body.medications.length) return errorResponse(response, 400, 'medicine_list_required', 'Supply at least one medicine in a medications array.');
    if (body.medications.length > 30) return errorResponse(response, 400, 'medicine_limit_exceeded', 'This check supports at most 30 medicines. No partial list was checked.');

    for (const key of ['medications', 'allergies', 'conditions']) {
      if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].length > 50)) {
        return errorResponse(response, 400, 'term_list_invalid', 'Each profile-term list supports at most 50 entries. No partial list was checked.');
      }
    }

    const medications = body.medications.map(item => {
      if (typeof item === 'string') return item.trim() && item.length <= 120 ? item.trim() : null;
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const allowed = new Set(['name', 'dose', 'activeIngredients', 'activeIngredientsConfirmed']);
      if (Object.keys(item).some(key => !allowed.has(key))) return null;
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) return null;
      if (item.dose !== undefined && (typeof item.dose !== 'string' || item.dose.length > 80)) return null;
      if (item.activeIngredientsConfirmed !== undefined && typeof item.activeIngredientsConfirmed !== 'boolean') return null;
      if (item.activeIngredients !== undefined && (!Array.isArray(item.activeIngredients) || item.activeIngredients.length > 8)) return null;
      if ((item.activeIngredients || []).some(name => typeof name !== 'string' || !name.trim() || name.length > 120)) return null;
      if (item.activeIngredients?.length && item.activeIngredientsConfirmed !== true) return null;
      if (item.activeIngredientsConfirmed === true && !item.activeIngredients?.length) return null;
      return { name: item.name.trim(), dose: item.dose || '', activeIngredients: item.activeIngredients || [], activeIngredientsConfirmed: item.activeIngredientsConfirmed === true };
    });
    if (medications.some(item => item === null)) return errorResponse(response, 400, 'medicine_entry_invalid', 'Use a medicine name and optional strength, with active ingredients only when you confirmed them against the original label.');

    const allergies = body.allergies || [];
    const conditions = body.conditions || [];
    for (const key of ['allergies', 'conditions']) {
      if ((body[key] || []).some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) {
        return errorResponse(response, 400, 'profile_term_invalid', 'Use non-empty text entries of at most 500 characters.');
      }
    }

    try {
      const result = await provider.review({ medications, allergies, conditions });
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('Medication provider returned an invalid result.');
      return core.json(response, 200, { ...result, provider: { id: provider.id || 'custom-medication-provider', version: provider.version || 'unknown', interfaceVersion: provider.interfaceVersion || 1 } });
    } catch (error) {
      try { core.reportError('medication_safety_provider_error', { route: '/api/medication/safety', provider: provider.id || 'custom-medication-provider', name: error?.name }); } catch { /* Logging failure cannot turn an unavailable check into a success. */ }
      return errorResponse(response, 503, 'provider_unavailable', 'The local medication rules are temporarily unavailable. No medication check was returned. Please try again or ask a pharmacist.');
    }
  };
}

module.exports = createMedicationSafetyHandler();
module.exports.createMedicationSafetyHandler = createMedicationSafetyHandler;
