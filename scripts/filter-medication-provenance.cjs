'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { decision, retainedAttribution } = require('./medication-provenance-policy.cjs');
const root = path.resolve(__dirname, '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/filter-medication-provenance.cjs <private-unfiltered-seed.json>');
const sourcePath = path.resolve(process.argv[2]);
const seedPath = path.join(root, 'data/medication/medication-safety.seed.json');
const cataloguePath = path.join(root, 'data/medication/nz-pharmac-medicines.json');
const outputAuditJson = path.join(root, 'docs/medication-provenance-exclusions.json');
const outputAuditMd = path.join(root, 'docs/medication-provenance-release-audit.md');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const source = readJson(sourcePath);
const base = readJson(seedPath);
const catalogue = readJson(cataloguePath);
const categories = ['interactionRules', 'combinationRules', 'contraindicationRules', 'allergyRules'];
const exclusions = {};
const retainedReasons = {};
const retainedRules = {};
for (const category of categories) {
  const kept = [];
  const removed = [];
  for (const rule of Array.isArray(source[category]) ? source[category] : []) {
    const result = decision(rule);
    if (result.keep) {
      kept.push(retainedAttribution(rule, result));
      retainedReasons[result.reason] = (retainedReasons[result.reason] || 0) + 1;
    } else {
      removed.push({ id: String(rule.id || '(missing id)'), reason: result.reason });
    }
  }
  source[category] = kept;
  exclusions[category] = removed;
  retainedRules[category] = kept.map(rule => ({
    id: rule.id,
    basis: rule.source.rightsBasis,
    publisher: rule.source.publisher,
    title: rule.source.title || null,
    url: rule.source.url || null,
    license: rule.source.license || null,
    licenseUrl: rule.source.licenseUrl || null,
    attribution: rule.source.attribution
  }));
}
const catalogueIngredientIds = new Set((catalogue.ingredients || []).map(item => item.id));
const previousIngredients = new Map((base.ingredients || []).map(item => [item.id, item]));
const mergedIngredients = [];
for (const previous of base.ingredients || []) {
  const incoming = (source.ingredients || []).find(item => item.id === previous.id);
  if (!incoming) { mergedIngredients.push(previous); continue; }
  const classes = Array.from(new Set([...(previous.classes || []), ...(incoming.classes || [])]));
  mergedIngredients.push(Object.assign({}, previous, incoming, { aliases: previous.aliases || [], classes }));
}
for (const ingredient of source.ingredients || []) {
  if (previousIngredients.has(ingredient.id)) continue;
  if (!String(ingredient.id || '').startsWith('pharmac-') || !catalogueIngredientIds.has(ingredient.id)) continue;
  mergedIngredients.push(ingredient);
}
source.ingredients = mergedIngredients;
// Product identity comes from the CC BY Pharmac catalogue. The seed aliases
// have no record-level reuse terms and are omitted.
source.products = [];
source.terminologySources = (source.terminologySources || []).filter(item =>
  /pharmac/i.test(String(item.name || '') + ' ' + String(item.publisher || '')) &&
  /creativecommons\.org\/licenses\/by\/4\.0/i.test(String(item.licenseUrl || '') + ' ' + String(item.url || '')));
source.importSources = (source.importSources || []).filter(item => /pharmac/i.test(String(item.name || '') + ' ' + String(item.role || '')));
source.scope = 'Very limited local safety prompts with explicit record-level rights evidence only: CC BY 4.0 records with attribution, plus internally attributed DoctorAI allergy class prompts. Other source-derived rules remain excluded until their applicable reuse rights and attribution are documented. Every unmatched or partial medicine pair is unassessed; no alert does not mean safe.';
source.provenanceReleaseFilter = {
  policy: 'retain only record-level CC BY 4.0 with license URL and attribution, or internal DoctorAI original prompts with explicit internal attribution; require explicit reusable rights and attribution for every additional source; exclude unverified, conditional, missing, and otherwise unclear rights',
  appliedOn: new Date().toISOString().slice(0, 10),
  sourceDatasetVersion: source.datasetVersion,
  retainedByReason: retainedReasons,
  removedCounts: Object.fromEntries(Object.entries(exclusions).map(entry => [entry[0], entry[1].length]))
};
source.ruleset = Object.assign({}, source.ruleset || {}, {
  version: source.ruleset && source.ruleset.version || source.datasetVersion,
  scope: source.scope,
  provenanceFiltered: true,
  interactionRuleCount: source.interactionRules.length,
  combinationRuleCount: source.combinationRules.length,
  allergyRuleCount: source.allergyRules.length,
  conditionRuleCount: source.contraindicationRules.length,
  provenancePolicy: source.provenanceReleaseFilter.policy
});
const audit = {
  sourceDatasetVersion: source.datasetVersion,
  appliedOn: source.provenanceReleaseFilter.appliedOn,
  policy: source.provenanceReleaseFilter.policy,
  retainedCounts: {
    ingredients: source.ingredients.length,
    products: source.products.length,
    interactionRules: source.interactionRules.length,
    combinationRules: source.combinationRules.length,
    contraindicationRules: source.contraindicationRules.length,
    allergyRules: source.allergyRules.length
  },
  retainedReasons,
  retainedRules,
  exclusions
};
fs.writeFileSync(seedPath, JSON.stringify(source, null, 2) + '\n');
fs.writeFileSync(outputAuditJson, JSON.stringify(audit, null, 2) + '\n');
const md = [
  '# Medication provenance release filter',
  '',
  'Applied ' + audit.appliedOn + ' to the R149 seed. This is a provenance filter, not a clinical validation.',
  '',
  '## Rule-level policy',
  '',
  'Retain only records with record-level CC BY 4.0 licensing, a license URL, and source attribution, or internally attributed DoctorAI rules with no external source. Each additional source attached to a retained rule must independently meet the same CC BY 4.0 and attribution check. Independent paraphrasing or a public URL does not grant reuse permission. All rules with unverified, conditional, missing, or otherwise unclear rights remain excluded. The exact retained IDs, rights basis, attribution, and excluded IDs are recorded in [medication-provenance-exclusions.json](medication-provenance-exclusions.json).',
  '',
  '## Active counts',
  '',
  '- Pairwise interaction rules: ' + source.interactionRules.length,
  '- Multi-medicine rules: ' + source.combinationRules.length,
  '- Medicine-condition prompts: ' + source.contraindicationRules.length,
  '- Allergy prompts: ' + source.allergyRules.length,
  '- Excluded source-derived safety rules pending reusable rights and attribution: ' + Object.values(exclusions).reduce((sum, items) => sum + items.length, 0),
  '- Coverage status: highly limited; every absent or partial pair is unassessed. No alert does not mean safe.',
  '- Added Pharmac-coded ingredients present in the licensed catalogue; pre-existing DoctorAI ingredient mappings preserved. Product mapping comes only from the licensed Pharmac catalogue; medication seed product aliases were removed.',
  '',
  'The Health New Zealand Top 100 prescribing table and derived counts were excluded because a dataset-specific reuse license was not confirmed. No NZF production authorization or clinical validation is claimed. Pharmac product data retain their source attribution and non-endorsement disclaimer.',
  ''
].join('\n');
fs.writeFileSync(outputAuditMd, md);
console.log(JSON.stringify({
  retained: audit.retainedCounts,
  retainedReasons,
  removed: Object.fromEntries(Object.entries(exclusions).map(entry => [entry[0], entry[1].length])),
  addedPharmacIngredients: source.ingredients.filter(item => String(item.id).startsWith('pharmac-')).length
}));
