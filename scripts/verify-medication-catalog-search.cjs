'use strict';

const assert = require('node:assert/strict');
const snapshot = require('../data/medication/nz-pharmac-medicines.json');
const medicineSearch = require('../medicine-catalog-search.js');

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
