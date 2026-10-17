'use strict';

const assert = require('node:assert/strict');
const snapshot = require('../data/medication/nz-pharmac-medicines.json');
const medicineSearch = require('../medicine-catalog-search.js');
const safetyEngine = require('../server-src/medication/safety-engine.cjs');

async function run() {
  const originalFetch = global.fetch;
  let catalogue;
  try {
    global.fetch = async url => {
      assert.match(String(url), /^\/data\/medication\/nz-pharmac-medicines\.json\?/);
      return { ok: true, json: async () => snapshot };
    };
    catalogue = await medicineSearch.load();
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(catalogue.products.length, 3419, 'The current Pharmac snapshot is the bounded local search source.');

  const ingredientIds = new Set(catalogue.ingredients.map(item => item.id));
  const completeProducts = catalogue.products.filter(record => record.product.ingredientsComplete === true);
  const incompleteProducts = catalogue.products.filter(record => record.product.ingredientsComplete !== true);
  assert.equal(completeProducts.length, 3310, 'Only rows marked complete in the pinned source count as complete mappings.');
  assert.equal(incompleteProducts.length, 109, 'Every remaining product stays explicitly incomplete.');
  assert.equal(incompleteProducts.filter(record => record.product.ingredients.length > 0).length, 29, 'Partial mappings retain known source ingredients without being promoted to complete.');
  assert.equal(incompleteProducts.filter(record => record.product.ingredients.length === 0).length, 80, 'Empty mappings remain unknown.');
  assert.equal(catalogue.products.filter(record => record.product.ingredients.length > 1).length, 342, 'Combination-product ingredients are kept together.');
  assert.equal(catalogue.products.filter(record => (record.product.ingredients || []).some(id => !ingredientIds.has(id))).length, 0, 'Every referenced source ingredient ID resolves to a catalogue record.');
  const productNames = new Map();
  for (const record of catalogue.products) {
    const key = medicineSearch.normalise(record.product.name);
    const signature = [...(record.product.ingredients || [])].sort().join('|');
    productNames.set(key, [...(productNames.get(key) || []), signature]);
  }
  assert.equal([...productNames.values()].filter(signatures => new Set(signatures).size > 1).length, 0, 'No duplicate normalized exact product names have conflicting ingredient signatures.');

  const ids = results => results.matches.map(record => record.product.id);
  const partialBrand = medicineSearch.search(catalogue, 'Abacavir/Lami', 8);
  assert.ok(ids(partialBrand).includes('pharmac-7e19f47e7eefe045'), 'Partial brand text reaches the exact combination formulation.');
  const generic = medicineSearch.search(catalogue, 'abacavir sulphate', 8);
  assert.ok(ids(generic).includes('pharmac-7e19f47e7eefe045'), 'Generic chemical text reaches the exact combination formulation.');

  const record = medicineSearch.findById(catalogue, 'pharmac-7e19f47e7eefe045');
  assert.ok(record);
  const selected = medicineSearch.selectionFromRecord(record, catalogue);
  assert.equal(selected.productName, record.product.name, 'The selected product keeps its exact full source name.');
  assert.equal(selected.ingredientsComplete, true);
  assert.deepEqual(selected.ingredients.map(item => item.name), ['Abacavir sulphate', 'Lamivudine']);
  assert.equal(selected.doseStatus, 'unverified');
  assert.equal(selected.ruleInteractionRoute, record.product.interactionRoute || '', 'The route tag is source rule-scope metadata only.');

  const voltarenRecord = medicineSearch.findById(catalogue, 'pharmac-27fe3db7fbaac919');
  const voltaren = medicineSearch.selectionFromRecord(voltarenRecord, catalogue);
  assert.equal(voltaren.productName, 'Voltaren — Diclofenac sodium — Suppos 100 mg');
  assert.equal(voltaren.formulation, 'Suppos 100 mg');
  assert.equal(voltaren.ingredientsComplete, true);
  assert.deepEqual(voltaren.ingredients.map(item => item.name), ['Diclofenac']);
  assert.equal(voltaren.doseStatus, 'unverified', 'A complete source mapping does not confirm strength or dose.');

  const ibuprofenTablet = medicineSearch.selectionFromRecord(medicineSearch.findById(catalogue, 'pharmac-34fe78bf9d3ca1b3'), catalogue);
  assert.equal(ibuprofenTablet.formulation, 'Tab 400 mg');
  assert.deepEqual(ibuprofenTablet.ingredients.map(item => item.name), ['Ibuprofen']);
  const ibuprofenLiquid = medicineSearch.selectionFromRecord(medicineSearch.findById(catalogue, 'pharmac-9e06355ab49a321f'), catalogue);
  assert.equal(ibuprofenLiquid.formulation, 'Oral liq 20 mg per ml', 'The concentration stays an exact product-formulation string and is not converted into an amount taken.');
  assert.deepEqual(ibuprofenLiquid.ingredients.map(item => item.name), ['Ibuprofen']);
  const selectedVoltarenName = safetyEngine.resolveMedication({ name: voltaren.productName });
  assert.equal(selectedVoltarenName.status, 'resolved');
  assert.equal(selectedVoltarenName.basis, 'catalogue_name', 'The pre-existing exact name-only resolver remains unchanged.');
  assert.equal(selectedVoltarenName.labelIngredientsConfirmed, undefined, 'A name-only result is not represented as label confirmation.');
  assert.equal(selectedVoltarenName.strength.status, 'listed_match', 'A strength token in the exact product name is only compared with the local catalogue.');
  assert.equal(safetyEngine.resolveMedication({ name: 'Ibuprofen Tab' }).status, 'unknown', 'A typed partial product phrase does not inherit a catalogue product selection or strength.');
  assert.equal(safetyEngine.resolveMedication({ name: 'Panadol Extra' }).status, 'unknown', 'The absent OTC combination brand stays unmatched rather than inheriting paracetamol-only ingredients.');

  const panadolSearch = medicineSearch.search(catalogue, 'Panadol', 8);
  assert.ok(panadolSearch.matches.some(item => item.product.chemical === 'Paracetamol'), 'The source alias reaches generic paracetamol rows for label comparison.');
  assert.ok(panadolSearch.matches.every(item => !/^Panadol(?: Extra)?\b/i.test(item.product.name)), 'A generic ingredient alias is not presented as a source-verified Panadol product identity.');
  assert.equal(medicineSearch.search(catalogue, 'Panadol Extra', 8).totalMatches, 0, 'An unlisted combination brand does not inherit the single-ingredient paracetamol match.');

  const longRecord = medicineSearch.findById(catalogue, 'pharmac-5ac28b8c3c5ef827');
  assert.ok(longRecord.product.name.length > 120 && longRecord.product.name.length <= 500);
  assert.equal(medicineSearch.selectionFromRecord(longRecord, catalogue).productName, longRecord.product.name, 'Long names are preserved in full without truncation.');
  const incomplete = medicineSearch.selectionFromRecord(medicineSearch.findById(catalogue, 'pharmac-f5051fe573125919'), catalogue);
  assert.equal(incomplete.ingredientsComplete, false, 'An incomplete source mapping remains explicitly incomplete.');
  assert.equal(medicineSearch.search(catalogue, 'fictional-query-with-no-match', 8).totalMatches, 0);
  assert.equal(medicineSearch.findById(catalogue, 'pharmac-does-not-exist'), null);

  console.log('Medication catalogue search passed: partial brand/generic queries, exact combination selection, long-name preservation, incomplete mapping and empty result.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
