const db = require('../../data/medication/medication-safety.seed.json');
const norm = value => String(value || '').toLowerCase().replace(/[®™]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ingredients = new Map(db.ingredients.map(item => [item.id, item]));
const ingredientTerms = ingredient => [ingredient.name, ...(ingredient.aliases || [])].map(norm).filter(Boolean);
// Only remove unambiguous strength/form suffixes. Unknown brand variants stay unknown.
const cleanName = name => name.normalize('NFKC').toLowerCase().replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
function resolveSingle(name) {
  let text = cleanName(name);
  const form = text.match(/\s+(tablets?|tabs?|capsules?|caps?|oral solution|oral suspension|solution|suspension|liquid)$/i);
  if (form) text = text.slice(0, form.index).trim();
  const strength = text.match(/\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|micrograms?|g|grams?|ml|units?)(?:\s*\/\s*\d*(?:\.\d+)?\s*ml)?(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?))*)$/i);
  if (strength) text = text.slice(0, strength.index).trim();
  // Restrict identity punctuation; do not discard unknown words or OCR characters.
  if (!/^[a-z0-9 /-]+$/.test(text)) return null;
  const q = norm(text);
  const product = db.products.find(item => q === norm(item.name));
  const ingredient = !product && db.ingredients.find(item => ingredientTerms(item).includes(q));
  const found = product ? product.ingredients.map(id => ingredients.get(id)) : ingredient ? [ingredient] : [];
  if (!found.length || found.some(item => !item)) return null;
  return { ingredients: found, matched: product?.name || ingredient.name, strength: strength?.[1] || null, form: form?.[0].trim() || null, route: null };
}
function resolveMedication(name) {
  const unknown = { name: typeof name === 'string' ? name : '', ingredients: [], status: 'unknown', confirmationRequired: true, reason: 'Unable to determine from available data. Confirm the exact medicine and ingredients with the label or pharmacist.' };
  if (typeof name !== 'string' || !name.trim() || name.length > 200) return unknown;
  const single = resolveSingle(name);
  if (single) return { name, ...single, status: 'resolved' };
  // Explicit generic ingredient lists only; never guess ingredients of an unknown brand.
  const parts = name.split(/\s*\+\s*|\s*;\s*/);
  if (parts.length < 2 || parts.length > 8) return unknown;
  const matches = parts.map(resolveSingle);
  if (matches.some(item => !item)) return unknown;
  return { name, ingredients: [...new Map(matches.flatMap(item => item.ingredients).map(item => [item.id, item])).values()], status: 'resolved', matched: matches.map(item => item.matched).join(' + '), components: matches, strength: null, route: null };
}
function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Invalid request.');
  if (!Array.isArray(body.medications) || !body.medications.length || body.medications.length > 50) throw new TypeError('Provide 1–50 medicines. No partial list was checked.');
  if (body.medications.some(item => typeof (typeof item === 'string' ? item : item?.name) !== 'string' || !(typeof item === 'string' ? item : item.name).trim() || (typeof item === 'string' ? item : item.name).length > 200)) throw new TypeError('Every medicine must have a non-empty name of at most 200 characters.');
  for (const key of ['allergies', 'conditions']) if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].length > 50 || body[key].some(item => typeof item !== 'string' || !item.trim() || item.length > 200))) throw new TypeError('Invalid ' + key + ' list.');
  return body;
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
function review(input) {
  const { medications, allergies = [], conditions = [] } = validateRequest(input);
  const resolved = medications.map(medication => resolveMedication(typeof medication === 'string' ? medication : medication?.name));
  const alerts = [];
  for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
      for (const leftIngredient of resolved[leftIndex].ingredients) {
        for (const rightIngredient of resolved[rightIndex].ingredients) {
          const context = { medications: [resolved[leftIndex].name, resolved[rightIndex].name], medicationIndexes: [leftIndex, rightIndex], activeIngredients: [...new Set([leftIngredient.name, rightIngredient.name])] };
          if (leftIngredient.id === rightIngredient.id) alerts.push({ ...context, type: 'duplicate-ingredient', severity: 'monitoring', title: 'Possible duplicate active ingredient', message: `${resolved[leftIndex].name} and ${resolved[rightIndex].name} both resolve to ${leftIngredient.name}.`, source: { publisher: 'DoctorAI ingredient resolution' } });
          const sharedClasses = (leftIngredient.classes || []).filter(value => (rightIngredient.classes || []).includes(value));
          if (leftIngredient.id !== rightIngredient.id && sharedClasses.length) alerts.push({ ...context, type: 'same-class', severity: 'monitoring', title: 'Shared medication class', message: `${context.medications.join(' and ')} share the recorded class: ${sharedClasses.join(', ')}. This is a classification overlap, not proof of an interaction or inappropriate prescribing.`, source: { publisher: 'DoctorAI recorded ingredient classes' } });
          for (const rule of db.interactionRules || []) {
            if ((matchesSide(leftIngredient, rule.left) && matchesSide(rightIngredient, rule.right)) || (matchesSide(rightIngredient, rule.left) && matchesSide(leftIngredient, rule.right))) alerts.push({ ...context, type: 'interaction', severity: rule.severity, title: 'Potential medicine interaction', message: `${leftIngredient.name} + ${rightIngredient.name}: ${rule.effect}`, source: sourceFor(rule), ruleId: rule.id });
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
  const unknown = resolved.filter(item => item.status === 'unknown').map(item => item.name).filter(Boolean);
  if (unknown.length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Medicine data incomplete', message: `No verified ingredient mapping is available yet for: ${unknown.join(', ')}. DoctorAI cannot determine whether these medicines clash.`, source: { publisher: 'DoctorAI medication database' } });
  for (const alert of alerts) {
    alert.level = ['high', 'critical'].includes(alert.severity) ? 'RED' : ['moderate', 'medium', 'caution'].includes(alert.severity) ? 'ORANGE' : alert.severity === 'unknown' ? 'UNKNOWN' : 'YELLOW';
    alert.nextStep = alert.level === 'RED' ? 'Seek prompt pharmacist or prescriber review of the complete medication list. Do not change prescribed treatment on your own.' : alert.level === 'UNKNOWN' ? 'Confirm the exact medicine with the label and a pharmacist. Unable to determine from available data.' : 'Ask a pharmacist or prescriber to review this finding and your complete list.';
  }
  const uniqueAlerts = Array.from(new Map(alerts.map(alert => [`${alert.type}|${alert.ruleId || ''}|${alert.message}`, alert])).values());
  const high = uniqueAlerts.some(alert => alert.severity === 'high' || alert.severity === 'critical');
  const moderate = uniqueAlerts.some(alert => ['moderate', 'medium', 'caution'].includes(alert.severity));
  const coverageIncomplete = unknown.length > 0 || uniqueAlerts.some(alert => alert.severity === 'unknown');
  return { schemaVersion: db.schemaVersion, datasetVersion: db.datasetVersion, datasetReviewed: db.datasetReviewed || null, resolved, alerts: uniqueAlerts, coverage: { requested: resolved.length, resolved: resolved.length - unknown.length, unknown: unknown.length, completeForRequest: !coverageIncomplete, medicationPairsEvaluated: resolved.length * (resolved.length - 1) / 2, scope: 'Available recorded rules only; not comprehensive clinical coverage', doseAssessment: 'Unable to determine from available data', routeAssessment: 'Unable to determine from available data' }, status: high ? 'red' : coverageIncomplete ? 'unknown' : moderate ? 'orange' : uniqueAlerts.some(alert => alert.level === 'YELLOW') ? 'yellow' : 'no-known-alerts', disclaimer: 'No-known-alerts does not mean safe. DoctorAI only reports rules present in its verified dataset; medicine decisions require a pharmacist or prescriber.' };
}
module.exports = { review, resolveMedication, norm, validateRequest };

