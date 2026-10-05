'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const seed = require('../data/medication/medication-safety.seed.json');
const nz = require('../data/medication/nz-pharmac-medicines.json');
const engine = require('../server-src/medication/safety-engine.cjs');
const { createMedicationSafetyProvider, defaultMedicationSafetyProvider, MEDICATION_SAFETY_PROVIDER_INTERFACE_VERSION } = require('../server-src/medication/safety-provider.cjs');

async function run() {
  const counts = {
    interactionRecordsSourceBackedAndVersioned: 0,
    allergyPromptsVersionedButExplicitlyInternal: 0,
    mappedCombinationProducts: 0,
    ambiguousCombinationProductsFailClosed: 0,
    combinationDuplicateIngredientCases: 0,
    strengthComparisons: 0,
    allergyMatchScenarios: 0,
    explicitUnknownScenarios: 0,
    nameLabelMismatchCases: 0,
    incompletePharmacProductsKeptUnknown: 0,
    providerContractCases: 0,
    chatPolicyGuards: 0,
    dailyPromptPayloadChecks: 0,
    labelTranscriptionUsabilityGuards: 0,
    cacheVersionGuards: 0
  };

  assert.equal(seed.ruleset.version, '2026.10.05-r1');
  assert.equal(seed.ruleset.recordSchemaVersion, 1);
  assert.equal(seed.ruleset.interactionRuleCount, seed.interactionRules.length);
  for (const rule of seed.interactionRules) {
    assert.ok(rule.id);
    assert.equal(rule.recordVersion, 1, `${rule.id} must have an explicit record version`);
    assert.ok(rule.reviewed, `${rule.id} must have a review date`);
    assert.ok(rule.evidenceSummary, `${rule.id} must summarize its evidence`);
    assert.ok(rule.source?.publisher && rule.source?.title, `${rule.id} must identify its source`);
    assert.match(rule.source.url || '', /^https:\/\//, `${rule.id} must link to HTTPS source evidence`);
    assert.ok((rule.source.checkedOn || rule.source.linkCheckAttemptedOn) && rule.source.currentnessNote, `${rule.id} must expose source review/link-check and currentness caveats`);
    counts.interactionRecordsSourceBackedAndVersioned += 1;
  }
  assert.equal(counts.interactionRecordsSourceBackedAndVersioned, 13);

  assert.equal(seed.ruleset.allergyRuleCount, seed.allergyRules.length);
  for (const rule of seed.allergyRules) {
    assert.equal(rule.recordVersion, 1);
    assert.equal(rule.source?.sourceStatus, 'not-externally-sourced');
    assert.ok(rule.source?.currentnessNote);
    assert.match(rule.evidenceSummary, /does not confirm/i);
    counts.allergyPromptsVersionedButExplicitlyInternal += 1;
  }
  assert.equal(counts.allergyPromptsVersionedButExplicitlyInternal, 2);
  assert.equal(seed.contraindicationRules.length, 0, 'No condition rule may be implied when none is present.');

  const combinationProducts = [
    { name: 'Trisul', ingredients: ['sulfamethoxazole', 'trimethoprim'] },
    { name: 'Augmentin', ingredients: ['amoxicillin', 'pharmac-clavulanic-acid'] },
    { name: 'Jardiamet', ingredients: ['pharmac-empagliflozin', 'metformin'] },
    { name: 'Galvumet', ingredients: ['pharmac-vildagliptin', 'metformin'] }
  ];
  for (const item of combinationProducts) {
    const result = engine.resolveMedication(item.name);
    assert.equal(result.status, 'resolved', item.name);
    assert.deepEqual(result.ingredients.map(ingredient => ingredient.id).sort(), [...item.ingredients].sort(), item.name);
    counts.mappedCombinationProducts += 1;
  }

  for (const name of ['Panadol Extra', 'Nurofen Cold & Flu', 'Panadol with caffeine']) {
    const result = engine.resolveMedication(name);
    assert.equal(result.status, 'unknown', name);
    assert.deepEqual(result.ingredients, [], `${name} must not receive a partial single-ingredient mapping`);
    counts.ambiguousCombinationProductsFailClosed += 1;
  }
  const comboDuplicate = engine.review({ medications: ['Trisul', 'TMP'] });
  assert.ok(comboDuplicate.alerts.some(alert => alert.type === 'duplicate-ingredient'));
  counts.combinationDuplicateIngredientCases += 1;

  const strengthCases = [
    { input: { name: 'Marevan', dose: '1 mg' }, expected: 'listed_match' },
    { input: { name: 'Marevan', dose: '99 mg' }, expected: 'unverified' },
    { input: { name: 'Nurofen', dose: '2000 mg per tablet' }, expected: 'unverified' },
    { input: 'Nurofen 200 mg', expected: 'unverified' },
    { input: { name: 'Marevan 1 mg', dose: '99 mg' }, expected: 'unverified' }
  ];
  for (const testCase of strengthCases) {
    const resolved = engine.resolveMedication(testCase.input);
    assert.equal(resolved.strength.status, testCase.expected, JSON.stringify(testCase.input));
    if (testCase.expected === 'unverified' && resolved.status === 'resolved') {
      const result = engine.review({ medications: [testCase.input] });
      assert.ok(result.alerts.some(alert => alert.type === 'strength-review'));
      assert.equal(result.coverage.doseAssessment, 'not_performed');
    }
    counts.strengthComparisons += 1;
  }

  const allergyCases = [
    { medicine: 'amoxicillin', allergy: 'penicillin' },
    { medicine: 'ibuprofen', allergy: 'NSAID' },
    { medicine: 'Augmentin', allergy: 'penicillin' }
  ];
  for (const testCase of allergyCases) {
    const result = engine.review({ medications: [testCase.medicine], allergies: [testCase.allergy] });
    assert.ok(result.alerts.some(alert => alert.type === 'allergy'), `${testCase.medicine} + ${testCase.allergy}`);
    counts.allergyMatchScenarios += 1;
  }

  const unknownCases = [
    { input: 'unlisted synthetic tablet', state: 'unmatched' },
    { input: 'Douglas', state: 'ambiguous_or_incomplete' },
    { input: { name: '' }, state: 'missing_name' },
    { input: { name: 'unlisted synthetic tablet', activeIngredients: ['synthetic agent'], activeIngredientsConfirmed: true }, state: 'confirmed_ingredient_unmatched' }
  ];
  for (const testCase of unknownCases) {
    const result = engine.resolveMedication(testCase.input);
    assert.equal(result.status, 'unknown');
    assert.equal(result.matchState, testCase.state);
    counts.explicitUnknownScenarios += 1;
  }
  const nameLabelMismatch = engine.review({ medications: [
    { name: 'Marevan', dose: '1 mg', activeIngredients: ['warfarin'], activeIngredientsConfirmed: true },
    { name: 'Nurofen', dose: '200 mg', activeIngredients: ['paracetamol'], activeIngredientsConfirmed: true }
  ] });
  assert.equal(nameLabelMismatch.coverage.mismatched, 1);
  assert.equal(nameLabelMismatch.coverage.resolved, 1);
  assert.equal(nameLabelMismatch.alerts.some(alert => alert.ruleId === 'warfarin-nsaid'), false);
  counts.nameLabelMismatchCases += 1;
  for (const product of nz.products.filter(item => !item.ingredientsComplete)) {
    assert.equal(engine.resolveMedication(product.name).status, 'unknown', product.name);
    counts.incompletePharmacProductsKeptUnknown += 1;
  }
  assert.equal(counts.incompletePharmacProductsKeptUnknown, 131);

  assert.equal(MEDICATION_SAFETY_PROVIDER_INTERFACE_VERSION, 1);
  assert.equal(defaultMedicationSafetyProvider.interfaceVersion, 1);
  assert.equal(defaultMedicationSafetyProvider.id, 'doctorai-local-pharmac-rules');
  assert.equal(defaultMedicationSafetyProvider.version, seed.ruleset.version);
  counts.providerContractCases += 1;

  const input = { medications: ['Marevan', 'Nurofen'], allergies: [], conditions: [] };
  const direct = engine.review(input);
  const previousFetch = global.fetch;
  let outboundCalls = 0;
  global.fetch = async () => { outboundCalls += 1; throw new Error('Unexpected outbound call in local provider test'); };
  try {
    assert.deepEqual(await defaultMedicationSafetyProvider.review(input), direct);
    assert.equal(outboundCalls, 0);
    counts.providerContractCases += 1;
  } finally {
    global.fetch = previousFetch;
  }

  let received;
  const substitute = createMedicationSafetyProvider({ id: 'synthetic-substitute', version: 'test-only', review: async value => { received = value; return { supplied: true }; } });
  assert.equal(substitute.interfaceVersion, 1);
  assert.strictEqual(received, undefined);
  assert.deepEqual(await substitute.review(input), { supplied: true });
  assert.strictEqual(received, input, 'The substitute provider must receive the same validated input.');
  assert.throws(() => createMedicationSafetyProvider({ review: null }), /implement review/i);
  counts.providerContractCases += 1;

  const root = path.join(__dirname, '..');
  const chatSource = fs.readFileSync(path.join(root, 'api/chat.js'), 'utf8');
  const hubSource = fs.readFileSync(path.join(root, 'health-hub.js'), 'utf8');
  const hubHtml = fs.readFileSync(path.join(root, 'health-hub.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const dailyPromptStart = hubSource.indexOf('  function buildTodayIntelligencePrompt(');
  const dailyPromptEnd = hubSource.indexOf('  async function loadTodayIntelligence(', dailyPromptStart);
  assert.ok(dailyPromptStart >= 0 && dailyPromptEnd > dailyPromptStart);
  const dailyPrompt = hubSource.slice(dailyPromptStart, dailyPromptEnd);
  assert.match(chatSource, /explain only medication evidence that the user explicitly supplies/i);
  assert.match(chatSource, /must not independently determine, identify, suggest, infer, compare, or rule in or out drug interactions/i);
  assert.match(chatSource, /label checkbox or transcription is not clinical validation/i);
  assert.match(dailyPrompt, /Medication names, labels and interaction evidence are not included/i);
  assert.doesNotMatch(dailyPrompt, /POSSIBLE OVERLAPS TO CHECK|medicineContext/);
  assert.match(hubSource, /buildTodayIntelligencePrompt\(symptoms\)/);
  assert.match(hubSource, /void loadTodayIntelligence\(recentSymptoms\);/);
  assert.match(hubSource, /the saved medicine schedule is for organisation only/i);
  counts.chatPolicyGuards = 8;
  const promptFunction = dailyPrompt.trim();
  const buildDailyPrompt = new Function('symptomName', 'symptomSeverity', `return (${promptFunction});`)(item => item.name, severity => severity);
  const generatedDailyPrompt = buildDailyPrompt([{ name: 'synthetic headache', severity: 2, notes: 'synthetic note' }]);
  assert.match(generatedDailyPrompt, /Recent symptoms: synthetic headache · intensity 2\/10 · synthetic note/);
  assert.doesNotMatch(generatedDailyPrompt, /Marevan|Nurofen|paracetamol|warfarin/i);
  counts.dailyPromptPayloadChecks = 2;

  assert.match(hubSource, /Look for “active ingredient\(s\)” or “each tablet contains”/);
  assert.match(hubSource, /separate multiple names with commas/);
  assert.match(hubSource, /If you cannot find or read this section, leave it blank and ask a pharmacist/);
  assert.match(hubSource, /not clinical validation or a safety check/);
  assert.match(hubSource, /I copied every active ingredient listed on the original label/);
  assert.match(hubSource, /aria-describedby', ingredientHelp\.id/);
  assert.match(hubSource, /ingredient lists checked by you against the package \(not clinically validated\)/);
  assert.match(hubSource, /name mapping agrees with the ingredient text you checked against the package/);
  assert.doesNotMatch(hubSource, /medicine name and confirmed label ingredients match/);
  const splitDetailsLine = hubSource.match(/const splitDetails = value => [^\r\n]+/);
  assert.ok(splitDetailsLine, 'The label ingredient delimiter behavior must remain explicit.');
  const splitDetails = new Function(`${splitDetailsLine[0]}; return splitDetails;`)();
  assert.deepEqual(splitDetails('ibuprofen, paracetamol'), ['ibuprofen', 'paracetamol']);
  counts.labelTranscriptionUsabilityGuards = 11;

  assert.match(hubHtml, /health-hub\.js\?v=65/);
  assert.match(hubHtml, /health-hub\.css\?v=70/);
  assert.match(serviceWorker, /doctorai-shell-v110/);
  assert.match(serviceWorker, /health-hub\.js\?v=65/);
  assert.match(serviceWorker, /health-hub\.css\?v=70/);
  counts.cacheVersionGuards = 5;

  process.stdout.write(JSON.stringify({
    result: 'passed',
    rules: {
      ruleset: seed.ruleset.version,
      sourceBackedVersionedInteractions: counts.interactionRecordsSourceBackedAndVersioned,
      internallyCuratedAllergyPrompts: counts.allergyPromptsVersionedButExplicitlyInternal,
      conditionRules: seed.contraindicationRules.length
    },
    scenarios: {
      mappedCombinationProducts: counts.mappedCombinationProducts,
      ambiguousCombinationProductsFailClosed: counts.ambiguousCombinationProductsFailClosed,
      combinationDuplicateIngredientCases: counts.combinationDuplicateIngredientCases,
      strengthComparisons: counts.strengthComparisons,
      allergyMatchCases: counts.allergyMatchScenarios,
      explicitUnknownCases: counts.explicitUnknownScenarios,
      nameLabelMismatchCases: counts.nameLabelMismatchCases,
      incompletePharmacProductsFailClosed: counts.incompletePharmacProductsKeptUnknown
    },
    providerInterface: { version: MEDICATION_SAFETY_PROVIDER_INTERFACE_VERSION, contractCases: counts.providerContractCases, defaultProvider: defaultMedicationSafetyProvider.id, outboundCalls: 0 },
    interactionReasoning: { chatPolicyGuards: counts.chatPolicyGuards, dailyPromptPayloadChecks: counts.dailyPromptPayloadChecks, manualTranscriptionGuards: counts.labelTranscriptionUsabilityGuards, cacheVersionGuards: counts.cacheVersionGuards }
  }, null, 2) + '\n');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
