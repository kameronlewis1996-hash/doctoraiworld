'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const drugBank = require('../api/medication/_lib/drugbank.cjs');

const original = {
  authorize: drugBank.authorize,
  providerReady: drugBank.providerReady,
  drugBankGet: drugBank.drugBankGet,
  drugBankGetPage: drugBank.drugBankGetPage,
  safeProviderFailure: drugBank.safeProviderFailure
};

function verifyProviderConfigurationGate() {
  const names = [
    'DRUGBANK_API_KEY',
    'DRUGBANK_COMMERCIAL_LICENSED',
    'DRUGBANK_SAFETY_CRITICAL_USE_APPROVED',
    'DRUGBANK_NZ_INGREDIENT_SCOPE_APPROVED',
    'DRUGBANK_CLINICAL_MODULES'
  ];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.DRUGBANK_API_KEY = 'test-key';
    process.env.DRUGBANK_COMMERCIAL_LICENSED = 'true';
    process.env.DRUGBANK_SAFETY_CRITICAL_USE_APPROVED = 'true';
    process.env.DRUGBANK_NZ_INGREDIENT_SCOPE_APPROVED = 'true';
    process.env.DRUGBANK_CLINICAL_MODULES = 'ingredient_search,condition_search,allergy_presentation_search,ddi,allergy_checker,cross_sensitivities,contraindications,adverse_effects';
    assert.equal(drugBank.configured(), true, 'The provider is ready only with all signed-use, NZ-scope, key, and module gates enabled.');
    delete process.env.DRUGBANK_NZ_INGREDIENT_SCOPE_APPROVED;
    assert.equal(drugBank.configured(), false, 'DrugBank must remain disabled without written NZ ingredient-scope approval.');
    process.env.DRUGBANK_NZ_INGREDIENT_SCOPE_APPROVED = 'false';
    assert.equal(drugBank.configured(), false, 'An explicit false NZ-scope flag must keep the provider disabled.');
  } finally {
    names.forEach(name => {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    });
  }
}

function responseRecorder() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function requestBody() {
  return {
    consent: true,
    contextReviewed: true,
    reviewed: { allergies: true, conditions: true, symptoms: true },
    medications: [
      { id: 'med-one', name: 'Private medicine name', notes: 'Private free-text note', expectedIngredientCount: 2, ingredientIds: ['DB00001', 'DB00002'] },
      { id: 'med-two', name: 'Another private medicine', expectedIngredientCount: 1, ingredientIds: ['DB00002'] }
    ],
    allergyPresentationIds: ['DBCOND00003'],
    allergyIngredientIds: ['DB00003'],
    conditionIds: ['DBCOND00001'],
    symptomConditionIds: ['DBCOND00002'],
    unmappedTerms: { allergies: 0, conditions: 0, symptoms: 0 }
  };
}

function verifyExactProductIngredientCount() {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'health-hub.js'), 'utf8');
  const start = appSource.indexOf('  function validNzmtProduct(product) {');
  const end = appSource.indexOf('\n  async function searchNzfProducts', start);
  assert.ok(start >= 0 && end > start, 'The exact-product validator must be available.');
  const context = {};
  vm.runInNewContext(`${appSource.slice(start, end)}\nthis.readValidNzmtProduct = validNzmtProduct;`, context);
  const ingredient = index => ({ id: String(20000000 + index), name: `Synthetic ingredient ${index}` });
  const product = count => ({ id: '10000001', productType: 'ctpp', ingredientsComplete: true, ingredients: Array.from({ length: count }, (_, index) => ingredient(index)) });
  const legacy = context.readValidNzmtProduct(product(8));
  assert.equal(legacy.ingredientsComplete, false, 'A stored product without a verified source count must remain unchecked.');
  const exact = context.readValidNzmtProduct({ ...product(2), activeIngredientCount: 2 });
  assert.equal(exact.ingredientsComplete, true, 'A verified complete ingredient count can be checked.');
  const mismatched = context.readValidNzmtProduct({ ...product(1), activeIngredientCount: 2 });
  assert.equal(mismatched.ingredientsComplete, false, 'A count mismatch must remain unchecked.');
  const overflow = context.readValidNzmtProduct({ ...product(9), activeIngredientCount: 9 });
  assert.equal(overflow, null, 'A product with more ingredients than the form supports must not be selected.');
}

function verifyIncompleteCatalogueNeedsLabelReview() {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'health-hub.js'), 'utf8');
  const start = appSource.indexOf('  function medicationSafetyRequestId(');
  const end = appSource.indexOf('\n  function appendSafetyResultCard', start);
  assert.ok(start >= 0 && end > start, 'The saved ingredient safety payload builder must exist.');
  const context = {
    state: { medications: [] },
    medicationSafetyTerms: () => ({ reviewed: { allergies: true, conditions: true, symptoms: true }, allergies: [], conditions: [], symptoms: [] }),
    validNzmtProduct: product => product,
    medicationSafetyUnmappedCounts: () => ({ allergies: 0, conditions: 0, symptoms: 0 })
  };
  vm.runInNewContext(`${appSource.slice(start, end)}\nthis.readDrugBankSafetyPayload = buildDrugBankSafetyPayload;`, context);
  const medication = (manualReview, catalogueComplete) => ({
    id: 'med-legacy',
    activeIngredients: ['synthetic ingredient'],
    activeIngredientsConfirmed: true,
    activeIngredientsManuallyConfirmed: manualReview,
    resolvedIngredients: [{ label: 'synthetic ingredient', id: 'DB00001', name: 'Synthetic ingredient' }],
    nzfProductConfirmed: true,
    nzfProduct: { productType: 'ctpp', ingredientsComplete: catalogueComplete }
  });
  context.state.medications = [medication(false, false)];
  const unreviewed = context.readDrugBankSafetyPayload().medications[0];
  assert.deepEqual(Array.from(unreviewed.ingredientIds), [], 'An incomplete catalogue subset must not reach the ingredient checker as complete.');
  assert.ok(unreviewed.expectedIngredientCount > unreviewed.ingredientIds.length, 'The unmatched medicine must keep the overall result incomplete.');
  context.state.medications = [medication(true, false)];
  const manuallyReviewed = context.readDrugBankSafetyPayload().medications[0];
  assert.deepEqual(Array.from(manuallyReviewed.ingredientIds), ['DB00001'], 'A user who confirms every label ingredient may run the separate ingredient check.');
  context.state.medications = [{ ...medication(true, false), nzfProduct: { productType: 'ctpp', activeIngredientCount: 2, ingredients: [{ id: '20000001', name: 'Synthetic ingredient' }], ingredientsComplete: false } }];
  const knownOmission = context.readDrugBankSafetyPayload().medications[0];
  assert.deepEqual(Array.from(knownOmission.ingredientIds), [], 'A catalogue count proving that ingredient entries are missing overrides a stale manual review flag.');
  assert.ok(knownOmission.expectedIngredientCount > knownOmission.ingredientIds.length, 'Known catalogue omissions stay visible as unmatched.');
  context.state.medications = [medication(false, true)];
  const completeCatalogue = context.readDrugBankSafetyPayload().medications[0];
  assert.deepEqual(Array.from(completeCatalogue.ingredientIds), ['DB00001'], 'A verified complete catalogue list remains eligible.');
  assert.ok(appSource.includes('activeIngredientsManuallyConfirmed: activeIngredients.length > 0 && ingredientsManuallyConfirmed'), 'The form must persist the distinct manual label review for incomplete catalogue products.');
  assert.ok(appSource.includes('productIngredientCountMismatch'), 'The form must not accept a manual review while the catalogue still proves ingredient entries are missing.');
}

function verifyExactProductIngredientWarnings() {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'health-hub.js'), 'utf8');
  assert.ok(
    appSource.includes("medicationForm.elements.dose?.addEventListener('input', clearIdentityMatch);"),
    'Editing medication strength/dosage must clear the selected exact product and require a fresh confirmation.'
  );
  const start = appSource.indexOf('  function medicationSafetyAlerts(medication) {');
  const end = appSource.indexOf('\n  function medicationSafetyMarkup', start);
  assert.notEqual(start, -1, 'The Health Hub medication safety alert function must exist.');
  assert.ok(end > start, 'The Health Hub safety alert function must have a clear end marker.');
  const state = { medications: [], profile: { allergies: '', conditions: '', notes: '' } };
  const context = {
    state,
    medicationLooksDuplicated: () => false,
    splitDetails: () => [],
    validNzmtProduct(product) {
      if (!product || product.productType !== 'ctpp' || !/^\d{7,20}$/.test(String(product.id || ''))) return null;
      const ingredients = (Array.isArray(product.ingredients) ? product.ingredients : []).filter(item => /^\d{7,20}$/.test(String(item?.id || '')) && item?.name);
      return { ...product, ingredients };
    }
  };
  vm.runInNewContext(`${appSource.slice(start, end)}\nthis.readMedicationSafetyAlerts = medicationSafetyAlerts;`, context, { filename: 'health-hub.js medication-safety alert slice' });
  const medication = (id, name, productIngredientId, { confirmed = true, complete = true, labelIngredients = [], labelConfirmed = false } = {}) => ({
    id,
    name,
    dose: '10 mg',
    activeIngredients: labelIngredients,
    activeIngredientsConfirmed: labelConfirmed,
    nzfProductConfirmed: confirmed,
    nzfProduct: {
      id: id === 'med-one' ? '10000001' : '10000002',
      productType: 'ctpp',
      ingredientsComplete: complete,
      ingredients: [{ id: productIngredientId, name: 'Synthetic ingredient' }]
    }
  });
  const exactProductAlert = alerts => alerts.find(alert => alert.title === 'Possible repeated active ingredient (exact product match)');

  const first = medication('med-one', 'Synthetic medicine A', '20000001');
  const second = medication('med-two', 'Synthetic medicine B', '20000001');
  state.medications = [first, second];
  const exactAlert = exactProductAlert(context.readMedicationSafetyAlerts(first));
  assert.ok(exactAlert, 'Two confirmed complete NZMT ingredient lists with the same ID should produce a caution.');
  assert.match(exactAlert.message, /Synthetic ingredient/);
  assert.match(exactAlert.message, /may be intentional/);
  assert.equal(exactAlert.severity, 'caution');

  state.medications = [first, medication('med-two', 'Synthetic medicine B', '20000002')];
  assert.equal(exactProductAlert(context.readMedicationSafetyAlerts(first)), undefined, 'Different ingredient IDs must not produce an exact-match duplicate warning.');

  state.medications = [first, medication('med-two', 'Synthetic medicine B', '20000001', { confirmed: false })];
  assert.equal(exactProductAlert(context.readMedicationSafetyAlerts(first)), undefined, 'An unconfirmed product must not produce an exact-match duplicate warning.');

  state.medications = [first, medication('med-two', 'Synthetic medicine B', '20000001', { complete: false })];
  assert.equal(exactProductAlert(context.readMedicationSafetyAlerts(first)), undefined, 'An incomplete ingredient list must not produce an exact-match duplicate warning.');

  const textOnlyFirst = medication('med-one', 'Synthetic medicine A', '20000001', { confirmed: false, labelIngredients: ['synthetic ingredient'], labelConfirmed: true });
  const textOnlySecond = medication('med-two', 'Synthetic medicine B', '20000001', { confirmed: false, labelIngredients: ['synthetic ingredient'], labelConfirmed: true });
  state.medications = [textOnlyFirst, textOnlySecond];
  assert.ok(context.readMedicationSafetyAlerts(textOnlyFirst).some(alert => alert.title === 'Possible repeated label ingredient (not database checked)'), 'Existing text-only cautions must remain visible without a product match.');
}

function verifySavedMedicationEditFlow() {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'health-hub.js'), 'utf8');
  assert.ok(appSource.includes('data-edit-medication="${escapeHTML(medication.id)}"'), 'Each saved medication must expose an accessible edit action.');
  assert.ok(appSource.includes("event.target.closest('[data-edit-medication]')"), 'The medication library edit action must have a delegated click handler.');
  assert.ok(appSource.includes('openMedicationModal({ ...medication, __editId: String(medication.id) })'), 'Editing must pass the existing record into the medication form.');
  assert.ok(appSource.includes('medicationForm.dataset.editMedicationId = editId;'), 'The form must keep a stable edit ID through submission.');
  assert.ok(appSource.includes("if (editingId && existingIndex < 0)"), 'A stale edit form must not silently create a duplicate medicine.');
  assert.ok(appSource.includes('id: existingMedication?.id || `med-${Date.now()}`'), 'Saving an edit must keep the existing medication ID.');
  assert.ok(appSource.includes('status: existingMedication?.status ?? \'due\''), 'Saving an edit must preserve the medication reminder status.');
  assert.ok(appSource.includes('if (existingIndex >= 0) state.medications[existingIndex] = medicationRecord;'), 'Saving an edit must replace the existing record in place.');
  assert.ok(appSource.includes("editingId && values.clearRefill !== 'on' ? String(existingMedication?.refill || 'Not set')"), 'A blank refill field must preserve the current refill date unless the user clears it.');
  assert.ok(appSource.includes('value="${escapeHTML(prefill.supply ?? \'\')}"'), 'An existing zero supply must remain visible in the edit form.');
  assert.ok(appSource.includes('const previousProduct = editing && prefill.nzfProductConfirmed === true ? validNzmtProduct(prefill.nzfProduct) : null;'), 'An unchanged, previously confirmed exact product may stay matched during an edit.');
  assert.ok(appSource.includes('if (editing) prefill = { ...prefill, refill: \'\' };'), 'Legacy localized refill dates must not be placed into the browser date input.');
}

async function run() {
  verifyProviderConfigurationGate();
  verifyExactProductIngredientCount();
  verifyIncompleteCatalogueNeedsLabelReview();
  verifyExactProductIngredientWarnings();
  verifySavedMedicationEditFlow();
  const providerCalls = [];
  let failInteractions = false;
  drugBank.authorize = async () => ({ subject: 'test-user' });
  drugBank.providerReady = () => true;
  drugBank.safeProviderFailure = () => ({ error: 'The medication database is unavailable. No database check was completed.' });
  drugBank.drugBankGet = async (path, query) => {
    providerCalls.push({ path, query });
    assert.equal(path, '/allergy_checker');
    return {
      allergic_presentations: [{
        drugbank_id: 'DBCOND00003',
        name: 'Test allergy presentation',
        possible_causative_entries: [{ ingredient: { drugbank_id: 'DB00001', name: 'Test ingredient one' } }],
        references: [{ title: 'A valid reference', url: 'https://example.org/reference' }, { title: 'Unsafe URL', url: 'javascript:alert(1)' }]
      }]
    };
  };
  drugBank.drugBankGetPage = async (path, query) => {
    providerCalls.push({ path, query });
    if (path === '/ddi') {
      if (failInteractions) throw new Error('synthetic provider outage');
      return { data: { interactions: [
        { ingredient: { drugbank_id: 'DB00001', name: 'Ingredient one' }, affected_ingredient: { drugbank_id: 'DB00002', name: 'Ingredient two' }, severity: 'moderate', evidence_level: 'level_2', description: 'Interaction summary.' },
        { ingredient: { drugbank_id: 'DB00002', name: 'Ingredient two' }, affected_ingredient: { drugbank_id: 'DB00001', name: 'Ingredient one' }, severity: 'major', evidence_level: 'level_1', description: 'Additional interaction detail.', management: 'Review with a clinician.' },
        { ingredient: { drugbank_id: 'DB00001' }, affected_ingredient: { drugbank_id: 'DB00999' }, severity: 'major', description: 'Outside the selected list.' }
      ] }, link: '' };
    }
    if (path === '/drugs/DB00003/cross_sensitivities') {
      return { data: { cross_sensitivities: [{ cross_sensitive_drugs: [{ drugbank_id: 'DB00002', name: 'Ingredient two' }], summary: 'Possible related sensitivity.', references: [] }] }, link: '' };
    }
    if (path === '/drugs/DB00001/contraindications') {
      return { data: [{ drug: { name: 'Ingredient one' }, patient_conditions: [{ drugbank_id: 'DBCOND00001', name: 'Test condition' }], recommended_actions: ['Ask a clinician to review.'] }], link: '' };
    }
    if (path === '/drugs/DB00002/contraindications') return { data: [], link: '' };
    if (path === '/drugs/DB00001/adverse_effects') {
      return { data: [{ drug: { name: 'Ingredient one' }, effect: { drugbank_id: 'DBCOND00002', name: 'Test symptom' }, evidence_type: ['observational'] }], link: '' };
    }
    if (path === '/drugs/DB00002/adverse_effects') return { data: [], link: '' };
    throw new Error(`Unexpected provider path: ${path}`);
  };

  delete require.cache[require.resolve('../api/medication/_handlers/safety-check.js')];
  const handler = require('../api/medication/_handlers/safety-check.js');

  const rejected = responseRecorder();
  const noConsent = requestBody();
  noConsent.consent = false;
  await handler({ method: 'POST', headers: {}, body: noConsent, socket: {} }, rejected);
  assert.equal(rejected.statusCode, 400, 'A database request must require explicit one-time consent.');
  assert.equal(providerCalls.length, 0, 'No provider request may run before consent.');

  const complete = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: requestBody(), socket: {} }, complete);
  assert.equal(complete.statusCode, 200);
  assert.equal(complete.body.status, 'complete');
  assert.equal(complete.body.checks.interactions.alerts.length, 1, 'Reverse interaction records should merge into one ingredient pair.');
  assert.equal(complete.body.checks.interactions.alerts[0].severity, 'major', 'Merged interaction should retain the highest severity.');
  assert.match(complete.body.checks.interactions.alerts[0].description, /Additional interaction detail/);
  assert.equal(complete.body.checks.interactions.alerts[0].references.some(reference => reference.url.startsWith('javascript:')), false);
  assert.equal(complete.body.checks.allergies.alerts.some(alert => alert.kind === 'allergy_presentation'), true);
  assert.equal(complete.body.checks.allergies.alerts.some(alert => alert.kind === 'cross_sensitivity' && alert.matchedIngredientId === 'DB00002'), true);
  assert.equal(complete.body.checks.conditions.alerts[0].conditionId, 'DBCOND00001');
  assert.equal(complete.body.checks.symptoms.alerts[0].symptomId, 'DBCOND00002');
  assert.equal(complete.body.checks.duplicateIngredients.alerts[0].ingredientId, 'DB00002');
  assert.deepEqual(complete.body.checks.interactions.alerts[0].references, []);
  assert.equal(JSON.stringify(providerCalls).includes('Private medicine name'), false, 'Medicine names must not be sent to the provider.');
  assert.equal(JSON.stringify(providerCalls).includes('Private free-text note'), false, 'Free-text notes must not be sent to the provider.');
  assert.equal(providerCalls.find(call => call.path === '/ddi').query.drugbank_id, 'DB00001,DB00002');

  const incompleteBody = requestBody();
  incompleteBody.unmappedTerms.symptoms = 1;
  const incomplete = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: incompleteBody, socket: {} }, incomplete);
  assert.equal(incomplete.statusCode, 200);
  assert.equal(incomplete.body.status, 'incomplete', 'Unmapped health-profile terms cannot be reported as clear.');

  failInteractions = true;
  const unavailableBody = requestBody();
  unavailableBody.allergyPresentationIds = [];
  unavailableBody.allergyIngredientIds = [];
  unavailableBody.conditionIds = [];
  unavailableBody.symptomConditionIds = [];
  const unavailable = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: unavailableBody, socket: {} }, unavailable);
  assert.equal(unavailable.statusCode, 200);
  assert.equal(unavailable.body.status, 'incomplete', 'A provider outage cannot produce a clear result.');
  assert.equal(unavailable.body.checks.interactions.status, 'unavailable');
  assert.match(unavailable.body.failures[0], /No database check was completed/);

  process.stdout.write('Medication safety verification passed (provider-use and NZ-scope gates, consent, ID-only provider calls, incomplete catalogue label-review gate, interactions, allergy/cross-sensitivity, conditions, symptoms, backend duplicates, exact NZMT duplicate warnings, incomplete records, and provider outage).\n');
}

run().finally(() => {
  drugBank.authorize = original.authorize;
  drugBank.providerReady = original.providerReady;
  drugBank.drugBankGet = original.drugBankGet;
  drugBank.drugBankGetPage = original.drugBankGetPage;
  drugBank.safeProviderFailure = original.safeProviderFailure;
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
