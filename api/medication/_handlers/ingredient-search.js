const drugBank = require('../_lib/drugbank.cjs');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return drugBank.json(response, 405, { error: 'Method not allowed.' });
  const account = await drugBank.authorize(request, response, 'medication-db-search', 24);
  if (!account) return;
  if (!drugBank.providerReady(response)) return;

  let body = {};
  try { body = drugBank.parseBody(request); } catch { return drugBank.json(response, 400, { error: 'Invalid medication database search request.' }); }
  const query = String(body.query || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const type = String(body.type || 'ingredient');
  if (body.consent !== true) return drugBank.json(response, 400, { error: 'Confirm that you want this search term sent to DrugBank before continuing.' });
  if (!query || !['ingredient', 'condition', 'allergy'].includes(type)) return drugBank.json(response, 400, { error: 'Enter an ingredient, allergy presentation, or condition to search.' });

  try {
    const searchPath = type === 'ingredient' ? '/ingredient_names' : type === 'allergy' ? '/allergy_presentations' : '/conditions';
    const payload = await drugBank.drugBankGet(searchPath, { q: query });
    const results = (Array.isArray(payload) ? payload : []).slice(0, 12).flatMap(item => {
      if (type === 'ingredient') {
        if (!drugBank.drugId(item?.drugbank_id) || !item?.name) return [];
        return [{ id: item.drugbank_id, name: String(item.name).slice(0, 160), casNumber: String(item.cas_number || '').slice(0, 40) }];
      }
      const id = String(item?.drugbank_id || '');
      const name = String(item?.title || item?.name || '').replace(/<[^>]*>/g, '').slice(0, 160);
      if (!drugBank.conditionId(id) || !name) return [];
      return [{ id, name, kind: type === 'allergy' ? 'presentation' : 'condition' }];
    });
    return drugBank.json(response, 200, { provider: 'DrugBank Clinical API', type, results, matchRequired: true, message: results.length ? 'Choose the exact database term that matches your medicine label or health record. Similar names are not interchangeable.' : 'No matching database term was returned. This item remains unmatched and will not be included in database checks.' });
  } catch (error) {
    const failure = drugBank.safeProviderFailure(request, error, '/api/medication/ingredient-search');
    return drugBank.json(response, failure.status, { error: failure.error, code: 'medication_database_unavailable' });
  }
};
