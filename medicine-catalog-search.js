(function (root) {
  'use strict';

  const DATA_URL = '/data/medication/nz-pharmac-medicines.json?v=20261001';
  let cataloguePromise;

  function normalise(value) {
    return String(value || '')
      .replace(/[\u00b5\u03bc]g/gi, 'mcg')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[®™]/g, '')
      .toLocaleLowerCase()
      .replace(/\bmicrograms?\b/g, 'mcg')
      .replace(/\bmilligrams?\b/g, 'mg')
      .replace(/\bgrams?\b/g, 'g')
      .replace(/\bmillilit(?:er|re)s?\b/g, 'ml')
      .replace(/(\d)\s+(micrograms?|mcg|mg|grams?|g|ml|units?)\b/g, '$1$2')
      .replace(/[^a-z0-9.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function load() {
    if (!cataloguePromise) {
      cataloguePromise = fetch(DATA_URL, { credentials: 'omit', cache: 'force-cache' })
        .then(response => {
          if (!response.ok) throw new Error('The Pharmac medicine catalogue could not be loaded.');
          return response.json();
        })
        .then(data => {
          if (!data || data.schemaVersion !== 1 || !Array.isArray(data.products) || !Array.isArray(data.ingredients)) {
            throw new Error('The Pharmac medicine catalogue is unavailable.');
          }
          const ingredientById = new Map(data.ingredients
            .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
            .map(item => [item.id, item]));
          const products = data.products
            .filter(item => item && typeof item.name === 'string')
            .map(product => {
              const ingredientRecords = (Array.isArray(product.ingredients) ? product.ingredients : [])
                .map(id => ingredientById.get(id))
                .filter(Boolean);
              const fields = [
                product.id, product.name, product.brand, product.chemical, product.formulation,
                product.market, ...(product.schedules || []), ...(product.pharmacodes || []),
                ...(product.nzmtIds || []), ...(product.ingredients || []),
                ...ingredientRecords.flatMap(item => [item.name, ...(item.aliases || [])])
              ];
              const searchText = normalise(fields.filter(Boolean).join(' '));
              return {
                product,
                ingredientRecords,
                searchText,
                compactSearchText: searchText.replace(/\s/g, ''),
                nameKey: normalise(product.name),
                brandKey: normalise(product.brand),
                chemicalKey: normalise(product.chemical),
                ingredientKeys: ingredientRecords.flatMap(item => [item.name, ...(item.aliases || [])].map(normalise))
              };
            });
          return { ...data, products };
        })
        .catch(error => {
          cataloguePromise = null;
          throw error;
        });
    }
    return cataloguePromise;
  }

  function rank(record, query) {
    if (record.nameKey === query) return 0;
    if (record.brandKey === query || record.chemicalKey === query) return 1;
    if (record.nameKey.startsWith(query) || record.brandKey.startsWith(query) || record.chemicalKey.startsWith(query)) return 2;
    if (record.ingredientKeys.some(term => term.startsWith(query))) return 3;
    return 4;
  }

  function search(catalogue, rawQuery, limit) {
    const query = normalise(rawQuery);
    const tokens = query.split(' ').filter(Boolean);
    if (!catalogue || !Array.isArray(catalogue.products) || !tokens.length) return { matches: [], totalMatches: 0 };
    const compactTokens = tokens.map(token => token.replace(/\s/g, ''));
    const matches = catalogue.products.filter(record =>
      tokens.every((token, index) => record.searchText.includes(token) || record.compactSearchText.includes(compactTokens[index]))
    );
    matches.sort((a, b) => rank(a, query) - rank(b, query) || a.product.name.localeCompare(b.product.name));
    const count = Number.isInteger(limit) ? Math.max(1, Math.min(catalogue.products.length, limit)) : 20;
    return { matches: matches.slice(0, count), totalMatches: matches.length };
  }

  function ingredientSummary(record) {
    const product = record?.product || {};
    const ids = Array.isArray(product.ingredients) ? product.ingredients : [];
    const complete = product.ingredientsComplete === true && ids.length > 0 && ids.length === record.ingredientRecords.length;
    return {
      names: record.ingredientRecords.map(item => item.name),
      complete,
      hasPartialMapping: record.ingredientRecords.length > 0 && !complete
    };
  }

  const api = { load, normalise, search, ingredientSummary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoctorAIMedicineCatalogSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
