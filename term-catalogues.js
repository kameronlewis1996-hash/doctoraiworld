// Local, rights-reviewed terminology labels. These labels do not create clinical rules.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DoctorAITerminology = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const paths = ['/catalogues/conditions.v1.json', '/catalogues/medicines.v1.json', '/catalogues/allergies-reactions.v1.json'];
  const statusValues = new Set(['current', 'historical', 'unsure']);
  const certaintyValues = new Set(['confirmed', 'suspected', 'unsure', 'legacy']);
  let pending;

  function normalise(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function search(entries, query, limit = 7) {
    const needle = normalise(query);
    if (!needle) return entries.slice(0, limit);
    return entries.map(entry => {
      const names = [entry.label, ...(entry.aliases || [])].map(normalise);
      const rank = names.some(name => name === needle) ? 0 : names.some(name => name.startsWith(needle)) ? 1 : names.some(name => name.includes(needle)) ? 2 : 3;
      return { entry, rank };
    }).filter(item => item.rank < 3).sort((a, b) => a.rank - b.rank || a.entry.label.localeCompare(b.entry.label)).slice(0, limit).map(item => item.entry);
  }
  function validEntries(entries, prefix) {
    if (!Array.isArray(entries)) return false;
    const seen = new Set();
    return entries.every(entry => {
      if (!entry || typeof entry !== 'object' || !new RegExp('^' + prefix + ':[0-9]+$').test(entry.id) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return typeof entry.label === 'string' && entry.label.trim().length > 0 && entry.label.length <= 120 && Array.isArray(entry.aliases) && entry.aliases.every(alias => typeof alias === 'string' && alias.length <= 120) && /^https:\/\//.test(entry.sourceUrl || '');
    });
  }
  function validate(catalogues) {
    const [conditions, medicines, allergies] = catalogues;
    return Boolean(conditions?.schemaVersion === 1 && medicines?.schemaVersion === 1 && allergies?.schemaVersion === 1 &&
      conditions.catalogue === 'conditions-history' && medicines.catalogue === 'medicine-identities' && allergies.catalogue === 'allergies-reactions' &&
      conditions.source?.license === 'CC0-1.0' && medicines.source?.license === 'CC-BY-4.0' &&
      validEntries(conditions.entries, 'DOID') && validEntries(medicines.ingredients, 'CHEBI') && Array.isArray(medicines.localProducts) &&
      validEntries(allergies.substances, 'CHEBI') && validEntries(allergies.reactions, 'SYMP') &&
      Array.isArray(allergies.sources) && allergies.sources.every(source => ['CC0-1.0', 'CC-BY-4.0'].includes(source.license) && /^https:\/\//.test(source.url || '')) &&
      [...allergies.substances, ...allergies.reactions].every(entry => ['CC0-1.0', 'CC-BY-4.0'].includes(entry.license)));
  }
  function load(fetcher = typeof fetch === 'function' ? fetch.bind(globalThis) : null) {
    if (!fetcher) return Promise.reject(new Error('Local catalogue fetch is unavailable'));
    if (!pending) pending = Promise.all(paths.map(async path => {
      const response = await fetcher(path, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Local catalogue unavailable: ' + path);
      return response.json();
    })).then(catalogues => {
      if (!validate(catalogues)) throw new Error('Local catalogue validation failed');
      return { conditions: catalogues[0], medicines: catalogues[1], allergies: catalogues[2] };
    }).catch(error => { pending = null; throw error; });
    return pending;
  }
  function legacyPieces(value) {
    return String(value || '').split(/[,;\n]/).map(part => part.trim()).filter(Boolean);
  }
  function conditionEntries(profile) {
    if (Array.isArray(profile?.conditionEntries)) return profile.conditionEntries.filter(item => item && typeof item.label === 'string').map(item => ({ id: String(item.id || ''), label: item.label.slice(0, 120), status: statusValues.has(item.status) ? item.status : 'unsure', source: String(item.source || 'user') }));
    return legacyPieces(profile?.conditions).map((label, index) => ({ id: 'legacy-condition-' + index, label: label.slice(0, 120), status: 'unsure', source: 'legacy' }));
  }
  function allergyEntries(profile) {
    if (Array.isArray(profile?.allergyEntries)) return profile.allergyEntries.filter(item => item && typeof item.substance === 'string').map(item => ({ id: String(item.id || ''), substance: item.substance.slice(0, 120), reactionId: String(item.reactionId || ''), reaction: String(item.reaction || '').slice(0, 120), certainty: certaintyValues.has(item.certainty) ? item.certainty : 'unsure', source: String(item.source || 'user') }));
    return legacyPieces(profile?.allergies).map((substance, index) => ({ id: 'legacy-allergy-' + index, substance: substance.slice(0, 120), reactionId: '', reaction: '', certainty: 'legacy', source: 'legacy' }));
  }
  function compatibilityFields(conditions, allergies) {
    return {
      conditions: conditions.filter(item => item.status !== 'historical').map(item => item.label).join(', '),
      allergies: allergies.filter(item => item.certainty === 'confirmed' || item.certainty === 'legacy').map(item => item.substance).join(', ')
    };
  }
  return { paths, normalise, search, validate, load, conditionEntries, allergyEntries, compatibilityFields };
});
