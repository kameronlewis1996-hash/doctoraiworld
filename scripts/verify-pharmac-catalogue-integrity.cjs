'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'data/medication/nz-pharmac-medicines.json');

const PINNED = Object.freeze({
  datasetVersion: '2026-10-01-pharmac',
  sourceSha256: '02c154e4b712ea0a5f76b8a396c2bf65060d345f564f72457a1aa45e898dbc9b',
  productFormulations: 3419,
  stats: Object.freeze({
    productFormulations: 3419,
    brandNames: 1444,
    chemicalNames: 1224,
    ingredientTerms: 1137,
    completeIngredientProducts: 3306,
    incompleteIngredientProducts: 113,
    skipped: Object.freeze({ devices: 31, specialFoodChemicals: 143, inactive: 0 }),
  }),
  sources: Object.freeze([
    Object.freeze({
      publisher: 'Pharmac | Te Pātaka Whaioranga',
      title: 'Pharmaceutical Schedule',
      effectiveDate: '2026-10-01',
      url: 'https://schedule.pharmac.govt.nz/pub/schedule/archive/2026/2026-10-01/Schedule_2026-10-01.xml',
      sha256: 'cb89c7d2d44be5145f8966f4c7e3bedf971f28432c208748fed91a68f4260b7b',
    }),
    Object.freeze({
      publisher: 'Pharmac | Te Pātaka Whaioranga',
      title: 'Hospital Medicines List',
      effectiveDate: '2026-10-01',
      url: 'https://schedule.pharmac.govt.nz/pub/HML/archive/2026/2026-10-01/HML_2026-10-01.xml',
      sha256: 'f60f7df51ef4716f2382580dda49f033ea3b45ee5734deb826068e0a49f2bf7b',
    }),
  ]),
  licence: Object.freeze({
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html',
  }),
});

function validateStructure(catalogue) {
  assert.ok(catalogue && typeof catalogue === 'object' && !Array.isArray(catalogue), 'Catalogue must be an object');
  assert.equal(typeof catalogue.datasetVersion, 'string', 'Catalogue datasetVersion must be explicit');
  assert.ok(Array.isArray(catalogue.products), 'Catalogue products must be an array');
  assert.ok(catalogue.stats && typeof catalogue.stats === 'object', 'Catalogue stats must be explicit');

  const ids = new Set();
  let completeIngredientProducts = 0;
  let incompleteIngredientProducts = 0;
  for (const [index, row] of catalogue.products.entries()) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row), `Product ${index} must be an object`);
    for (const field of ['id', 'name', 'chemical', 'formulation', 'market']) {
      assert.equal(typeof row[field], 'string', `Product ${index} ${field} must be a string`);
    }
    assert.ok(row.id.length > 0, `Product ${index} id must not be empty`);
    assert.ok(row.name.length > 0, `Product ${index} name must not be empty`);
    assert.ok(row.chemical.length > 0, `Product ${index} chemical must not be empty`);
    assert.ok(row.formulation.length > 0, `Product ${index} formulation must not be empty`);
    assert.equal(row.market, 'NZ', `Product ${index} market must stay explicit`);
    assert.ok(!ids.has(row.id), `Duplicate product id: ${row.id}`);
    ids.add(row.id);
    assert.ok(Array.isArray(row.ingredients), `Product ${row.id} ingredients must be an array`);
    assert.ok(row.ingredients.every(ingredient => typeof ingredient === 'string' && ingredient.length > 0), `Product ${row.id} has an invalid ingredient identifier`);
    assert.equal(typeof row.ingredientsComplete, 'boolean', `Product ${row.id} must state ingredient completeness`);
    if (row.ingredientsComplete) {
      assert.ok(row.ingredients.length > 0, `Complete product ${row.id} must have an ingredient identifier`);
      completeIngredientProducts += 1;
    } else {
      incompleteIngredientProducts += 1;
    }
    for (const field of ['schedules', 'pharmacodes', 'nzmtIds']) {
      assert.ok(Array.isArray(row[field]), `Product ${row.id} ${field} must be an array`);
      assert.ok(row[field].every(value => typeof value === 'string'), `Product ${row.id} ${field} entries must stay strings`);
    }
  }

  assert.equal(catalogue.stats.productFormulations, catalogue.products.length, 'Stats product count must match rows');
  assert.equal(catalogue.stats.completeIngredientProducts, completeIngredientProducts, 'Stats complete-ingredient count must match explicit row flags');
  assert.equal(catalogue.stats.incompleteIngredientProducts, incompleteIngredientProducts, 'Stats incomplete-ingredient count must match explicit row flags');

  return {
    datasetVersion: catalogue.datasetVersion,
    productFormulations: catalogue.products.length,
    completeIngredientProducts,
    incompleteIngredientProducts,
  };
}

function verifyPinnedSource(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const catalogue = JSON.parse(bytes.toString('utf8'));
  const summary = validateStructure(catalogue);
  assert.equal(summary.datasetVersion, PINNED.datasetVersion, 'Unexpected Pharmac dataset version; review the source snapshot before updating this pin');
  assert.equal(summary.productFormulations, PINNED.productFormulations, 'Unexpected Pharmac product-row count; review the source snapshot before updating this pin');
  assert.equal(summary.completeIngredientProducts, PINNED.stats.completeIngredientProducts, 'Unexpected complete-ingredient count');
  assert.equal(summary.incompleteIngredientProducts, PINNED.stats.incompleteIngredientProducts, 'Unexpected incomplete-ingredient count');
  assert.deepEqual(catalogue.stats, PINNED.stats, 'Pharmac source statistics changed; review the source snapshot before updating this pin');
  assert.deepEqual(catalogue.sources, PINNED.sources, 'Pharmac source metadata changed; review provenance before updating this pin');
  assert.deepEqual(catalogue.licence, PINNED.licence, 'Pharmac licence metadata changed; review provenance before updating this pin');

  const sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(sourceSha256, PINNED.sourceSha256, 'Pharmac catalogue bytes changed; review the source snapshot before updating this pin');
  return { ...summary, sourceSha256 };
}

function expectFailure(fn, pattern, label) {
  assert.throws(fn, pattern, label);
}

const raw = fs.readFileSync(sourcePath);
const catalogue = JSON.parse(raw.toString('utf8'));
const verified = verifyPinnedSource(raw);
const repeated = verifyPinnedSource(raw);
assert.deepEqual(repeated, verified, 'Pinned verification summary must be deterministic');
assert.equal(JSON.stringify(repeated), JSON.stringify(verified), 'Pinned summary property order must be deterministic');

const changedVersion = { ...catalogue, datasetVersion: '2026-10-02-pharmac' };
expectFailure(
  () => verifyPinnedSource(Buffer.from(JSON.stringify(changedVersion))),
  /Unexpected Pharmac dataset version/,
  'Dataset-version drift must fail closed',
);

const changedCount = {
  ...catalogue,
  products: catalogue.products.slice(0, -1),
  stats: {
    ...catalogue.stats,
    productFormulations: catalogue.products.length - 1,
    completeIngredientProducts: catalogue.stats.completeIngredientProducts - (catalogue.products.at(-1).ingredientsComplete ? 1 : 0),
    incompleteIngredientProducts: catalogue.stats.incompleteIngredientProducts - (catalogue.products.at(-1).ingredientsComplete ? 0 : 1),
  },
};
expectFailure(
  () => verifyPinnedSource(Buffer.from(JSON.stringify(changedCount))),
  /Unexpected Pharmac product-row count/,
  'Product-count drift must fail closed',
);

expectFailure(
  () => verifyPinnedSource(Buffer.concat([raw, Buffer.from('\n')])),
  /Pharmac catalogue bytes changed/,
  'Byte-level source drift must fail closed',
);

const incompleteFixture = {
  datasetVersion: 'fixture-v1',
  products: [{
    id: 'fixture-incomplete',
    name: 'Fictional unspecified medicine',
    chemical: 'Fictional ingredient not established',
    formulation: 'Unspecified formulation',
    ingredients: [],
    ingredientsComplete: false,
    market: 'NZ',
    schedules: [],
    pharmacodes: [],
    nzmtIds: [],
  }],
  stats: { productFormulations: 1, completeIngredientProducts: 0, incompleteIngredientProducts: 1 },
};
assert.deepEqual(validateStructure(incompleteFixture), {
  datasetVersion: 'fixture-v1',
  productFormulations: 1,
  completeIngredientProducts: 0,
  incompleteIngredientProducts: 1,
}, 'An incomplete record must remain explicitly incomplete without inferred ingredients');

const falselyCompleteFixture = {
  ...incompleteFixture,
  products: [{ ...incompleteFixture.products[0], ingredientsComplete: true }],
  stats: { productFormulations: 1, completeIngredientProducts: 1, incompleteIngredientProducts: 0 },
};
expectFailure(
  () => validateStructure(falselyCompleteFixture),
  /Complete product fixture-incomplete must have an ingredient identifier/,
  'A complete record must identify at least one ingredient explicitly',
);

console.log(`Pharmac catalogue integrity: ${verified.datasetVersion}, ${verified.productFormulations} rows, SHA-256 ${verified.sourceSha256}; drift and incomplete-record fixtures passed.`);
