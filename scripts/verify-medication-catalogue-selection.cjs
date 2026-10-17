'use strict';

// Selection identity is distinct from a user's confirmation of the original label.
const assert = require('node:assert/strict');
const source = require('../data/medication/nz-pharmac-medicines.json');
const medicineSearch = require('../medicine-catalog-search.js');
const safety = require('../server-src/medication/safety-engine.cjs');

const productIds = {
  single: 'pharmac-97085b2844338e94',
  combination: 'pharmac-7e19f47e7eefe045',
  incomplete: 'pharmac-f5051fe573125919',
  longName: 'pharmac-5ac28b8c3c5ef827',
  warfarin: 'pharmac-0a29aaf4f9d374ff',
  coTrimoxazole: 'pharmac-2265f4edb1773786'
};

async function run() {
  const originalFetch = global.fetch;
  let catalogue;
  try {
    global.fetch = async url => {
      assert.match(String(url), /nz-pharmac-medicines\.json/);
      return { ok: true, json: async () => source };
    };
    catalogue = await medicineSearch.load();
  } finally {
    global.fetch = originalFetch;
  }

  const product = id => {
    const record = catalogue.products.find(item => item.product.id === id);
    assert.ok(record, `Pinned Pharmac product ${id} exists`);
    return record;
  };
  const select = id => medicineSearch.selectionFromRecord(product(id), catalogue);
  let passed = 0;
  const check = (name, fn) => {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  };

  check('single-ingredient selection retains pinned identity, source and form', () => {
    const record = product(productIds.single);
    const selected = select(productIds.single);
    assert.deepEqual(selected, {
      productId: record.product.id,
      productName: record.product.name,
      datasetVersion: source.datasetVersion,
      sourceDate: source.sources[0].effectiveDate,
      formulation: record.product.formulation,
      brand: record.product.brand,
      chemical: record.product.chemical,
      market: record.product.market,
      ruleInteractionRoute: record.product.interactionRoute || '',
      sourceIds: { pharmacodes: record.product.pharmacodes, nzmtIds: record.product.nzmtIds },
      ingredients: [{ id: 'pharmac-lamivudine', name: 'Lamivudine' }],
      ingredientsComplete: true,
      doseStatus: 'unverified'
    });
    const resolved = safety.resolveMedication({ name: selected.productName, catalogueProductId: selected.productId, dose: '10 mg per ml' });
    assert.equal(resolved.status, 'unknown');
    assert.equal(resolved.matchState, 'catalogue_product_unconfirmed');
    assert.equal(resolved.identityOnly, true);
    assert.deepEqual(resolved.ingredients, []);
    assert.deepEqual(resolved.catalogueIngredients.map(item => item.id), ['pharmac-lamivudine']);
    assert.notEqual(resolved.labelIngredientsConfirmed, true, 'Catalogue identity is not label confirmation');
  });

  check('complete combination selects every listed active ingredient', () => {
    const selected = select(productIds.combination);
    assert.equal(selected.ingredientsComplete, true);
    assert.deepEqual(selected.ingredients.map(item => item.id), ['pharmac-abacavir-sulphate', 'pharmac-lamivudine']);
    assert.deepEqual(selected.ingredients.map(item => item.name), ['Abacavir sulphate', 'Lamivudine']);
    const resolved = safety.resolveMedication({ name: selected.productName, catalogueProductId: selected.productId });
    assert.equal(resolved.status, 'unknown');
    assert.equal(resolved.matchState, 'catalogue_product_unconfirmed');
    assert.deepEqual(resolved.ingredients, []);
    assert.deepEqual(resolved.catalogueIngredients.map(item => item.id), selected.ingredients.map(item => item.id));
    assert.notEqual(resolved.labelIngredientsConfirmed, true);
    const confirmed = safety.resolveMedication({
      name: selected.productName,
      catalogueProductId: selected.productId,
      activeIngredients: selected.ingredients.map(item => item.name),
      activeIngredientsConfirmed: true
    });
    assert.equal(confirmed.status, 'resolved');
    assert.equal(confirmed.labelIngredientsConfirmed, true);
    assert.deepEqual(confirmed.ingredients.map(item => item.id), selected.ingredients.map(item => item.id));
  });

  check('partial ingredient mapping remains incomplete and cannot silently resolve', () => {
    const selected = select(productIds.incomplete);
    assert.equal(selected.ingredientsComplete, false);
    assert.deepEqual(selected.ingredients.map(item => item.id), ['pharmac-povidone-iodine']);
    const resolved = safety.resolveMedication({ name: selected.productName, catalogueProductId: selected.productId });
    assert.equal(resolved.status, 'unknown');
    assert.equal(resolved.ingredients.length, 0);
    assert.equal(resolved.catalogueIngredients.length, 1);
  });

  check('long product name remains exact and is not identified by a truncated label', () => {
    const selected = select(productIds.longName);
    assert.ok(selected.productName.length > 120);
    assert.equal(selected.productName, product(productIds.longName).product.name);
    const exact = safety.resolveMedication({ name: selected.productName, catalogueProductId: selected.productId });
    assert.equal(exact.status, 'unknown');
    assert.equal(exact.matchState, 'catalogue_product_unconfirmed');
    assert.deepEqual(exact.ingredients, []);
    assert.deepEqual(exact.catalogueIngredients.map(item => item.id), selected.ingredients.map(item => item.id));
    const truncated = safety.resolveMedication({ name: selected.productName.slice(0, 120), catalogueProductId: selected.productId });
    assert.equal(truncated.status, 'unknown');
    assert.equal(truncated.matchState, 'catalogue_selection_mismatch');
    assert.equal(truncated.ingredients.length, 0);
  });

  check('mismatched and missing catalogue IDs fail closed without fuzzy reassignment', () => {
    const single = select(productIds.single);
    const combination = select(productIds.combination);
    const mismatch = safety.resolveMedication({ name: combination.productName, catalogueProductId: single.productId });
    assert.equal(mismatch.status, 'unknown');
    assert.equal(mismatch.matchState, 'catalogue_selection_mismatch');
    assert.equal(mismatch.ingredients.length, 0);
    const mismatchWithLabel = safety.resolveMedication({
      name: combination.productName,
      catalogueProductId: single.productId,
      activeIngredients: ['Warfarin'],
      activeIngredientsConfirmed: true
    });
    assert.equal(mismatchWithLabel.status, 'unknown');
    assert.equal(mismatchWithLabel.matchState, 'catalogue_selection_mismatch');
    assert.equal(mismatchWithLabel.ingredients.length, 0);
    const missing = safety.resolveMedication({ name: single.productName, catalogueProductId: 'pharmac-nonexistent' });
    assert.equal(missing.status, 'unknown');
    assert.equal(missing.matchState, 'catalogue_selection_unknown');
    assert.equal(missing.ingredients.length, 0);
  });

  check('only explicit original-label confirmation unlocks label ingredient matching', () => {
    const withoutConfirmation = safety.resolveMedication({ name: 'Fictional unlisted medicine', activeIngredients: ['Warfarin'] });
    assert.equal(withoutConfirmation.status, 'unknown');
    assert.equal(withoutConfirmation.ingredients.length, 0);
    const confirmed = safety.resolveMedication({ name: 'Fictional unlisted medicine', activeIngredients: ['Warfarin'], activeIngredientsConfirmed: true });
    assert.equal(confirmed.status, 'resolved');
    assert.equal(confirmed.labelIngredientsConfirmed, true);
    assert.deepEqual(confirmed.ingredients.map(item => item.id), ['warfarin']);
    const single = select(productIds.single);
    const conflictingLabel = safety.resolveMedication({ name: single.productName, catalogueProductId: single.productId, activeIngredients: ['Warfarin'], activeIngredientsConfirmed: true });
    assert.equal(conflictingLabel.status, 'ingredient_mismatch');
    assert.equal(conflictingLabel.ingredients.length, 0);
  });

  check('full checker review separates catalogue display from active clinical rules', () => {
    const selected = select(productIds.single);
    const medication = { name: selected.productName, catalogueProductId: selected.productId, dose: '10 mg per ml' };
    const direct = safety.resolveMedication(medication);
    assert.equal(direct.catalogueProductId, selected.productId);
    assert.equal(direct.identityOnly, true);
    assert.equal(direct.status, 'unknown');
    assert.equal(direct.matchState, 'catalogue_product_unconfirmed');
    assert.deepEqual(direct.ingredients, []);
    assert.deepEqual(direct.catalogueIngredients.map(item => item.id), selected.ingredients.map(item => item.id));
    assert.notEqual(direct.labelIngredientsConfirmed, true);

    const reviewed = safety.review({ medications: [medication] });
    assert.equal(reviewed.resolved.length, 1);
    assert.equal(reviewed.resolved[0].catalogueProductId, selected.productId);
    assert.equal(reviewed.resolved[0].identityOnly, true);
    assert.equal(reviewed.resolved[0].status, 'unknown');
    assert.deepEqual(reviewed.resolved[0].ingredients, []);
    assert.notEqual(reviewed.resolved[0].labelIngredientsConfirmed, true);
    assert.equal(reviewed.coverage.confirmedLabels, 0, 'Selecting a catalogue row alone does not confirm the original label');
    assert.deepEqual({
      pairwise: reviewed.ruleset.interactionRuleCount,
      combinations: reviewed.ruleset.combinationRuleCount,
      conditions: reviewed.ruleset.conditionRuleCount,
      allergies: reviewed.ruleset.allergyRuleCount
    }, { pairwise: 2, combinations: 1, conditions: 0, allergies: 2 });
    assert.equal(reviewed.coverage.interactionCoverage, 'limited');
    assert.equal(reviewed.coverage.doseAssessment, 'not_performed');
    assert.ok(!reviewed.alerts.some(alert => ['interaction', 'allergy', 'duplicate-ingredient', 'contraindication'].includes(alert.type)));

    const pair = [select(productIds.warfarin), select(productIds.coTrimoxazole)];
    const unconfirmed = safety.review({
      medications: pair.map(item => ({ name: item.productName, catalogueProductId: item.productId })),
      allergies: ['Warfarin']
    });
    assert.ok(unconfirmed.resolved.every(item => item.status === 'unknown' && item.ingredients.length === 0));
    assert.equal(unconfirmed.coverage.assessedPairs, 0);
    assert.ok(!unconfirmed.alerts.some(alert => ['interaction', 'allergy', 'duplicate-ingredient', 'contraindication'].includes(alert.type)),
      'A selected source row alone cannot make a pair or allergy rule eligible');
    const confirmedPair = safety.review({
      medications: pair.map(item => ({
        name: item.productName,
        catalogueProductId: item.productId,
        activeIngredients: item.ingredients.map(ingredient => ingredient.name),
        activeIngredientsConfirmed: true
      }))
    });
    assert.ok(confirmedPair.resolved.every(item => item.status === 'resolved' && item.labelIngredientsConfirmed === true));
    assert.equal(confirmedPair.coverage.confirmedLabels, 2);
    assert.ok(confirmedPair.alerts.some(alert => alert.ruleId === 'warfarin-sulfamethoxazole'),
      'Confirming every mapped label ingredient permits the existing retained rule');

    const partial = select(productIds.incomplete);
    const partialReview = safety.review({ medications: [{ name: partial.productName, catalogueProductId: partial.productId }] });
    assert.equal(partialReview.resolved[0].status, 'unknown');
    assert.equal(partialReview.resolved[0].ingredients.length, 0);
    assert.equal(partialReview.coverage.confirmedLabels, 0);
  });

  assert.equal(passed, 7);
  console.log(`${passed}/7 catalogue selection and checker identity regressions passed.`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
