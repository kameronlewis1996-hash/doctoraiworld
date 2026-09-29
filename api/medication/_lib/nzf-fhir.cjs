'use strict';

const NZMT_SYSTEM = 'http://nzmt.org.nz';
const NZMT_TYPE_SYSTEM = 'https://standards.digital.health.nz/ns/nzmt-type-code';
const GTIN_SYSTEM = 'https://www.gs1.org/gtin';
const NZF_TYPE_URL = 'http://hl7.org.nz/fhir/StructureDefinition/nzf-nzmt-type';
const MAX_RESPONSE_BYTES = 2_000_000;
const VALID_GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function cleanText(value, max = 180) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isGtin(value) {
  const text = String(value || '').trim();
  if (!VALID_GTIN_LENGTHS.has(text.length) || !/^\d+$/.test(text)) return false;
  const digits = text.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  let weight = 3;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

function safeBaseUrl(env = process.env) {
  const raw = String(env.NZF_FHIR_BASE_URL || '').trim();
  const allowedHosts = new Set(String(env.NZF_FHIR_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash || !allowedHosts.has(url.hostname.toLowerCase()) || url.pathname.includes('..')) return null;
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

function configured(env = process.env, now = Date.now()) {
  const expiresAt = Date.parse(String(env.NZF_FHIR_ACCESS_TOKEN_EXPIRES_AT || ''));
  return Boolean(
    safeBaseUrl(env) &&
    String(env.NZF_FHIR_ACCESS_TOKEN || '').trim() &&
    Number.isFinite(expiresAt) && expiresAt > now + 30_000 &&
    env.NZF_NZMT_SEARCH_CONSUMER_USE_APPROVED === 'true'
  );
}

function buildProductSearchUrl(query, env = process.env) {
  const base = safeBaseUrl(env);
  if (!base) throw new Error('nzf_fhir_base_not_configured');
  const term = String(query || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!term) throw new Error('empty_search_term');
  const url = new URL('Medication', base);
  if (isGtin(term)) url.searchParams.set('code', `${GTIN_SYSTEM}|${term}`);
  else url.searchParams.set('nzf-preferred-term:contains', term);
  url.searchParams.set('nzf-nzmt-type', 'ctpp');
  url.searchParams.set('_count', '12');
  return url;
}

function codingFor(codeable, system) {
  const codings = Array.isArray(codeable?.coding) ? codeable.coding : [];
  return codings.find(coding => coding?.system === system) || null;
}

function activeIngredients(resource) {
  const source = Array.isArray(resource?.ingredient) ? resource.ingredient : [];
  const knownFlags = source.length > 0 && source.every(item => typeof item?.isActive === 'boolean');
  const activeSource = source.filter(item => item?.isActive === true);
  const active = activeSource.map(item => {
    const coding = codingFor(item?.itemCodeableConcept, NZMT_SYSTEM);
    const id = String(coding?.code || '').trim();
    const name = cleanText(coding?.display || item?.itemCodeableConcept?.text, 120);
    if (!/^\d{7,20}$/.test(id) || !name) return null;
    const numerator = item?.strength?.numerator;
    const denominator = item?.strength?.denominator;
    const strength = numerator && Number.isFinite(Number(numerator.value))
      ? `${numerator.value} ${cleanText(numerator.unit, 30)}${denominator && Number.isFinite(Number(denominator.value)) ? ` / ${denominator.value} ${cleanText(denominator.unit, 30)}` : ''}`.trim()
      : '';
    const specific = (Array.isArray(item?.extension) ? item.extension : []).find(extension => String(extension?.url || '').endsWith('/nzf-specific-substance'));
    const specificCoding = codingFor(specific?.valueCodeableConcept, NZMT_SYSTEM);
    return {
      id,
      name,
      strength,
      specificSubstance: cleanText(specificCoding?.display || specific?.valueCodeableConcept?.text, 120)
    };
  }).filter(Boolean);
  return {
    ingredients: active,
    activeIngredientCount: activeSource.length,
    ingredientsComplete: knownFlags && activeSource.length > 0 && activeSource.length <= 8 && active.length === activeSource.length
  };
}

function normalizeMedication(resource) {
  if (!resource || resource.resourceType !== 'Medication') return null;
  const nzmt = codingFor(resource.code, NZMT_SYSTEM);
  const nzmtId = String(nzmt?.code || '').trim();
  if (!/^\d{7,20}$/.test(nzmtId)) return null;
  const gtins = (Array.isArray(resource.code?.coding) ? resource.code.coding : [])
    .filter(coding => coding?.system === GTIN_SYSTEM && isGtin(coding?.code))
    .map(coding => String(coding.code))
    .filter((value, index, all) => all.indexOf(value) === index);
  const preferred = (Array.isArray(resource.code?.coding) ? resource.code.coding : []).find(coding => coding?.system === NZMT_SYSTEM);
  const typeExtension = (Array.isArray(resource.extension) ? resource.extension : []).find(extension => extension?.url === NZF_TYPE_URL);
  const typeCoding = codingFor(typeExtension?.valueCodeableConcept, NZMT_TYPE_SYSTEM);
  if (typeCoding?.code !== 'ctpp') return null;
  const ingredients = activeIngredients(resource);
  const form = cleanText(resource.form?.text || codingFor(resource.form, NZMT_SYSTEM)?.display, 100);
  return {
    id: nzmtId,
    name: cleanText(preferred?.display || resource.code?.text || resource.text?.div, 180),
    status: cleanText(resource.status, 24),
    productType: cleanText(typeCoding?.code || 'ctpp', 20),
    form,
    gtins,
    ingredients: ingredients.ingredients,
    activeIngredientCount: ingredients.activeIngredientCount,
    ingredientsComplete: ingredients.ingredientsComplete,
    updatedAt: cleanText(resource.meta?.lastUpdated, 40)
  };
}

function parameter(name, value, type) {
  return { name, [`value${type}`]: value };
}

function operationUrl(env = process.env) {
  const base = safeBaseUrl(env);
  if (!base) throw new Error('nzf_fhir_base_not_configured');
  return new URL('Medication/$interactions-between', base);
}

function extensionValue(resource, suffix) {
  const extensions = [
    ...(Array.isArray(resource?.extension) ? resource.extension : []),
    ...(Array.isArray(resource?.interaction?.extension) ? resource.interaction.extension : [])
  ];
  const match = extensions.find(item => String(item?.url || '').endsWith(suffix));
  if (!match) return '';
  const value = match.valueCodeableConcept || match.valueCoding;
  const coding = value?.coding?.[0] || value;
  return cleanText(coding?.display || coding?.code || match.valueString || match.valueDate, 160);
}

function interactionLabel(value, medications) {
  const reference = value?.itemReference?.reference || value?.itemReference || value?.reference || '';
  const id = String(reference).split('/').pop();
  const concept = value?.itemCodeableConcept || value?.itemSubstance || value?.item;
  return cleanText(value?.itemReference?.display || value?.display || medications.get(id) || concept?.text || codingFor(concept, NZMT_SYSTEM)?.display || concept?.coding?.[0]?.display, 160);
}

function interactionRecords(bundle) {
  const resources = bundleResources(bundle);
  const medications = new Map(resources.filter(item => item?.resourceType === 'Medication').map(item => [String(item.id || ''), cleanText(item.code?.text || codingFor(item.code, NZMT_SYSTEM)?.display, 160)]));
  return resources.filter(resource => resource?.resourceType === 'ClinicalUseDefinition' && resource.type === 'interaction').map(resource => {
    const interactants = (Array.isArray(resource.interaction?.interactant) ? resource.interaction.interactant : [])
      .map(item => interactionLabel(item, medications)).filter(Boolean).slice(0, 8);
    return {
      subject: cleanText(resource.subject?.display || medications.get(String(resource.subject?.reference || '').split('/').pop()), 160),
      interactants,
      severity: extensionValue(resource, 'stockleys-interaction-severity-code'),
      warning: extensionValue(resource, 'stockleys-interaction-warning-code'),
      evidence: extensionValue(resource, 'stockleys-interaction-evidence-code'),
      action: extensionValue(resource, 'stockleys-interaction-action-code'),
      route: extensionValue(resource, 'stockleys-interaction-route'),
      modifiedAt: extensionValue(resource, 'stockleys-interaction-modification-date'),
      reviewedAt: extensionValue(resource, 'stockleys-interaction-review-date'),
      textLink: cleanText(resource.extension?.find(item => String(item?.url || '').endsWith('stockleys-interaction-text-link'))?.valueString, 500),
      summary: cleanText(resource.description?.text || resource.description || resource.text?.div, 700)
    };
  });
}

async function readLimited(response) {
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error('nzf_response_too_large');
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error('nzf_response_too_large');
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('nzf_response_too_large');
  return raw;
}

function bundleResources(bundle) {
  return Array.isArray(bundle?.entry) ? bundle.entry.map(entry => entry?.resource).filter(Boolean) : [];
}

function bundleWarnings(bundle) {
  return bundleResources(bundle).filter(resource => resource?.resourceType === 'OperationOutcome').flatMap(resource =>
    (Array.isArray(resource.issue) ? resource.issue : []).filter(issue => ['warning', 'error', 'fatal'].includes(issue?.severity)).map(issue => ({
      severity: cleanText(issue.severity, 12),
      code: cleanText(issue.code, 40),
      details: cleanText(issue.details?.text || (Array.isArray(issue.diagnostics) ? issue.diagnostics.join(' ') : issue.diagnostics), 240)
    }))
  ).slice(0, 12);
}

async function searchProducts(query, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  if (!configured(env, options.now ?? Date.now())) throw new Error('nzf_product_search_not_configured');
  const url = buildProductSearchUrl(query, env);
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${String(env.NZF_FHIR_ACCESS_TOKEN).trim()}`,
      accept: 'application/fhir+json'
    },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) {
    const error = new Error('nzf_product_search_failed');
    error.status = response.status;
    throw error;
  }
  const raw = await readLimited(response);
  const bundle = JSON.parse(raw);
  if (bundle?.resourceType !== 'Bundle') throw new Error('nzf_unexpected_response');
  const gtinQuery = isGtin(query) ? String(query).trim() : '';
  const products = bundleResources(bundle)
    .filter(resource => resource?.resourceType === 'Medication')
    .map(normalizeMedication)
    .filter(Boolean)
    .filter(product => !gtinQuery || product.gtins.includes(gtinQuery))
    .slice(0, 12);
  return { products, warnings: bundleWarnings(bundle), gtinQuery: Boolean(gtinQuery) };
}

async function checkInteractions(productIds, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now ?? Date.now();
  if (!configured(env, now) || env.NZF_INTERACTION_CONSUMER_USE_APPROVED !== 'true' || env.NZF_INTERACTION_DISPLAY_APPROVED !== 'true') {
    throw new Error('nzf_interaction_check_not_configured');
  }
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(value => String(value || '').trim()))];
  if (!ids.length || ids.length > 30 || ids.some(id => !/^\d{7,20}$/.test(id))) throw new Error('invalid_nzmt_product_ids');
  const url = operationUrl(env);
  const parameters = [
    ...ids.map(id => parameter('nzmtid', id, 'String')),
    parameter('includeMedication', true, 'Boolean'),
    parameter('includeConceptMap', true, 'Boolean'),
    parameter('filterComplementaryRecords', true, 'Boolean')
  ];
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${String(env.NZF_FHIR_ACCESS_TOKEN).trim()}`,
      accept: 'application/fhir+json',
      'content-type': 'application/fhir+json'
    },
    body: JSON.stringify({ resourceType: 'Parameters', parameter: parameters }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) {
    const error = new Error('nzf_interaction_check_failed');
    error.status = response.status;
    throw error;
  }
  const bundle = JSON.parse(await readLimited(response));
  if (bundle?.resourceType !== 'Bundle') throw new Error('nzf_unexpected_response');
  const warnings = bundleWarnings(bundle);
  if (warnings.some(item => ['error', 'fatal'].includes(item.severity))) throw new Error('nzf_interaction_validation_failed');
  const interactions = interactionRecords(bundle);
  return {
    interactions,
    warnings,
    status: warnings.length ? 'partial' : 'complete',
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  GTIN_SYSTEM,
  NZMT_SYSTEM,
  activeIngredients,
  buildProductSearchUrl,
  bundleWarnings,
  checkInteractions,
  configured,
  interactionRecords,
  isGtin,
  normalizeMedication,
  operationUrl,
  safeBaseUrl,
  searchProducts
};
