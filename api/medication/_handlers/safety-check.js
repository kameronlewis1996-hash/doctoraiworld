const drugBank = require('../_lib/drugbank.cjs');

const MAX_MEDICATIONS = 30;
const MAX_INGREDIENTS = 40;
const MAX_PROFILE_TERMS = 30;
const MAX_PAGES = 6;
const RISK_GROUPS = ['allergies', 'conditions', 'symptoms'];

function stringIds(values, isValid, max) {
  if (!Array.isArray(values) || values.length > max) return null;
  const clean = [...new Set(values.map(value => String(value || '').trim()))];
  return clean.every(isValid) ? clean : null;
}

function getItems(payload, key) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

async function getAll(path, query, collectionKey) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await drugBank.drugBankGetPage(path, { ...query, per_page: 50, page });
    const pageItems = getItems(response.data, collectionKey);
    items.push(...pageItems);
    if (!/rel="next"/i.test(response.link)) return { items, complete: true };
  }
  return { items, complete: false };
}

function contraindicationMatches(entry, conditionIds) {
  const conditions = Array.isArray(entry?.patient_conditions) ? entry.patient_conditions : [];
  return conditions.filter(condition => {
    const ids = [condition?.drugbank_id, condition?.modification_of?.base?.drugbank_id].filter(Boolean);
    return ids.some(id => conditionIds.has(id));
  });
}

function providerAlertText(value, max = 1400) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function providerReferences(value) {
  const entries = Array.isArray(value)
    ? value
    : ['literature_references', 'textbooks', 'external_links', 'attachments'].flatMap(key => Array.isArray(value?.[key]) ? value[key] : []);
  return entries.slice(0, 12).map(item => {
    const pubmedValue = String(item?.pubmed_id || '').trim();
    const pubmedId = /^\d{1,10}$/.test(pubmedValue) ? pubmedValue : '';
    const rawUrl = String(item?.url || '').trim();
    let url = '';
    try {
      const parsed = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl);
      if (parsed.protocol === 'https:') url = parsed.href.slice(0, 1000);
    } catch {}
    const title = providerAlertText(item?.citation || item?.title || (pubmedId ? `PubMed ${pubmedId}` : item?.ref_id), 700);
    return title ? [{ title, pubmedId, url }] : [];
  }).flat().slice(0, 8);
}

const INTERACTION_SEVERITY = { unrated: 0, minor: 1, moderate: 2, major: 3 };
const INTERACTION_EVIDENCE = { level_2: 1, level_1: 2 };

function mergeInteractionAlerts(existing, incoming) {
  const primary = (INTERACTION_SEVERITY[incoming.severity] || 0) > (INTERACTION_SEVERITY[existing.severity] || 0) ? incoming : existing;
  const mergeText = key => [...new Set([existing[key], incoming[key]].filter(Boolean))].join(' ');
  const references = [...new Map([...existing.references, ...incoming.references].map(item => [JSON.stringify(item), item])).values()].slice(0, 8);
  const evidenceLevel = (INTERACTION_EVIDENCE[incoming.evidenceLevel] || 0) > (INTERACTION_EVIDENCE[existing.evidenceLevel] || 0) ? incoming.evidenceLevel : existing.evidenceLevel;
  return {
    ...primary,
    evidenceLevel,
    description: mergeText('description'),
    extendedDescription: mergeText('extendedDescription'),
    management: mergeText('management'),
    action: mergeText('action'),
    references
  };
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  }));
  return results;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return drugBank.json(response, 405, { error: 'Method not allowed.' });
  const account = await drugBank.authorize(request, response, 'medication-db-check', 6);
  if (!account) return;
  if (!drugBank.providerReady(response)) return;

  let body = {};
  try { body = drugBank.parseBody(request); } catch { return drugBank.json(response, 400, { error: 'Invalid medication safety check request.' }); }
  if (body.consent !== true) return drugBank.json(response, 400, { error: 'Confirm that you want to send the selected medication and health-risk identifiers to DrugBank before checking.' });
  if (body.contextReviewed !== true) return drugBank.json(response, 400, { error: 'Review your saved allergy, condition, and current symptom details before running a safety check.' });
  if (!body.reviewed || RISK_GROUPS.some(group => body.reviewed[group] !== true)) return drugBank.json(response, 400, { error: 'Review allergies, health conditions, and current symptoms separately before checking.' });
  if (!Array.isArray(body.medications) || !body.medications.length || body.medications.length > MAX_MEDICATIONS) return drugBank.json(response, 400, { error: 'Add up to 30 medications before checking the list.' });

  const medications = [];
  for (const item of body.medications) {
    const id = String(item?.id || '').trim();
    if (!/^med-[A-Za-z0-9_-]{1,80}$/.test(id)) return drugBank.json(response, 400, { error: 'A saved medication entry could not be read.' });
    const ingredientIds = stringIds(item?.ingredientIds, drugBank.drugId, 8);
    if (!ingredientIds) return drugBank.json(response, 400, { error: 'A normalized ingredient identifier was not valid.' });
    const expectedIngredientCount = Number(item?.expectedIngredientCount);
    if (!Number.isInteger(expectedIngredientCount) || expectedIngredientCount < 1 || expectedIngredientCount > 8) return drugBank.json(response, 400, { error: 'A saved medicine ingredient count could not be read.' });
    medications.push({ id, ingredientIds, expectedIngredientCount });
  }
  const allergyPresentations = stringIds(body.allergyPresentationIds || [], drugBank.conditionId, MAX_PROFILE_TERMS);
  const allergyIngredients = stringIds(body.allergyIngredientIds || [], drugBank.drugId, MAX_PROFILE_TERMS);
  const conditions = stringIds(body.conditionIds || [], drugBank.conditionId, MAX_PROFILE_TERMS);
  const symptoms = stringIds(body.symptomConditionIds || [], drugBank.conditionId, MAX_PROFILE_TERMS);
  if (!allergyPresentations || !allergyIngredients || !conditions || !symptoms) return drugBank.json(response, 400, { error: 'A mapped allergy, condition, or symptom identifier was not valid.' });
  const unmappedTerms = {};
  for (const group of RISK_GROUPS) {
    const rawCount = body.unmappedTerms?.[group];
    const count = rawCount === undefined || rawCount === null ? 0 : Number(rawCount);
    if (!Number.isInteger(count) || count < 0 || count > MAX_PROFILE_TERMS) return drugBank.json(response, 400, { error: 'A health profile review count could not be read.' });
    unmappedTerms[group] = count;
  }

  const allIngredients = [...new Set(medications.flatMap(item => item.ingredientIds))];
  if (!allIngredients.length) return drugBank.json(response, 409, { error: 'No medicine has a confirmed database ingredient match. Unmatched medicines were not checked.' , code: 'medications_unmatched' });
  if (allIngredients.length > MAX_INGREDIENTS) return drugBank.json(response, 400, { error: 'The active list contains too many distinct ingredients for one check.' });
  const ingredientOwners = new Map();
  medications.forEach(medication => medication.ingredientIds.forEach(id => {
    if (!ingredientOwners.has(id)) ingredientOwners.set(id, []);
    ingredientOwners.get(id).push(medication.id);
  }));
  const duplicateIngredients = [...ingredientOwners.entries()].filter(([, owners]) => owners.length > 1).map(([ingredientId, medicationIds]) => ({ ingredientId, medicationIds }));
  const unmatchedMedicationCount = medications.filter(item => item.expectedIngredientCount > item.ingredientIds.length).length;
  const hasAllergyTerms = allergyPresentations.length + allergyIngredients.length > 0;

  const checks = {
    interactions: { status: allIngredients.length < 2 ? 'not_applicable' : 'unavailable', alerts: [] },
    allergies: { status: !hasAllergyTerms ? 'none_declared' : 'unavailable', alerts: [] },
    conditions: { status: !conditions.length ? 'none_declared' : 'unavailable', alerts: [] },
    symptoms: { status: !symptoms.length ? 'none_declared' : 'unavailable', alerts: [] },
    duplicateIngredients: { status: 'checked', alerts: duplicateIngredients }
  };
  const failures = [];

  if (allIngredients.length >= 2) {
    try {
      const result = await getAll('/ddi', { drugbank_id: allIngredients.join(','), include_references: true }, 'interactions');
      const interactionPairs = new Map();
      const normalizedInteractions = result.items.map(item => ({
        ingredientId: item?.ingredient?.drugbank_id || item?.product_ingredient?.drugbank_id || '',
        ingredient: providerAlertText(item?.ingredient?.name || item?.product_ingredient?.name, 160),
        affectedIngredientId: item?.affected_ingredient?.drugbank_id || item?.affected_product_ingredient?.drugbank_id || '',
        affectedIngredient: providerAlertText(item?.affected_ingredient?.name || item?.affected_product_ingredient?.name, 160),
        severity: ['minor', 'moderate', 'major'].includes(item?.severity) ? item.severity : 'unrated',
        evidenceLevel: providerAlertText(item?.evidence_level, 40),
        description: providerAlertText(item?.description),
        extendedDescription: providerAlertText(item?.extended_description),
        management: providerAlertText(item?.management),
        action: providerAlertText(item?.action, 120),
            references: providerReferences(item?.references)
      })).filter(item => allIngredients.includes(item.ingredientId) && allIngredients.includes(item.affectedIngredientId) && item.ingredientId !== item.affectedIngredientId);
      normalizedInteractions.forEach(item => {
        const pair = [item.ingredientId, item.affectedIngredientId].sort().join(':');
        const existing = interactionPairs.get(pair);
        interactionPairs.set(pair, existing ? mergeInteractionAlerts(existing, item) : item);
      });
      checks.interactions = {
        status: result.complete ? 'checked' : 'partial',
        alerts: [...interactionPairs.values()]
      };
      if (!result.complete) failures.push('Some interaction pages could not be retrieved.');
    } catch (error) {
      failures.push(drugBank.safeProviderFailure(request, error, '/api/medication/safety-check').error);
    }
  }

  if (hasAllergyTerms) {
    const allergyAlerts = [];
    let allergyPartial = false;
    if (allergyPresentations.length) {
      try {
        const result = await drugBank.drugBankGet('/allergy_checker', {
          condition_id: allergyPresentations.join(','),
          drugbank_id: allIngredients.join(','),
          include_references: true
        });
        const presentations = Array.isArray(result?.allergic_presentations) ? result.allergic_presentations : [];
        presentations.forEach(presentation => {
          const causativeIngredients = (Array.isArray(presentation?.possible_causative_entries) ? presentation.possible_causative_entries : [])
            .map(entry => entry?.ingredient)
            .filter(ingredient => ingredient && allIngredients.includes(ingredient.drugbank_id))
            .map(ingredient => ({ id: ingredient.drugbank_id, name: providerAlertText(ingredient.name, 160) }));
          if (!causativeIngredients.length) return;
          allergyAlerts.push({
            kind: 'allergy_presentation',
            presentationId: String(presentation?.drugbank_id || ''),
            presentation: providerAlertText(presentation?.name, 160),
            ingredients: causativeIngredients,
            references: providerReferences(presentation?.references)
          });
        });
      } catch (error) {
        allergyPartial = true;
        failures.push(drugBank.safeProviderFailure(request, error, '/api/medication/safety-check').error);
      }
    }
    const exactAllergyMatches = allergyIngredients.filter(id => allIngredients.includes(id));
    exactAllergyMatches.forEach(id => allergyAlerts.push({ kind: 'exact_ingredient', knownIngredientId: id, matchedIngredientId: id }));
    if (allergyIngredients.length) {
      const results = await mapLimit(allergyIngredients, 6, async allergyIngredientId => {
        try {
          const result = await getAll(`/drugs/${encodeURIComponent(allergyIngredientId)}/cross_sensitivities`, { include_references: true }, 'cross_sensitivities');
          const matches = result.items.flatMap(entry => (Array.isArray(entry?.cross_sensitive_drugs) ? entry.cross_sensitive_drugs : [])
            .filter(item => allIngredients.includes(item?.drugbank_id))
            .map(item => ({
              kind: 'cross_sensitivity',
              knownIngredientId: allergyIngredientId,
              matchedIngredientId: item.drugbank_id,
              matchedIngredient: providerAlertText(item.name, 160),
              summary: providerAlertText(entry?.summary),
              description: providerAlertText(entry?.description),
              incidence: providerAlertText(entry?.incidence, 80),
              evidence: Array.isArray(entry?.evidence_type) ? entry.evidence_type.map(value => providerAlertText(value, 80)).slice(0, 12) : [],
              references: providerReferences(entry?.references)
            })));
          return { matches, complete: result.complete };
        } catch (error) {
          return { matches: [], complete: false, error: drugBank.safeProviderFailure(request, error, '/api/medication/safety-check').error };
        }
      });
      allergyAlerts.push(...results.flatMap(result => result.matches));
      if (results.some(result => !result.complete)) {
        allergyPartial = true;
        failures.push(...results.map(result => result.error).filter(Boolean));
      }
    }
    checks.allergies = { status: allergyPartial ? 'partial' : 'checked', alerts: allergyAlerts };
  }

  if (!hasAllergyTerms) {
    checks.allergies = { status: 'none_declared', alerts: [] };
  }

  if (conditions.length) {
    const conditionSet = new Set(conditions);
    try {
      const results = await mapLimit(allIngredients, 6, async ingredientId => {
        const result = await getAll(`/drugs/${encodeURIComponent(ingredientId)}/contraindications`, { include_references: true }, '');
        const matches = result.items.flatMap(entry => contraindicationMatches(entry, conditionSet).map(condition => ({
          ingredientId,
          ingredient: providerAlertText(entry?.drug?.name, 160),
          conditionId: condition.drugbank_id || condition.modification_of?.base?.drugbank_id || '',
          condition: providerAlertText(condition.name, 160),
          severity: providerAlertText([...(Array.isArray(condition.modification_of?.severity?.includes) ? condition.modification_of.severity.includes : []), ...(Array.isArray(condition.severity?.includes) ? condition.severity.includes : [])].join(', '), 100),
          recommendedActions: Array.isArray(entry?.recommended_actions) ? entry.recommended_actions.map(value => providerAlertText(value)).slice(0, 8) : [],
          references: providerReferences(entry?.references)
        })));
        return { matches, complete: result.complete };
      });
      checks.conditions = { status: results.every(result => result.complete) ? 'checked' : 'partial', alerts: results.flatMap(result => result.matches) };
      if (results.some(result => !result.complete)) failures.push('Some condition contraindication pages could not be retrieved.');
    } catch (error) {
      checks.conditions.status = 'unavailable';
      failures.push(drugBank.safeProviderFailure(request, error, '/api/medication/safety-check').error);
    }
  }

  if (symptoms.length) {
    try {
      const symptomSet = new Set(symptoms);
      const results = await mapLimit(allIngredients, 6, async ingredientId => {
        const result = await getAll(`/drugs/${encodeURIComponent(ingredientId)}/adverse_effects`, { include_references: true }, '');
        const matches = result.items.filter(entry => symptomSet.has(entry?.effect?.drugbank_id)).map(entry => ({
          ingredientId,
          ingredient: providerAlertText(entry?.drug?.name, 160),
          symptomId: entry?.effect?.drugbank_id || '',
          symptom: providerAlertText(entry?.effect?.name, 160),
          evidence: Array.isArray(entry?.evidence_type) ? entry.evidence_type.map(value => providerAlertText(value, 80)).slice(0, 12) : [],
          incidence: Array.isArray(entry?.incidences) ? entry.incidences.slice(0, 8).map(value => ({ kind: providerAlertText(value?.kind, 80), name: providerAlertText(value?.name, 120), percent: providerAlertText(value?.percent, 80) })) : [],
          route: Array.isArray(entry?.route) ? entry.route.map(value => providerAlertText(value, 80)).slice(0, 8) : [],
          doseForm: Array.isArray(entry?.dose_form) ? entry.dose_form.map(value => providerAlertText(value, 80)).slice(0, 8) : [],
          ageGroups: Array.isArray(entry?.age_groups) ? entry.age_groups.map(value => providerAlertText(value, 80)).slice(0, 8) : [],
          references: providerReferences(entry?.references)
        }));
        return { matches, complete: result.complete };
      });
      checks.symptoms = { status: results.every(result => result.complete) ? 'checked' : 'partial', alerts: results.flatMap(result => result.matches) };
      if (results.some(result => !result.complete)) failures.push('Some adverse-effect pages could not be retrieved.');
    } catch (error) {
      checks.symptoms.status = 'unavailable';
      failures.push(drugBank.safeProviderFailure(request, error, '/api/medication/safety-check').error);
    }
  }

  const hasUnmappedTerms = RISK_GROUPS.some(group => unmappedTerms[group] > 0);
  const status = failures.length || unmatchedMedicationCount > 0 || hasUnmappedTerms || Object.values(checks).some(check => ['partial', 'unavailable', 'not_provided'].includes(check.status)) ? 'incomplete' : 'complete';
  return drugBank.json(response, 200, {
    provider: 'DrugBank Clinical API',
    checkedAt: new Date().toISOString(),
    status,
    checks,
    unmatchedMedicationCount,
    unmappedTerms,
    failures,
    messages: {
      clearResult: 'No matching alert was returned for the selected, matched ingredients and risk terms. This does not prove the medicines are safe for you.',
      symptomResult: 'A database match shows a possible known adverse-effect association. It does not establish that a medicine caused the symptom.'
    }
  });
};
