const db = require('../../data/medication/medication-safety.seed.json');
const norm = value => String(value || '').toLowerCase().replace(/[®™]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ingredients = new Map(db.ingredients.map(item => [item.id, item]));
const ingredientTerms = ingredient => [ingredient.name, ...(ingredient.aliases || [])].map(norm).filter(Boolean);
function resolveMedication(name) {
  const q = norm(name);
  if (!q) return { name, ingredients: [], status: 'unknown' };
  const product = db.products.find(item => norm(item.name) === q || q.includes(norm(item.name)));
  if (product) return { name, ingredients: product.ingredients.map(id => ingredients.get(id)).filter(Boolean), status: 'resolved', matched: product.name };
  const ingredient = db.ingredients.find(item => ingredientTerms(item).some(term => term === q || q.includes(term)));
  return ingredient ? { name, ingredients: [ingredient], status: 'resolved', matched: ingredient.name } : { name, ingredients: [], status: 'unknown' };
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
  const unknown = resolved.filter(item => item.status === 'unknown').map(item => item.name).filter(Boolean);
  if (unknown.length) alerts.push({ type: 'unknown', severity: 'unknown', title: 'Medicine data incomplete', message: `No verified ingredient mapping is available yet for: ${unknown.join(', ')}. DoctorAI cannot determine whether these medicines clash.`, source: { publisher: 'DoctorAI medication database' } });
  const uniqueAlerts = Array.from(new Map(alerts.map(alert => [`${alert.type}|${alert.ruleId || ''}|${alert.message}`, alert])).values());
  const high = uniqueAlerts.some(alert => alert.severity === 'high' || alert.severity === 'critical');
  const moderate = uniqueAlerts.some(alert => ['moderate', 'medium', 'caution'].includes(alert.severity));
  return { schemaVersion: db.schemaVersion, datasetVersion: db.datasetVersion, datasetReviewed: db.datasetReviewed || null, resolved, alerts: uniqueAlerts, coverage: { requested: resolved.length, resolved: resolved.length - unknown.length, unknown: unknown.length, completeForRequest: unknown.length === 0 }, status: high ? 'red' : unknown.length ? 'unknown' : moderate ? 'orange' : 'no-known-alerts', disclaimer: 'No-known-alerts does not mean safe. DoctorAI only reports rules present in its verified dataset; medicine decisions require a pharmacist or prescriber.' };
}
module.exports = { review, resolveMedication, norm };
