const core = require('../../../server-src/_lib/doctorai-core.cjs');

const API_ROOT = 'https://api.drugbank.com/v1/';
const REQUIRED_MODULES = new Set([
  'ingredient_search',
  'condition_search',
  'allergy_presentation_search',
  'ddi',
  'allergy_checker',
  'cross_sensitivities',
  'contraindications',
  'adverse_effects'
]);

function json(response, status, payload) {
  core.noStore(response);
  return core.json(response, status, payload);
}

function parseBody(request) {
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  return request.body && typeof request.body === 'object' ? request.body : {};
}

function configured() {
  const modules = new Set(String(process.env.DRUGBANK_CLINICAL_MODULES || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  return Boolean(
    String(process.env.DRUGBANK_API_KEY || '').trim() &&
    process.env.DRUGBANK_COMMERCIAL_LICENSED === 'true' &&
    process.env.DRUGBANK_SAFETY_CRITICAL_USE_APPROVED === 'true' &&
    process.env.DRUGBANK_NZ_INGREDIENT_SCOPE_APPROVED === 'true' &&
    [...REQUIRED_MODULES].every(moduleName => modules.has(moduleName))
  );
}

async function authorize(request, response, rateLimitKey, maxRequests = 24) {
  const account = await core.identityFromRequest(request);
  if (!account) {
    json(response, 401, { error: 'Sign in before using medication database features.' });
    return null;
  }
  if (!core.storageConfigured()) {
    json(response, 503, { error: 'Secure account access is temporarily unavailable.' });
    return null;
  }
  const access = await core.activeEntitlement(request, account);
  if (!access) {
    json(response, 403, { error: 'Medication database features are included with DoctorAI Pro.' });
    return null;
  }
  const limit = await core.rateLimit(request, `${rateLimitKey}:${core.accountKey(account)}`, maxRequests, 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    json(response, 429, { error: 'Too many medication database requests. Please try again shortly.' });
    return null;
  }
  return account;
}

function providerReady(response) {
  if (configured()) return true;
  json(response, 503, { error: 'Medication database checks are not enabled. A signed commercial agreement for this safety-critical consumer use, written confirmation for New Zealand ingredient-level screening, approved modules, and a server-side API key must be configured first.', code: 'medication_database_not_configured' });
  return false;
}

async function drugBankGetPage(path, parameters = {}) {
  const url = new URL(path.replace(/^\/+/, ''), API_ROOT);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: String(process.env.DRUGBANK_API_KEY || '').trim(),
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(12_000)
  });
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 2_000_000) throw new Error('provider_response_too_large');
  if (!response.ok) {
    const error = new Error('provider_request_failed');
    error.status = response.status;
    throw error;
  }
  return {
    data: await response.json(),
    link: String(response.headers.get('link') || ''),
    totalCount: Number(response.headers.get('x-total-count') || 0)
  };
}

async function drugBankGet(path, parameters = {}) {
  const page = await drugBankGetPage(path, parameters);
  return page.data;
}

function safeProviderFailure(request, error, route) {
  const status = Number(error?.status || 0);
  const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
  core.reportError('medication_database_provider_error', {
    route,
    provider: 'drugbank',
    status: status || undefined,
    timeout
  });
  return { status: timeout ? 504 : 502, error: timeout ? 'The medication database took too long to respond. Try again later.' : 'The medication database is unavailable. No database check was completed.' };
}

function drugId(value) {
  return /^DB\d{5,6}$/.test(String(value || ''));
}

function conditionId(value) {
  return /^DBCOND\d{5,8}$/.test(String(value || ''));
}

module.exports = {
  authorize,
  conditionId,
  configured,
  drugBankGet,
  drugBankGetPage,
  drugId,
  json,
  parseBody,
  providerReady,
  safeProviderFailure
};
