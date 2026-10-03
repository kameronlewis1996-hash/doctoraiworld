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
    json(response, 401, { error: 'Sign in before searching the New Zealand medicine catalogue.' });
    return null;
  }
  if (!core.storageConfigured()) {
    json(response, 503, { error: 'Secure account access is temporarily unavailable.' });
    return null;
  }
  const access = await core.activeEntitlement(request, account);
  if (!access) {
    json(response, 403, { error: 'New Zealand medicine matching is included with DoctorAI Pro.' });
    return null;
  }
  const limit = await core.rateLimit(request, `nzf-product-search:${core.accountKey(account)}`, 18, 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    json(response, 429, { error: 'Too many medicine searches. Please try again shortly.' });
    return null;
  }
  return account;
}

module.exports = async function handler(request, response) {
  if (require('../../../server-src/_lib/preview-provider-guard.cjs').blockPreview(response, 'medication')) return;
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' });
  const account = await authorize(request, response);
  if (!account) return;
  if (!nzf.configured()) {
    return json(response, 503, {
      error: 'The New Zealand medicine catalogue is not enabled. Provider access, consumer-use approval, and server credentials must be configured first.',
      code: 'nzf_product_search_not_configured'
    });
  }

  let body = {};
  try { body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {}); }
  catch { return json(response, 400, { error: 'Invalid medicine search request.' }); }
  if (body.consent !== true) return json(response, 400, { error: 'Confirm that you want to send this medicine name or barcode to NZF/NZULM for product matching.' });
  const query = String(body.query || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!query) return json(response, 400, { error: 'Enter a medicine name or scan a package barcode to search.' });

  try {
    const result = await nzf.searchProducts(query);
    return json(response, 200, {
      provider: 'NZF/NZULM',
      checkedAt: new Date().toISOString(),
      searchType: result.gtinQuery ? 'gtin' : 'product_name',
      products: result.products,
      warnings: result.warnings,
      message: result.products.length
        ? 'Confirm the exact product, strength, form, and package against the medicine in your hand. A product match is not a safety check.'
        : 'No exact product result was returned. Keep this medicine unmatched; do not treat the absence of a result as evidence of safety.'
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    core.reportError('nzf_product_search_error', {
      route: '/api/medication/nzf-product-search',
      provider: 'nzf_nzulm',
      status: status || undefined,
      timeout
    });
    return json(response, timeout ? 504 : 502, {
      error: timeout ? 'The New Zealand medicine catalogue took too long to respond. Try again later.' : 'The New Zealand medicine catalogue is unavailable. No product match was completed.',
      code: 'nzf_product_search_unavailable'
    });
  }
};
