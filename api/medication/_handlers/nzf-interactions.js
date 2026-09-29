'use strict';

const core = require('../../../server-src/_lib/doctorai-core.cjs');
const nzf = require('../_lib/nzf-fhir.cjs');

function json(response, status, payload) {
  core.noStore(response);
  return core.json(response, status, payload);
}

async function authorize(request, response) {
  const account = await core.identityFromRequest(request);
  if (!account) {
    json(response, 401, { error: 'Sign in before checking medication interactions.' });
    return null;
  }
  if (!core.storageConfigured()) {
    json(response, 503, { error: 'Secure account access is temporarily unavailable.' });
    return null;
  }
  const access = await core.activeEntitlement(request, account);
  if (!access) {
    json(response, 403, { error: 'Medication interaction checks are included with DoctorAI Pro.' });
    return null;
  }
  const limit = await core.rateLimit(request, `nzf-interactions:${core.accountKey(account)}`, 8, 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    json(response, 429, { error: 'Too many medication checks. Please try again shortly.' });
    return null;
  }
  return account;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' });
  const account = await authorize(request, response);
  if (!account) return;

  let body = {};
  try { body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {}); }
  catch { return json(response, 400, { error: 'Invalid interaction check request.' }); }
  if (body.consent !== true) return json(response, 400, { error: 'Confirm that you want to send matched NZMT product identifiers to NZF/NZULM for this one-time interaction check.' });
  if (!Array.isArray(body.productIds) || !body.productIds.length || body.productIds.length > 30) {
    return json(response, 400, { error: 'Add up to 30 saved medicine product matches before checking.' });
  }
  const productIds = body.productIds.map(value => String(value || '').trim());
  if (productIds.some(id => id && !/^\d{7,20}$/.test(id))) return json(response, 400, { error: 'A New Zealand medicine catalogue identifier could not be read.' });
  const matchedEntryCount = productIds.filter(Boolean).length;
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (!uniqueIds.length) return json(response, 409, {
    error: 'No saved medicine has a confirmed NZMT product match. Match each product before checking; unknown products remain unchecked.',
    code: 'medications_unmatched'
  });

  if (!nzf.configured() || process.env.NZF_INTERACTION_CONSUMER_USE_APPROVED !== 'true' || process.env.NZF_INTERACTION_DISPLAY_APPROVED !== 'true') {
    return json(response, 503, {
      error: 'NZF/NZULM interaction checking is not enabled. Provider access, consumer-use approval, and approved display terms must be configured first.',
      code: 'nzf_interaction_check_not_configured'
    });
  }

  try {
    const result = await nzf.checkInteractions(uniqueIds);
    const unmatchedMedicationCount = productIds.length - matchedEntryCount;
    const status = result.status === 'complete' && unmatchedMedicationCount === 0 ? 'complete' : 'partial';
    return json(response, 200, {
      provider: 'NZF/NZULM (Stockley’s Alerts)',
      checkedAt: result.checkedAt,
      status,
      checks: {
        interactions: { status: result.status, alerts: result.interactions },
        allergies: { status: 'not_checked', alerts: [] },
        conditions: { status: 'not_checked', alerts: [] },
        symptoms: { status: 'not_checked', alerts: [] }
      },
      matchedMedicationCount: matchedEntryCount,
      unmatchedMedicationCount,
      warnings: result.warnings,
      messages: {
        clearResult: 'No interaction alert was returned for the confirmed NZMT products sent in this check. This does not prove the medicines are safe for you.',
        alertResult: 'An interaction alert can call for different action, such as avoidance, monitoring, dose adjustment, or timing changes. Follow the provider guidance and confirm it with a pharmacist or clinician.',
        notChecked: 'Allergy, condition, and symptom/adverse-effect checks were not included in this NZF interaction request.'
      }
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    core.reportError('nzf_interaction_check_error', {
      route: '/api/medication/nzf-interactions',
      provider: 'nzf_nzulm',
      status: status || undefined,
      timeout
    });
    return json(response, timeout ? 504 : 502, {
      error: timeout ? 'NZF/NZULM did not respond in time. No complete interaction check was returned.' : 'NZF/NZULM is unavailable or could not map a submitted medicine. No complete interaction check was returned.',
      code: 'nzf_interaction_check_unavailable'
    });
  }
};
