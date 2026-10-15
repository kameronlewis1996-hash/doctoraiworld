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
  const possibleInteractionRoutes = [...new Set(candidates.map(item => item.interactionRoute).filter(Boolean))];
  const productClassSets = candidates.map(item => new Set(item.safetyClasses || []));
  const possibleProductClasses = [...new Set(productClassSets.flatMap(classes => [...classes]))];
  const productClasses = possibleProductClasses.filter(productClass => productClassSets.every(classes => classes.has(productClass)));
  const interactionRoutesIncomplete = candidates.some(item => !item.interactionRoute);
  if (signatures.size !== 1 || candidates.some(item => !item.ingredientsComplete || !Array.isArray(item.ingredients) || !item.ingredients.length || item.ingredients.some(id => !ingredients.has(id)))) {
    // Preserve only product classes shared by every exact-name candidate. These
    // support narrowly product-class-only alerts (for example, a mapped live
    // vaccine) while ingredient-based checks remain blocked as unknown.
    return { name: trimmedName, ingredients: [], status: 'unknown', matchState: 'ambiguous_or_incomplete', reason: 'Ambiguous product or incomplete ingredient listing; choose the full brand, generic name and formulation', candidates: candidates.slice(0, 5).map(item => item.name), possibleInteractionRoutes, interactionRoutesIncomplete, productClasses, possibleProductClasses };
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
    possibleInteractionRoutes,
    interactionRoutesIncomplete: candidates.some(item => !item.interactionRoute),
    productClasses,
    possibleProductClasses,
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

function matchesSide(ingredient, side = {}, medication = {}) {
  let hasPredicate = false;
  if (side.ingredient) {
    hasPredicate = true;
    if (ingredient.id !== side.ingredient) return false;
  }
  if (side.class) {
    hasPredicate = true;
    if (!(ingredient.classes || []).includes(side.class)) return false;
  }
  if (side.productClass) {
    hasPredicate = true;
    const classes = side.matchMode === 'possible' ? medication.possibleProductClasses : medication.productClasses;
    if (!(classes || []).includes(side.productClass)) return false;
  }
  if (side.interactionRoute) {
    hasPredicate = true;
    const routes = medication.possibleInteractionRoutes || [];
    const routeUnknown = medication.interactionRoutesIncomplete === true || routes.length === 0;
    const routeMatches = side.interactionRoute === 'systemic'
      ? routes.some(route => route === 'systemic' || route === 'oral')
      : routes.includes(side.interactionRoute);
    if (!routeUnknown && !routeMatches) return false;
  }
  return hasPredicate;
}
function matchesKnownProductClass(medication, side = {}) {
  // An incomplete product can support a warning only when the exact product
  // class is shared by all name candidates. Do not infer an ingredient or use a
  // merely possible product class to fill an incomplete mapping.
  return medication.status !== 'resolved' && Boolean(side.productClass) && !side.ingredient && !side.class && side.matchMode !== 'possible' && matchesSide(null, side, medication);
}
function distinctCombinationEntries(componentMatches) {
  const selected = [];
  function assign(componentIndex, usedIngredientIds) {
    if (componentIndex >= componentMatches.length) return true;
    for (const entry of componentMatches[componentIndex]) {
      if (usedIngredientIds.has(entry.ingredient.id)) continue;
      selected[componentIndex] = entry;
      usedIngredientIds.add(entry.ingredient.id);
      if (assign(componentIndex + 1, usedIngredientIds)) return true;
      usedIngredientIds.delete(entry.ingredient.id);
    }
    return false;
  }
  return assign(0, new Set()) ? selected.slice() : null;
}
const sourceFor = rule => rule.source || { publisher: 'DoctorAI medication database' };
const nonaffirmativeAllergy = /\b(?:no|not sure|not|without|denies?|denied|never|negative for|ruled out|free of|absence of|uncertain|uncertainty|unconfirmed|possible|possibly|potential|suspected|maybe|query|if|asked about|question of|family history|mother|father|sister|brother|parent|partner|child|son|daughter)\b/i;
function positiveAllergyStatements(allergies) {
  return allergies.flatMap(allergy => String(allergy || '')
    .split(/[;,\n.!?]|\b(?:but|however|except)\b/gi)
    .map(statement => statement.trim())
    .filter(statement => statement && !statement.endsWith('?') && !nonaffirmativeAllergy.test(norm(statement))));
}
function directAllergyMatch(ingredient, allergy) {
  const allergyTerm = norm(allergy).replace(/\b(allergy|allergic|reaction|hypersensitivity|anaphylaxis|rash)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!allergyTerm) return false;
  return ingredientTerms(ingredient).some(term => allergyTerm === term || allergyTerm.includes(term));
}
function conditionMatches(rule, conditions) {
  const terms = (rule.conditionTerms || []).map(norm).filter(Boolean);
  const negation = /(?:^|\b)(?:no|not|never|denies?|denied|negative for|without|ruled out|free of|absence of)\b(?:\s+\w+){0,2}\s*$/i;
  const history = /(?:^|\b)(?:history of|historical|previously|in the past|past|resolved|recovered from)\b(?:\s+\w+){0,2}\s*$/i;
  const postNegation = /^\s*(?:is\s+)?(?:absent|negative|ruled out|excluded|not present)\b/i;
  return conditions.some(value => {
    const clauses = norm(value).split(/[;,\n.!?]+/).filter(Boolean);
    return clauses.some(clause => terms.some(term => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'gi');
      for (const match of clause.matchAll(expression)) {
        const before = clause.slice(0, match.index + match[1].length).trim().split(/\s+/).slice(-4).join(' ');
        const after = clause.slice(match.index + match[0].length);
        if (negation.test(before) || postNegation.test(after)) continue;
        if (rule.excludeHistory && history.test(before)) continue;
        return true;
      }
      return false;
    }));
  });
}

function review({ medications = [], allergies = [], conditions = [] } = {}) {
  const resolved = medications.map(medication => resolveMedication(medication));
  return reviewResolved({ resolved, allergies, conditions });
}

function reviewResolved({ resolved = [], allergies = [], conditions = [] } = {}) {
  const alerts = [];
  const pairCoverage = { requestedPairs: 0, assessedPairs: 0, unassessedPairs: 0 };
  for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
      pairCoverage.requestedPairs += 1;
      const leftMedicine = resolved[leftIndex];
      const rightMedicine = resolved[rightIndex];
      if (leftMedicine.status !== 'resolved' || rightMedicine.status !== 'resolved') {
        pairCoverage.unassessedPairs += 1;
        continue;
      }
      const duplicateIngredients = [];
      for (const leftIngredient of leftMedicine.ingredients) for (const rightIngredient of rightMedicine.ingredients) {
        if (leftIngredient.id === rightIngredient.id) duplicateIngredients.push(leftIngredient);
      }
      const matchingRules = [];
      for (const rule of db.interactionRules || []) {
        let matched = leftMedicine.ingredients.some(leftIngredient => rightMedicine.ingredients.some(rightIngredient =>
          (!rule.excludeSameIngredient || leftIngredient.id !== rightIngredient.id) &&
          ((matchesSide(leftIngredient, rule.left, leftMedicine) && matchesSide(rightIngredient, rule.right, rightMedicine)) ||
          (matchesSide(rightIngredient, rule.left, rightMedicine) && matchesSide(leftIngredient, rule.right, leftMedicine)))));
        if (!matched) {
          const leftEntries = leftMedicine.ingredients.length ? leftMedicine.ingredients : [null];
          const rightEntries = rightMedicine.ingredients.length ? rightMedicine.ingredients : [null];
          matched = leftEntries.some(leftIngredient => rightEntries.some(rightIngredient =>
            (matchesKnownProductClass(leftMedicine, rule.left) && rightIngredient && matchesSide(rightIngredient, rule.right, rightMedicine)) ||
            (rightIngredient && matchesSide(rightIngredient, rule.left, rightMedicine) && matchesKnownProductClass(leftMedicine, rule.right)) ||
            (matchesKnownProductClass(rightMedicine, rule.left) && leftIngredient && matchesSide(leftIngredient, rule.right, leftMedicine)) ||
            (leftIngredient && matchesSide(leftIngredient, rule.left, leftMedicine) && matchesKnownProductClass(rightMedicine, rule.right)) ||
            (matchesKnownProductClass(leftMedicine, rule.left) && matchesKnownProductClass(rightMedicine, rule.right)) ||
            (matchesKnownProductClass(rightMedicine, rule.left) && matchesKnownProductClass(leftMedicine, rule.right))));
        }
        if (matched) matchingRules.push(rule);
      }
      const matchingRuleIds = new Set(matchingRules.map(rule => rule.id));
      if (matchingRules.length) pairCoverage.assessedPairs += 1;
      else pairCoverage.unassessedPairs += 1;
      const hasParacetamolProductDuplicateRule = matchingRuleIds.has('duplicate-paracetamol-containing-products');
      for (const ingredient of duplicateIngredients) {
        if (ingredient.id === 'paracetamol' && hasParacetamolProductDuplicateRule) continue;
        alerts.push({ type: 'duplicate-ingredient', severity: 'high', title: 'Possible duplicate active ingredient', message: `${leftMedicine.name} and ${rightMedicine.name} both resolve to ${ingredient.name}.`, source: { publisher: 'DoctorAI ingredient resolution', recordVersion: 1 } });
      }
      for (const rule of matchingRules) {
        if ((rule.suppressWhenRuleMatches || []).some(id => matchingRuleIds.has(id))) continue;
        alerts.push({ type: 'interaction', severity: rule.severity, title: 'Potential medicine interaction', message: `${leftMedicine.name} + ${rightMedicine.name}: ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id, recordVersion: rule.recordVersion || 1, evidenceSummary: rule.evidenceSummary || '' });
      }
      if (!matchingRules.length && leftMedicine.status === 'resolved' && rightMedicine.status === 'resolved') {
        alerts.push({ type: 'interaction-coverage', severity: 'unknown', title: 'Medicine pair is unassessed', message: `${leftMedicine.name} + ${rightMedicine.name} has no matching pairwise rule in DoctorAI's very limited retained rules. This pair is unassessed; no alert does not mean safe. Ask a pharmacist or prescriber to review the full list.`, ruleId: 'medication-pair-unassessed', source: { publisher: 'DoctorAI medication database' } });
      }
    }
  }
  const resolvedIngredientEntries = resolved.flatMap((medication, medicationIndex) => medication.ingredients.map(ingredient => ({ medication, medicationIndex, ingredient })));
  for (const rule of db.combinationRules || []) {
    if (rule.conditionTerms?.length && !conditionMatches(rule, conditions)) continue;
    const componentMatches = (rule.components || []).map(component => resolvedIngredientEntries.filter(entry => component.some(side => matchesSide(entry.ingredient, side, entry.medication))));
    if (!componentMatches.length || componentMatches.some(matches => !matches.length)) continue;
    const selectedEntries = distinctCombinationEntries(componentMatches);
    if (!selectedEntries) continue;
    const implicated = new Map(selectedEntries.map(entry => [entry.medicationIndex, entry.medication]));
    alerts.push({
      type: 'interaction',
      subtype: 'multi-medicine',
      severity: rule.severity,
      title: 'Potential multi-medicine interaction',
      message: `${[...implicated.values()].map(medication => medication.name).join(' + ')}: ${rule.effect}`,
      source: sourceFor(rule),
      ruleId: rule.id,
      recordVersion: rule.recordVersion || 1,
      evidenceSummary: rule.evidenceSummary || ''
    });
  }
  const positiveAllergies = positiveAllergyStatements(allergies);
  const allergyText = positiveAllergies.map(norm).filter(Boolean);
  for (const medication of resolved) {
    for (const ingredient of medication.ingredients) {
      const exactAllergy = positiveAllergies.find(allergy => directAllergyMatch(ingredient, allergy));
      if (exactAllergy) alerts.push({ type: 'allergy', severity: 'high', title: 'Recorded ingredient allergy needs review', message: `${medication.name} resolves to ${ingredient.name}, which matches the recorded allergy “${exactAllergy}”. Do not rely on DoctorAI alone; confirm with a pharmacist or prescriber.`, source: { publisher: 'DoctorAI ingredient resolution', recordVersion: 1 } });
      for (const rule of db.allergyRules || []) if (rule.ingredientClass && (ingredient.classes || []).includes(rule.ingredientClass) && allergyText.some(allergy => rule.allergyTerms.some(term => allergy.includes(norm(term)) || norm(term).includes(allergy)))) alerts.push({ type: 'allergy', severity: rule.severity, title: 'Recorded allergy needs review', message: `${medication.name} resolves to ${ingredient.name}. ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id, recordVersion: rule.recordVersion || 1, evidenceSummary: rule.evidenceSummary || '' });
    }
    for (const rule of db.allergyRules || []) if (rule.productClass && (medication.productClasses || []).includes(rule.productClass) && allergyText.some(allergy => rule.allergyTerms.some(term => allergy.includes(norm(term)) || norm(term).includes(allergy)))) alerts.push({ type: 'allergy', severity: rule.severity, title: 'Recorded allergy needs review', message: `${medication.name}: ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id, recordVersion: rule.recordVersion || 1, evidenceSummary: rule.evidenceSummary || '' });
  }
  const conditionText = conditions.map(norm).filter(Boolean);
  for (const medication of resolved) for (const ingredient of medication.ingredients) for (const rule of db.contraindicationRules || []) if (matchesSide(ingredient, rule.medicine, medication) && conditionMatches(rule, conditionText)) alerts.push({ type: 'contraindication', severity: rule.severity, title: 'Condition and medicine need review', message: `${medication.name} resolves to ${ingredient.name}. ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id, recordVersion: rule.recordVersion || 1, evidenceSummary: rule.evidenceSummary || '' });
  const conditionRuleCount = (db.contraindicationRules || []).length;
  if (conditionText.length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Condition coverage is limited', message: `Only ${conditionRuleCount} curated medicine-condition prompts are available. Other condition-related risks, including unmatched conditions, may not be checked. No alert does not mean the medicines are safe for these conditions.`, source: { publisher: 'DoctorAI medication database' } });
  const unknownItems = resolved.filter(item => item.status !== 'resolved');
  const unknown = unknownItems.map(item => item.name || '(missing medicine name)');
  const unmatched = resolved.filter(item => item.matchState === 'unmatched' || item.matchState === 'missing_name' || item.matchState === 'confirmed_ingredient_unmatched').length;
  const ambiguous = resolved.filter(item => item.matchState === 'ambiguous_or_incomplete').length;
  const mismatched = resolved.filter(item => item.matchState === 'name_label_mismatch').length;
  if (unknown.length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Medicine data incomplete', message: `No complete ingredient mapping is available for: ${unknown.join(', ')}. DoctorAI cannot determine whether these medicines clash.`, source: { publisher: 'DoctorAI medication database' } });
  for (const item of resolved) if (item.status === 'resolved' && item.strength?.status === 'unverified') alerts.push({ type: 'strength-review', severity: 'unknown', title: 'Strength or dose not checked', message: `${item.name}: ${item.strength.reason}`, source: { publisher: 'DoctorAI local terminology', recordVersion: 1 } });
  const combinationRuleCount = (db.combinationRules || []).length;
  alerts.push({ type: 'coverage', severity: 'unknown', title: 'Interaction coverage is limited', message: `Medicine names are checked against NZ terminology, but only ${db.interactionRules.length} curated pairwise and ${combinationRuleCount} multi-medicine interaction rules are available. Other clashes, dose, timing, route, pregnancy, and condition risks may be missing. Matching every medicine does not make this a complete safety check.`, source: { publisher: 'DoctorAI medication database' } });
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
    coverage: { requested: resolved.length, resolved: resolved.length - unknown.length, unknown: unknown.length, unmatched, ambiguous, mismatched, confirmedLabels, strengthListed, strengthUnverified, terminologyComplete: resolved.length > 0 && unknown.length === 0, interactionRuleCount: db.interactionRules.length, combinationRuleCount, interactionCoverage: 'limited', requestedPairs: pairCoverage.requestedPairs, assessedPairs: pairCoverage.assessedPairs, unassessedPairs: pairCoverage.unassessedPairs, conditionRuleCount, conditionCoverage: conditionRuleCount ? 'limited' : 'none', doseAssessment: 'not_performed', completeForRequest: !coverageIncomplete },
    status: high ? 'red' : moderate ? 'orange' : 'unknown',
    disclaimer: (high || moderate || unknown.length ? '' : 'No alert found in the covered rules does not mean safe. ') + 'Coverage remains limited. DoctorAI only reports rules present in its limited dataset; strength, dose, route, timing, and treatment suitability are not assessed. Medicine decisions require a pharmacist or prescriber.'
  };
}

module.exports = { review, reviewResolved, resolveMedication, norm, strengthProfile };
