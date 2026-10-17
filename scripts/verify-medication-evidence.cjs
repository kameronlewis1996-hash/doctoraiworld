'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const seed = require('../data/medication/medication-safety.seed.json');
const nz = require('../data/medication/nz-pharmac-medicines.json');
const exclusions = require('../docs/medication-provenance-exclusions.json');
const engine = require('../server-src/medication/safety-engine.cjs');
const { decision, isCcByRecord } = require('./medication-provenance-policy.cjs');
const { defaultMedicationSafetyProvider } = require('../server-src/medication/safety-provider.cjs');

assert.equal(seed.ruleset.version, '2026.10.15-r149');
assert.equal(seed.ruleset.provenanceFiltered, true);
assert.match(seed.ruleset.scope, /Very limited/i);
assert.match(seed.ruleset.scope, /no alert does not mean safe/i);
assert.doesNotMatch(seed.ruleset.scope, /1117|1,117|retaining every existing record/i);
assert.deepEqual({ interactions: seed.interactionRules.length, combinations: seed.combinationRules.length, conditions: seed.contraindicationRules.length, allergies: seed.allergyRules.length }, { interactions: 2, combinations: 1, conditions: 0, allergies: 2 });
assert.equal(new Set(seed.ingredients.map(item => item.id)).size, seed.ingredients.length);
assert.equal(seed.ingredients.length, 534);
assert.equal(seed.products.length, 0, 'Unlicensed seed product aliases must not be shipped');

const activeByCategory = {
  interactionRules: seed.interactionRules,
  combinationRules: seed.combinationRules,
  contraindicationRules: seed.contraindicationRules,
  allergyRules: seed.allergyRules
};
for (const [category, rules] of Object.entries(activeByCategory)) {
  const auditRules = exclusions.retainedRules[category];
  assert.deepEqual(auditRules.map(item => item.id).sort(), rules.map(item => item.id).sort(), `${category} provenance ledger must match the filtered seed`);
  for (const rule of rules) {
    assert.ok(Number.isSafeInteger(rule.recordVersion) && rule.recordVersion >= 1, rule.id);
    assert.ok(rule.reviewed && rule.evidenceSummary, rule.id);
    if (category === 'allergyRules') {
      assert.equal(decision(rule).keep, true, `${rule.id} must meet the internal DoctorAI exception`);
      assert.equal(rule.source.kind, 'internal-rule');
      assert.equal(rule.source.sourceStatus, 'not-externally-sourced');
      assert.ok(rule.source.attribution);
      assert.ok(!rule.source.additionalSources?.length);
    } else {
      assert.ok(isCcByRecord(rule.source), `${rule.id} must have complete CC BY 4.0 attribution`);
      assert.ok((rule.source.additionalSources || []).every(isCcByRecord), `${rule.id} supplemental source must meet the same rights gate`);
      assert.equal(decision(rule).keep, true);
      assert.equal(rule.source.rightsBasis, 'CC BY 4.0 with record-level attribution');
    }
  }
}
assert.deepEqual(Object.fromEntries(Object.entries(exclusions.exclusions).map(([key, list]) => [key, list.length])), {
  interactionRules: 1115, combinationRules: 17, contraindicationRules: 133, allergyRules: 4
});
for (const id of ['warfarin-nsaid', 'ssri-nsaid-upper-gi-bleeding']) assert.ok(exclusions.exclusions.interactionRules.some(item => item.id === id), `${id} must stay excluded until its rights are documented`);
assert.ok(exclusions.exclusions.interactionRules.some(item => item.id === 'diuretic-nsaid-aki'));
assert.ok(!seed.interactionRules.some(item => item.id === 'warfarin-nsaid'));

assert.equal(nz.licence.name, 'CC BY 4.0');
assert.equal(nz.licence.url, 'https://creativecommons.org/licenses/by/4.0/');
assert.equal(nz.stats.productFormulations, 3419);
assert.equal(nz.stats.incompleteIngredientProducts, 113);
assert.match(nz.attribution, /Pharmac does not endorse DoctorAI/);
assert.match(nz.disclaimer, /does not establish Medsafe approval/);
assert.match(nz.sources[0].sha256, /^[a-f0-9]{64}$/);

function assertProduct(prefix, expectedIngredients, shouldResolve = true) {
  const product = nz.products.find(item => item.name.startsWith(prefix));
  assert.ok(product, `Expected Pharmac product beginning ${prefix}`);
  assert.deepEqual(product.ingredients.slice().sort(), expectedIngredients.slice().sort(), product.name);
  if (shouldResolve) {
    assert.equal(product.ingredientsComplete, true, product.name);
    assert.deepEqual(engine.resolveMedication(product.name).ingredients.map(item => item.id).sort(), expectedIngredients.slice().sort(), product.name);
  }
  return product;
}
assertProduct('Budesonide with eformoterol — Aerosol inhaler 100 mcg', ['pharmac-budesonide', 'pharmac-eformoterol']);
assertProduct('Paracetamol + Codeine (Relieve)', ['paracetamol', 'pharmac-codeine-phosphate']);
assertProduct('Micreme H — Hydrocortisone with miconazole', ['pharmac-hydrocortisone', 'pharmac-miconazole']);
const incompleteBreztri = assertProduct('Breztri Aerosphere', ['pharmac-budesonide', 'pharmac-glycopyrronium', 'pharmac-eformoterol'], false);
assert.equal(incompleteBreztri.ingredientsComplete, false, 'Incomplete catalogue ingredients must remain unknown');
assert.equal(engine.resolveMedication(incompleteBreztri.name).status, 'unknown');

const root = path.join(__dirname, '..');
const chatSource = fs.readFileSync(path.join(root, 'api/chat.js'), 'utf8');
const hubSource = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
const hubHtml = fs.readFileSync(path.join(root, 'health-hub.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
assert.match(chatSource, /explain only medication evidence that the user explicitly supplies/i);
assert.match(chatSource, /must not independently determine, identify, suggest, infer, compare, or rule in or out drug interactions/i);
assert.match(chatSource, /label checkbox or transcription is not clinical validation/i);
const dailyPromptStart = hubSource.indexOf('  function buildTodayIntelligencePrompt(');
const dailyPromptEnd = hubSource.indexOf('  async function loadTodayIntelligence(', dailyPromptStart);
assert.ok(dailyPromptStart >= 0 && dailyPromptEnd > dailyPromptStart);
const dailyPrompt = hubSource.slice(dailyPromptStart, dailyPromptEnd);
assert.match(dailyPrompt, /Medication names, labels and interaction evidence are not included/i);
assert.doesNotMatch(dailyPrompt, /POSSIBLE OVERLAPS TO CHECK|medicineContext/);
assert.match(hubSource, /Very limited check: .*pairwise/);
assert.match(hubSource, /No alert does not mean safe/);
assert.match(hubSource, /the saved medicine schedule is for organisation only/i);
assert.match(hubSource, /I copied every active ingredient listed on the original label/);
assert.match(hubSource, /not clinically validated/);

(async () => {
  const previousFetch = global.fetch;
  let outboundCalls = 0;
  global.fetch = async () => { outboundCalls += 1; throw new Error('Unexpected outbound request in local medication provider check'); };
  try {
    const result = await defaultMedicationSafetyProvider.review({ medications: ['warfarin', 'ibuprofen'] });
    assert.equal(result.status, 'unknown');
    assert.ok(result.alerts.some(item => item.type === 'interaction-coverage'));
    assert.equal(outboundCalls, 0);
  } finally {
    global.fetch = previousFetch;
  }

  assert.match(hubHtml, /health-hub\.js\?v=106/);
  assert.match(hubHtml, /health-hub\.css\?v=90/);
  assert.match(hubHtml, /health-alerts\.js\?v=8/);
  assert.match(hubHtml, /health-alert-status\.js\?v=6/);
  assert.match(hubHtml, /medicine-catalog-search\.js\?v=4/);
  assert.match(serviceWorker, /const CACHE_NAME = 'doctorai-shell-v178';/);
  for (const asset of [
    'health-hub.js?v=106',
    'health-hub.css?v=90',
    'medicine-catalog-search.js?v=4',
    'medicine-photo-review.css?v=1',
    'medicine-photo-review.js?v=1',
    'health-alerts.js?v=8',
    'health-alert-status.js?v=6',
    'aurora-theme.css?v=10',
    'hub-category-themes.css?v=5',
    'hub-navigation.css?v=5'
  ]) {
    assert.ok(hubHtml.includes(`"${asset}"`) || hubHtml.includes(`"/${asset}"`), `${asset} must be loaded by the Health Hub`);
    assert.ok(serviceWorker.includes(`'/${asset}'`), `${asset} must be cached by the service worker`);
  }
  for (const staleAsset of [
    'health-alerts.js?v=6',
    'health-alert-status.js?v=4',
    'aurora-theme.css?v=9',
    'hub-category-themes.css?v=3',
    'hub-navigation.css?v=4'
  ]) {
    assert.ok(!serviceWorker.includes(`'/${staleAsset}'`), `${staleAsset} must not remain in the app-shell cache`);
  }

  console.log('Medication rights, retained-data provenance, Pharmac attribution, three corrected ingredient mappings, incomplete-product fail-closed handling, chat boundaries and cache versions verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
