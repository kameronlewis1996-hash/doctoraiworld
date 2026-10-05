'use strict';

const db = require('../../data/medication/medication-safety.seed.json');
const nz = require('../../data/medication/nz-pharmac-medicines.json');

const norm = value => String(value || '').toLowerCase().replace(/[®™]/g, '').replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/[^a-z0-9.]+/g, ' ').trim();
const ingredients = new Map([...nz.ingredients, ...db.ingredients].map(item => [item.id, item]));
const ingredientTerms = ingredient => [ingredient.name, ...(ingredient.aliases || [])].map(norm).filter(Boolean);
const strengthSuffix = /^(?:\d+(?:\.\d+)?\s*(?:mg|mcg|micrograms?|g|grams?|ml|units?))(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|micrograms?|g|grams?|ml|units?))*$/;
const strengthToken = /(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|grams?|g|ml|units?)\b/gi;
const index = new Map();
const labelIngredientIndex = new Map();

function addTerm(term, record) {
  const key = norm(term);
  if (key) index.set(key, [...(index.get(key) || []), record]);
}

function addLabelIngredientTerm(term, ingredient) {
  const key = norm(term);
  if (key) labelIngredientIndex.set(key, [...(labelIngredientIndex.get(key) || []), ingredient.id]);
}

for (const product of nz.products) {
  for (const term of [product.name, product.brand, product.chemical, `${product.chemical} ${product.formulation}`, product.brand && `${product.brand} ${product.formulation}`]) addTerm(term, product);
}
for (const product of db.products) addTerm(product.name, { ...product, ingredientsComplete: true });
for (const ingredient of ingredients.values()) {
  for (const term of ingredientTerms(ingredient)) {
    addLabelIngredientTerm(term, ingredient);
    // Official ambiguous/incomplete product headings must not fall back to a
    // convenient single-substance interpretation.
    if (!index.has(term)) addTerm(term, { name: ingredient.name, ingredients: [ingredient.id], ingredientsComplete: true });
  }
}

function lookupCandidates(value) {
  const query = norm(value);
  if (!query) return { query, candidates: null, strengthInName: '' };
  const exact = index.get(query);
  if (exact) return { query, candidates: exact, strengthInName: '' };
  const words = query.split(' ');
  for (let cut = words.length - 1; cut > 0; cut -= 1) {
    const suffix = words.slice(cut).join(' ');
    if (strengthSuffix.test(suffix)) {
      const candidates = index.get(words.slice(0, cut).join(' '));
      if (candidates) return { query, candidates, strengthInName: suffix };
    }
  }
  return { query, candidates: null, strengthInName: '' };
}

function strengthProfile(value) {
  const matches = [...String(value || '').matchAll(strengthToken)];
  return matches.map(match => {
    const rawUnit = match[2].toLowerCase();
    const unit = rawUnit.startsWith('micro') || rawUnit === 'mcg' ? 'mcg'
      : rawUnit === 'grams' || rawUnit === 'gram' || rawUnit === 'g' ? 'g'
        : rawUnit === 'ml' ? 'ml'
          : rawUnit.startsWith('unit') ? 'units' : 'mg';
    return `${Number(match[1])} ${unit}`;
  }).sort();
}

function strengthAssessment(candidates, nameStrength, dose) {
  const supplied = String(dose || '').trim();
  const embeddedProfile = strengthProfile(nameStrength);
  const suppliedProfile = strengthProfile(supplied);
  if (embeddedProfile.length && suppliedProfile.length && (embeddedProfile.length !== suppliedProfile.length || embeddedProfile.some((token, index) => token !== suppliedProfile[index]))) {
    return { status: 'unverified', reason: 'The strength shown in the medicine name and the strength/dose field do not agree; no dose-level check was performed.' };
  }
  const requestedProfile = suppliedProfile.length ? suppliedProfile : embeddedProfile;
  if (!supplied && !nameStrength) return { status: 'not_provided', reason: 'No explicit strength or dose value was available to compare.' };
  if (!requestedProfile.length) return { status: 'unverified', reason: 'The entered strength or dose could not be compared with a numeric catalogue strength.' };

  const products = (candidates || []).filter(item => item && (item.formulation || item.schedules));
  const listedProfiles = products.map(item => ({ item, profile: strengthProfile(item.formulation || item.name) })).filter(item => item.profile.length);
  if (!listedProfiles.length) return { status: 'unverified', reason: 'The local catalogue has no verified product strength for this name; no dose-level check was performed.' };

  const exactListedMatch = listedProfiles.some(item => item.profile.length === requestedProfile.length && item.profile.every((token, index) => token === requestedProfile[index]));
  if (exactListedMatch) return { status: 'listed_match', reason: 'An exact numeric strength appears in the local product catalogue. This does not confirm the medicine, prescribed dose, route or schedule.' };
  return { status: 'unverified', reason: 'This numeric strength did not exactly match a listed catalogue formulation. The catalogue may be incomplete; no dose-level check was performed.' };
}

function resolveByName(name) {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const { candidates, strengthInName } = lookupCandidates(trimmedName);
  if (!trimmedName) return { name: trimmedName, ingredients: [], status: 'unknown', matchState: 'missing_name', reason: 'Missing medicine name' };
  if (!candidates) return { name: trimmedName, ingredients: [], status: 'unknown', matchState: 'unmatched', reason: 'No exact terminology match' };
  const signatures = new Set(candidates.map(item => [...(Array.isArray(item.ingredients) ? item.ingredients : [])].sort().join('|')));
  if (signatures.size !== 1 || candidates.some(item => !item.ingredientsComplete || !Array.isArray(item.ingredients) || !item.ingredients.length || item.ingredients.some(id => !ingredients.has(id)))) {
    return { name: trimmedName, ingredients: [], status: 'unknown', matchState: 'ambiguous_or_incomplete', reason: 'Ambiguous product or incomplete ingredient listing; choose the full brand, generic name and formulation', candidates: candidates.slice(0, 5).map(item => item.name) };
  }
  const product = candidates[0];
  return {
    name: trimmedName,
    ingredients: [...new Set(product.ingredients)].map(id => ingredients.get(id)),
    status: 'resolved',
    matchState: 'resolved_by_name',
    matched: candidates.length === 1 ? product.name : trimmedName,
    basis: 'catalogue_name',
    identityOnly: true,
    strength: strengthAssessment(candidates, strengthInName, ''),
    source: product.schedules ? { publisher: 'Pharmac Pharmaceutical Schedule', effectiveDate: nz.sources[0].effectiveDate } : { publisher: 'DoctorAI curated terminology' }
  };
}

function resolveConfirmedIngredients(values) {
  if (!Array.isArray(values) || !values.length || values.length > 8) return { ok: false, reason: 'No complete user-confirmed active-ingredient list was supplied.' };
  const mapped = [];
  for (const value of values) {
    const term = norm(value);
    const ids = [...new Set(labelIngredientIndex.get(term) || [])];
    if (ids.length !== 1) return { ok: false, reason: ids.length ? `The confirmed ingredient “${String(value).trim()}” matches more than one catalogue term.` : `The confirmed ingredient “${String(value).trim()}” is not in the local terminology.` };
    const ingredient = ingredients.get(ids[0]);
    if (!ingredient) return { ok: false, reason: `The confirmed ingredient “${String(value).trim()}” has no local record.` };
    mapped.push(ingredient);
  }
  const unique = [...new Map(mapped.map(item => [item.id, item])).values()];
  if (unique.length !== mapped.length) return { ok: false, reason: 'The confirmed ingredient list repeats an ingredient; check the label list.' };
  return { ok: true, ingredients: unique };
}

function resolveMedication(input, options = {}) {
  const medicine = input && typeof input === 'object' && !Array.isArray(input) ? input : { name: input, ...options };
  const name = typeof medicine.name === 'string' ? medicine.name.trim() : '';
  const dose = typeof medicine.dose === 'string' ? medicine.dose.trim() : '';
  const nameResult = resolveByName(name);
  const nameLookup = lookupCandidates(name);
  const embeddedStrength = nameLookup.strengthInName || (!dose && strengthProfile(name).length ? name : '');
  const strength = strengthAssessment(nameLookup.candidates, embeddedStrength, dose);
  const confirmedIngredients = medicine.activeIngredientsConfirmed === true
    ? resolveConfirmedIngredients(medicine.activeIngredients)
    : null;

  if (!confirmedIngredients) return { ...nameResult, strength };
  if (!confirmedIngredients.ok) return { name, ingredients: [], status: 'unknown', matchState: 'confirmed_ingredient_unmatched', reason: confirmedIngredients.reason, basis: 'label_confirmation_unmatched', strength };

  const confirmedIds = confirmedIngredients.ingredients.map(item => item.id).sort();
  const nameIds = nameResult.ingredients.map(item => item.id).sort();
  if (nameResult.status === 'resolved' && (confirmedIds.length !== nameIds.length || confirmedIds.some((id, index) => id !== nameIds[index]))) {
    return { name, ingredients: [], status: 'ingredient_mismatch', matchState: 'name_label_mismatch', reason: 'The medicine-name match and the user-confirmed label ingredients do not agree. No ingredient-based check was run for this item.', basis: 'name_label_disagreement', strength };
  }

  const byName = nameResult.status === 'resolved';
  return {
    ...nameResult,
    ingredients: confirmedIngredients.ingredients,
    status: 'resolved',
    matchState: byName ? 'resolved_name_and_confirmed_label' : 'resolved_label_only',
    basis: byName ? 'catalogue_and_confirmed_label' : 'confirmed_label_only',
    labelIngredientsConfirmed: true,
    reason: byName ? nameResult.reason : 'The medicine name did not resolve, so only the explicitly confirmed label ingredients were matched.',
    strength
  };
}

const matchesSide = (ingredient, side = {}) => side.ingredient ? ingredient.id === side.ingredient : side.class ? (ingredient.classes || []).includes(side.class) : false;
const sourceFor = rule => rule.source || { publisher: 'DoctorAI medication database' };
function directAllergyMatch(ingredient, allergy) {
  const allergyTerm = norm(allergy).replace(/\b(allergy|allergic|reaction|hypersensitivity|anaphylaxis|rash)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!allergyTerm) return false;
  return ingredientTerms(ingredient).some(term => allergyTerm === term || allergyTerm.includes(term));
}
function conditionMatches(rule, conditions) {
  const terms = (rule.conditionTerms || []).map(norm).filter(Boolean);
  return conditions.some(condition => terms.some(term => condition.includes(term) || term.includes(condition)));
}

function review({ medications = [], allergies = [], conditions = [] } = {}) {
  const resolved = medications.map(medication => resolveMedication(medication));
  return reviewResolved({ resolved, allergies, conditions });
}

function reviewResolved({ resolved = [], allergies = [], conditions = [] } = {}) {
  const alerts = [];
  for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
      for (const leftIngredient of resolved[leftIndex].ingredients) {
        for (const rightIngredient of resolved[rightIndex].ingredients) {
          if (leftIngredient.id === rightIngredient.id) alerts.push({ type: 'duplicate-ingredient', severity: 'high', title: 'Possible duplicate active ingredient', message: `${resolved[leftIndex].name} and ${resolved[rightIndex].name} both resolve to ${leftIngredient.name}.`, source: { publisher: 'DoctorAI ingredient resolution', recordVersion: 1 } });
          for (const rule of db.interactionRules || []) {
            if ((matchesSide(leftIngredient, rule.left) && matchesSide(rightIngredient, rule.right)) || (matchesSide(rightIngredient, rule.left) && matchesSide(leftIngredient, rule.right))) alerts.push({ type: 'interaction', severity: rule.severity, title: 'Potential medicine interaction', message: `${leftIngredient.name} + ${rightIngredient.name}: ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id, recordVersion: rule.recordVersion || 1, evidenceSummary: rule.evidenceSummary || '' });
          }
        }
      }
    }
  }
  const allergyText = allergies.map(norm).filter(Boolean);
  for (const medication of resolved) for (const ingredient of medication.ingredients) {
    const exactAllergy = allergies.find(allergy => directAllergyMatch(ingredient, allergy));
    if (exactAllergy) alerts.push({ type: 'allergy', severity: 'high', title: 'Recorded ingredient allergy needs review', message: `${medication.name} resolves to ${ingredient.name}, which matches the recorded allergy “${exactAllergy}”. Do not rely on DoctorAI alone; confirm with a pharmacist or prescriber.`, source: { publisher: 'DoctorAI ingredient resolution', recordVersion: 1 } });
    for (const rule of db.allergyRules || []) if ((ingredient.classes || []).includes(rule.ingredientClass) && allergyText.some(allergy => rule.allergyTerms.some(term => allergy.includes(norm(term)) || norm(term).includes(allergy)))) alerts.push({ type: 'allergy', severity: rule.severity, title: 'Recorded allergy needs review', message: `${medication.name} resolves to ${ingredient.name}. ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id, recordVersion: rule.recordVersion || 1, evidenceSummary: rule.evidenceSummary || '' });
  }
  const conditionText = conditions.map(norm).filter(Boolean);
  for (const medication of resolved) for (const ingredient of medication.ingredients) for (const rule of db.contraindicationRules || []) if (matchesSide(ingredient, rule.medicine) && conditionMatches(rule, conditionText)) alerts.push({ type: 'contraindication', severity: rule.severity, title: 'Condition and medicine need review', message: `${medication.name} resolves to ${ingredient.name}. ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id, recordVersion: rule.recordVersion || 1, evidenceSummary: rule.evidenceSummary || '' });
  if (conditionText.length && !(db.contraindicationRules || []).length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Condition risks are not covered', message: 'DoctorAI has no verified medicine-condition rules in its current database, so risks related to recorded conditions could not be checked.', source: { publisher: 'DoctorAI medication database' } });
  const unknownItems = resolved.filter(item => item.status !== 'resolved');
  const unknown = unknownItems.map(item => item.name || '(missing medicine name)');
  const unmatched = resolved.filter(item => item.matchState === 'unmatched' || item.matchState === 'missing_name' || item.matchState === 'confirmed_ingredient_unmatched').length;
  const ambiguous = resolved.filter(item => item.matchState === 'ambiguous_or_incomplete').length;
  const mismatched = resolved.filter(item => item.matchState === 'name_label_mismatch').length;
  if (unknown.length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Medicine data incomplete', message: `No complete ingredient mapping is available for: ${unknown.join(', ')}. DoctorAI cannot determine whether these medicines clash.`, source: { publisher: 'DoctorAI medication database' } });
  for (const item of resolved) if (item.status === 'resolved' && item.strength?.status === 'unverified') alerts.push({ type: 'strength-review', severity: 'unknown', title: 'Strength or dose not checked', message: `${item.name}: ${item.strength.reason}`, source: { publisher: 'DoctorAI local terminology', recordVersion: 1 } });
  alerts.push({ type: 'coverage', severity: 'unknown', title: 'Interaction coverage is limited', message: `Medicine names are checked against NZ terminology, but only ${db.interactionRules.length} curated interaction rules are available. Other clashes, dose, timing, route, pregnancy, and condition risks may be missing. Matching every medicine does not make this a complete safety check.`, source: { publisher: 'DoctorAI medication database' } });
  const uniqueAlerts = Array.from(new Map(alerts.map(alert => [`${alert.type}|${alert.ruleId || ''}|${alert.message}`, alert])).values());
  const high = uniqueAlerts.some(alert => alert.severity === 'high' || alert.severity === 'critical');
  const moderate = uniqueAlerts.some(alert => ['moderate', 'medium', 'caution'].includes(alert.severity));
  const coverageIncomplete = unknown.length > 0 || uniqueAlerts.some(alert => alert.severity === 'unknown');
  const strengthUnverified = resolved.filter(item => item.status === 'resolved' && item.strength?.status === 'unverified').length;
  const strengthListed = resolved.filter(item => item.status === 'resolved' && item.strength?.status === 'listed_match').length;
  const confirmedLabels = resolved.filter(item => item.labelIngredientsConfirmed === true).length;
  return {
    schemaVersion: db.schemaVersion,
    datasetVersion: db.datasetVersion,
    ruleset: db.ruleset || { version: db.datasetVersion, recordSchemaVersion: 1 },
    catalogue: { ...nz.stats, effectiveDate: nz.sources[0].effectiveDate, attribution: nz.attribution, sourceUrl: 'https://schedule.pharmac.govt.nz/pub/', licence: nz.licence, disclaimer: nz.disclaimer },
    resolved,
    alerts: uniqueAlerts,
    coverage: { requested: resolved.length, resolved: resolved.length - unknown.length, unknown: unknown.length, unmatched, ambiguous, mismatched, confirmedLabels, strengthListed, strengthUnverified, terminologyComplete: resolved.length > 0 && unknown.length === 0, interactionRuleCount: db.interactionRules.length, interactionCoverage: 'limited', conditionCoverage: 'none', doseAssessment: 'not_performed', completeForRequest: !coverageIncomplete },
    status: high ? 'red' : moderate ? 'orange' : 'unknown',
    disclaimer: 'No-known-alerts does not mean safe. DoctorAI only reports rules present in its limited dataset; strength, dose, route, timing, and treatment suitability are not assessed. Medicine decisions require a pharmacist or prescriber.'
  };
}

module.exports = { review, reviewResolved, resolveMedication, norm, strengthProfile };
