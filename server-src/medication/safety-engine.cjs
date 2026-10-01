const db = require('../../data/medication/medication-safety.seed.json');
const nz = require('../../data/medication/nz-pharmac-medicines.json');
const norm = value => String(value || '').toLowerCase().replace(/[®™]/g, '').replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/[^a-z0-9.]+/g, ' ').trim();
const ingredients = new Map([...nz.ingredients, ...db.ingredients].map(item => [item.id, item]));
const ingredientTerms = ingredient => [ingredient.name, ...(ingredient.aliases || [])].map(norm).filter(Boolean);
const strengthSuffix = /^(?:\d+(?:\.\d+)?\s*(?:mg|mcg|micrograms?|g|grams?|ml|units?))(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|micrograms?|g|grams?|ml|units?))*$/;
const index = new Map();
function addTerm(term, record) {
  const key = norm(term);
  if (key) index.set(key, [...(index.get(key) || []), record]);
}
for (const product of nz.products) {
  for (const term of [product.name, product.brand, product.chemical, `${product.chemical} ${product.formulation}`, product.brand && `${product.brand} ${product.formulation}`]) addTerm(term, product);
}
for (const product of db.products) addTerm(product.name, { ...product, ingredientsComplete: true });
for (const ingredient of ingredients.values()) for (const term of ingredientTerms(ingredient)) {
  // Official ambiguous/incomplete product headings must not fall back to a
  // convenient single-substance interpretation.
  if (!index.has(term)) addTerm(term, { name: ingredient.name, ingredients: [ingredient.id], ingredientsComplete: true });
}
function resolveMedication(name) {
  name = typeof name === 'string' ? name.trim() : '';
  const q = norm(name);
  if (!q) return { name, ingredients: [], status: 'unknown', reason: 'Missing medicine name' };
  let candidates = index.get(q);
  if (!candidates) {
    // Only strip a bounded strength suffix, never other brand words or forms.
    const words = q.split(' ');
    for (let cut = words.length - 1; cut > 0; cut -= 1) {
      if (strengthSuffix.test(words.slice(cut).join(' ')) && index.has(words.slice(0, cut).join(' '))) {
        candidates = index.get(words.slice(0, cut).join(' '));
        break;
      }
    }
  }
  if (!candidates) return { name, ingredients: [], status: 'unknown', reason: 'No exact terminology match' };
  const signatures = new Set(candidates.map(item => [...item.ingredients].sort().join('|')));
  if (signatures.size !== 1 || candidates.some(item => !item.ingredientsComplete || !item.ingredients.length || item.ingredients.some(id => !ingredients.has(id)))) {
    return { name, ingredients: [], status: 'unknown', reason: 'Ambiguous product or incomplete ingredient listing; choose the full brand, generic name and formulation', candidates: candidates.slice(0, 5).map(item => item.name) };
  }
  const product = candidates[0];
  return { name, ingredients: [...new Set(product.ingredients)].map(id => ingredients.get(id)), status: 'resolved', matched: candidates.length === 1 ? product.name : name, identityOnly: true, source: product.schedules ? { publisher: 'Pharmac Pharmaceutical Schedule', effectiveDate: nz.sources[0].effectiveDate } : { publisher: 'DoctorAI curated terminology' } };
}
const matchesSide = (ingredient, side = {}) => side.ingredient ? ingredient.id === side.ingredient : side.class ? ingredient.classes.includes(side.class) : false;
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
  const resolved = medications.map(medication => resolveMedication(typeof medication === 'string' ? medication : medication?.name));
  const alerts = [];
  for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
      for (const leftIngredient of resolved[leftIndex].ingredients) {
        for (const rightIngredient of resolved[rightIndex].ingredients) {
          if (leftIngredient.id === rightIngredient.id) alerts.push({ type: 'duplicate-ingredient', severity: 'high', title: 'Possible duplicate active ingredient', message: `${resolved[leftIndex].name} and ${resolved[rightIndex].name} both resolve to ${leftIngredient.name}.`, source: { publisher: 'DoctorAI ingredient resolution' } });
          for (const rule of db.interactionRules || []) {
            if ((matchesSide(leftIngredient, rule.left) && matchesSide(rightIngredient, rule.right)) || (matchesSide(rightIngredient, rule.left) && matchesSide(leftIngredient, rule.right))) alerts.push({ type: 'interaction', severity: rule.severity, title: 'Potential medicine interaction', message: `${leftIngredient.name} + ${rightIngredient.name}: ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id });
          }
        }
      }
    }
  }
  const allergyText = allergies.map(norm).filter(Boolean);
  for (const medication of resolved) for (const ingredient of medication.ingredients) {
    const exactAllergy = allergies.find(allergy => directAllergyMatch(ingredient, allergy));
    if (exactAllergy) alerts.push({ type: 'allergy', severity: 'high', title: 'Recorded ingredient allergy needs review', message: `${medication.name} resolves to ${ingredient.name}, which matches the recorded allergy “${exactAllergy}”. Do not rely on DoctorAI alone; confirm with a pharmacist or prescriber.`, source: { publisher: 'DoctorAI ingredient resolution' } });
    for (const rule of db.allergyRules || []) if (ingredient.classes.includes(rule.ingredientClass) && allergyText.some(allergy => rule.allergyTerms.some(term => allergy.includes(norm(term)) || norm(term).includes(allergy)))) alerts.push({ type: 'allergy', severity: rule.severity, title: 'Recorded allergy needs review', message: `${medication.name} resolves to ${ingredient.name}. ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id });
  }
  const conditionText = conditions.map(norm).filter(Boolean);
  for (const medication of resolved) for (const ingredient of medication.ingredients) for (const rule of db.contraindicationRules || []) if (matchesSide(ingredient, rule.medicine) && conditionMatches(rule, conditionText)) alerts.push({ type: 'contraindication', severity: rule.severity, title: 'Condition and medicine need review', message: `${medication.name} resolves to ${ingredient.name}. ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id });
  if (conditionText.length && !(db.contraindicationRules || []).length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Condition risks are not covered', message: 'DoctorAI has no verified medicine-condition rules in its current database, so risks related to recorded conditions could not be checked.', source: { publisher: 'DoctorAI medication database' } });
  const unknown = resolved.filter(item => item.status === 'unknown').map(item => item.name || '(missing medicine name)');
  if (unknown.length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Medicine data incomplete', message: `No verified ingredient mapping is available yet for: ${unknown.join(', ')}. DoctorAI cannot determine whether these medicines clash.`, source: { publisher: 'DoctorAI medication database' } });
  alerts.push({ type: 'coverage', severity: 'unknown', title: 'Interaction coverage is limited', message: `Medicine names are checked against NZ terminology, but only ${db.interactionRules.length} curated interaction rules are available. Other clashes, dose, timing, route, pregnancy, and condition risks may be missing. Matching every medicine does not make this a complete safety check.`, source: { publisher: 'DoctorAI medication database' } });
  const uniqueAlerts = Array.from(new Map(alerts.map(alert => [`${alert.type}|${alert.ruleId || ''}|${alert.message}`, alert])).values());
  const high = uniqueAlerts.some(alert => alert.severity === 'high' || alert.severity === 'critical');
  const moderate = uniqueAlerts.some(alert => ['moderate', 'medium', 'caution'].includes(alert.severity));
  const coverageIncomplete = unknown.length > 0 || uniqueAlerts.some(alert => alert.severity === 'unknown');
  return { schemaVersion: db.schemaVersion, datasetVersion: db.datasetVersion, datasetReviewed: db.datasetReviewed || null, catalogue: { ...nz.stats, effectiveDate: nz.sources[0].effectiveDate, attribution: nz.attribution, sourceUrl: 'https://schedule.pharmac.govt.nz/pub/', licence: nz.licence, disclaimer: nz.disclaimer }, resolved, alerts: uniqueAlerts, coverage: { requested: resolved.length, resolved: resolved.length - unknown.length, unknown: unknown.length, terminologyComplete: resolved.length > 0 && unknown.length === 0, interactionRuleCount: db.interactionRules.length, interactionCoverage: 'limited', conditionCoverage: 'none', completeForRequest: !coverageIncomplete }, status: high ? 'red' : moderate ? 'orange' : 'unknown', disclaimer: 'No-known-alerts does not mean safe. DoctorAI only reports rules present in its limited dataset; medicine decisions require a pharmacist or prescriber.' };
}
module.exports = { review, resolveMedication, norm };
