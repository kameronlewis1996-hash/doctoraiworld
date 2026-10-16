'use strict';

// A terminology lookup only. In particular, this module does not produce
// interaction matches, route-sensitive safety claims, or clinical advice.
const FIELD_NAMES = ['productId', 'nzmtId', 'pharmacode', 'brand', 'chemical', 'formulation'];
const ROUTE_PATTERNS = [
  ['oral', /\boral\b/i],
  ['eye', /\b(?:eye|ophthalmic|ocular)\b/i],
  ['ear', /\b(?:ear|otic)\b/i],
  ['vaginal', /\bvaginal\b/i],
  ['inhaled', /\b(?:inhalation|inhaled|nebuliser|nebulizer)\b/i],
  ['nasal', /\bnasal\b/i],
  ['rectal', /\brectal\b/i],
];

function exact(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-NZ') : '';
}

function sourceRoute(formulation) {
  const matches = ROUTE_PATTERNS.filter(([, pattern]) => pattern.test(formulation)).map(([route]) => route);
  return matches.length === 1 ? { value: matches[0], evidence: 'explicit-formulation-text' } : { value: null, evidence: matches.length ? 'conflicting-formulation-text' : 'not-explicit-in-source' };
}

function indexRows(rows, key) {
  const index = new Map();
  for (const row of rows) {
    const value = exact(key(row));
    if (!value) continue;
    if (!index.has(value)) index.set(value, new Set());
    index.get(value).add(row.productId || row.id);
  }
  return index;
}

function createIdentityCatalogue(catalogue, packs = null) {
  if (!catalogue || !Array.isArray(catalogue.products) || !Array.isArray(catalogue.ingredients)) throw new TypeError('Medicine catalogue is required');
  if (packs && (packs.datasetVersion !== catalogue.datasetVersion ||
    JSON.stringify(packs.sources) !== JSON.stringify(catalogue.sources) ||
    JSON.stringify(packs.licence) !== JSON.stringify(catalogue.licence) ||
    !Array.isArray(packs.packs))) throw new TypeError('Pack snapshot must match medicine catalogue and source');
  const products = new Map(catalogue.products.map(product => [product.id, product]));
  if (products.size !== catalogue.products.length) throw new TypeError('Duplicate product IDs');
  if (packs && packs.packs.some(pack => !products.has(pack.productId))) throw new TypeError('Pack references an unknown formulation');
  const ingredients = new Map(catalogue.ingredients.map(item => [item.id, item]));
  const indexes = {
    productId: indexRows(catalogue.products, item => item.id),
    nzmtId: indexRows(catalogue.products.flatMap(item => item.nzmtIds.map(id => ({ productId: item.id, id }))), item => item.id),
    pharmacode: indexRows(catalogue.products.flatMap(item => item.pharmacodes.map(id => ({ productId: item.id, id }))), item => item.id),
    brand: indexRows(catalogue.products, item => item.brand),
    chemical: indexRows(catalogue.products, item => item.chemical),
    formulation: indexRows(catalogue.products, item => item.formulation),
  };
  const packIndexes = packs ? {
    pharmacode: indexRows(packs.packs, item => item.pharmacode),
    nzmtId: indexRows(packs.packs, item => item.nzmtId),
  } : null;

  function resolve(query) {
    if (!query || typeof query !== 'object' || Array.isArray(query)) return { status: 'incomplete', reasons: ['structured-identity-required'] };
    const keys = FIELD_NAMES.filter(field => exact(query[field]));
    if (!exact(query.region)) return { status: 'incomplete', reasons: ['region-required'] };
    if (exact(query.region) !== 'nz') return { status: 'unknown', reasons: ['region-not-in-source'] };
    if (!keys.length) return { status: 'incomplete', reasons: ['exact-identifier-or-product-fields-required'] };
    // An unbranded/generic name or a form alone must never identify a source
    // row. The full branded tuple is the only text-based identity path.
    const hasIdentifier = keys.some(key => ['productId', 'nzmtId', 'pharmacode'].includes(key));
    if (!hasIdentifier && !['brand', 'chemical', 'formulation'].every(key => keys.includes(key))) {
      return { status: 'incomplete', reasons: ['source-identifier-or-full-branded-tuple-required'] };
    }
    let candidates = null;
    for (const key of keys) {
      const value = exact(query[key]);
      const source = packIndexes && (key === 'pharmacode' || key === 'nzmtId') ? packIndexes[key] : indexes[key];
      const ids = source.get(value) || new Set();
      candidates = candidates === null ? new Set(ids) : new Set([...candidates].filter(id => ids.has(id)));
    }
    if (!candidates.size) {
      // Distinguish contradictory supplied facts from an unsupported shelf
      // name. We never choose one claim over another.
      const independentlyKnown = keys.filter(key => (packIndexes && (key === 'pharmacode' || key === 'nzmtId') ? packIndexes[key] : indexes[key]).has(exact(query[key])));
      const knownIdentifier = independentlyKnown.some(key => ['productId', 'nzmtId', 'pharmacode'].includes(key));
      return { status: knownIdentifier || independentlyKnown.length > 1 ? 'conflicting' : 'unknown', reasons: ['no-single-source-record-matches-all-fields'] };
    }
    if (candidates.size !== 1) return { status: 'ambiguous', reasons: ['multiple-source-formulations'], candidateCount: candidates.size };
    const product = products.get([...candidates][0]);
    if (exact(product.market) !== exact(query.region)) return { status: 'unknown', reasons: ['region-not-in-source'] };
    const route = sourceRoute(product.formulation);
    if (exact(query.route) && exact(query.route) !== exact(route.value)) {
      return { status: route.value ? 'conflicting' : 'incomplete', reasons: [route.value ? 'route-conflicts-with-source' : 'route-not-verified-by-source'], productId: product.id };
    }
    const ingredientIds = product.ingredients.filter(id => ingredients.has(id));
    const ingredientStatus = product.ingredientsComplete && ingredientIds.length === product.ingredients.length && ingredientIds.length > 0 ? 'complete-in-catalogue' : 'incomplete-in-catalogue';
    return {
      status: 'matched',
      productId: product.id,
      region: product.market,
      brand: product.brand || null,
      chemicalStatement: product.chemical,
      formulationStatement: product.formulation,
      // The source does not provide a reliable per-ingredient strength map.
      strengthState: /\d/.test(product.formulation) ? 'present-in-formulation-statement' : 'not-stated',
      ingredientStatus,
      ingredients: ingredientIds.map(id => ({ id, name: ingredients.get(id).name })),
      route,
      sourceIds: { pharmacodes: product.pharmacodes, nzmtIds: product.nzmtIds },
      sourceDate: catalogue.sources[0].effectiveDate,
      sourceLicence: catalogue.licence.name,
      assessment: 'identity-only',
    };
  }
  return { resolve };
}

module.exports = { createIdentityCatalogue, sourceRoute };
