'use strict';

const assert = require('node:assert/strict');
const { createIdentityCatalogue, sourceRoute } = require('../server-src/medication/identity-catalogue.cjs');
const source = require('../data/medication/nz-pharmac-medicines.json');
const identity = createIdentityCatalogue(source);
const resolve = query => identity.resolve({ region: 'NZ', ...query });

assert.equal(resolve({ brand: 'Voltaren' }).status, 'incomplete');
assert.equal(resolve({ chemical: 'Ibuprofen' }).status, 'incomplete');
assert.equal(resolve({ brand: 'Acidex', formulation: 'Oral liq 500 mg with sodium bicarbonate 267 mg and calcium carbonate 160 mg per 10 ml' }).status, 'ambiguous');
assert.equal(resolve({ brand: 'Nurofen Cold & Flu', formulation: 'Tab 200 mg' }).status, 'unknown');
assert.equal(resolve({ brand: 'Voltaren Emulgel', formulation: 'Gel 1%' }).status, 'unknown');
assert.equal(identity.resolve({ brand: 'Voltaren', formulation: 'Suppos 100 mg' }).status, 'incomplete');
assert.equal(identity.resolve({ region: 'AU', brand: 'Voltaren', formulation: 'Suppos 100 mg' }).status, 'unknown');
const voltaren = resolve({ brand: 'Voltaren', chemical: 'Diclofenac sodium', formulation: 'Suppos 100 mg' });
assert.equal(voltaren.status, 'matched');
assert.equal(voltaren.route.value, null);
assert.equal(voltaren.assessment, 'identity-only');
assert.equal(resolve({ productId: voltaren.productId, chemical: 'Ibuprofen' }).status, 'conflicting');
assert.equal(resolve({ productId: voltaren.productId, route: 'oral' }).status, 'incomplete');
const acidex = source.products.find(row => row.brand === 'Acidex' && row.chemical.includes(' with '));
const combination = resolve({ productId: acidex.id });
assert.equal(combination.status, 'matched');
assert.equal(combination.ingredientStatus, 'complete-in-catalogue');
assert.equal(combination.ingredients.length, 3);
assert.equal(combination.route.value, 'oral');
assert.equal(resolve({ productId: acidex.id, route: 'eye' }).status, 'conflicting');
assert.equal(sourceRoute('Eye drops and ear drops 1%').value, null);

const incomplete = source.products.find(row => !row.ingredientsComplete);
assert.equal(resolve({ productId: incomplete.id }).ingredientStatus, 'incomplete-in-catalogue');
const synthetic = {
  ...source, datasetVersion: 'fictional-test',
  products: [
    { id: 'a', brand: 'Fictional Dual', chemical: 'Fictional salt with second compound', formulation: 'Oral liquid 1 mg with second compound 2 mg', ingredients: ['one', 'two'], ingredientsComplete: true, market: 'NZ', pharmacodes: ['111'], nzmtIds: ['900'] },
    { id: 'b', brand: 'Fictional Dual', chemical: 'Fictional salt', formulation: 'Eye drops 1%', ingredients: ['one'], ingredientsComplete: false, market: 'NZ', pharmacodes: ['111'], nzmtIds: ['901'] },
  ],
  ingredients: [{ id: 'one', name: 'Fictional salt' }, { id: 'two', name: 'Second compound' }],
};
const packs = { datasetVersion: 'fictional-test', sources: synthetic.sources, licence: synthetic.licence, packs: [
  { productId: 'a', pharmacode: '111', nzmtId: '900' },
  { productId: 'b', pharmacode: '111', nzmtId: '901' },
] };
const fictional = createIdentityCatalogue(synthetic, packs);
assert.equal(fictional.resolve({ region: 'NZ', pharmacode: '111' }).status, 'ambiguous');
assert.equal(fictional.resolve({ region: 'NZ', pharmacode: '111', nzmtId: '901' }).productId, 'b');
assert.equal(fictional.resolve({ region: 'NZ', brand: 'Fictional Dual', formulation: 'Eye drops 1%' }).route.value, 'eye');
assert.equal(fictional.resolve({ region: 'NZ', brand: 'Fictional Dual', formulation: 'Eye drops 1%' }).ingredientStatus, 'incomplete-in-catalogue');
assert.throws(() => createIdentityCatalogue(synthetic, { datasetVersion: 'different', packs: [] }));
console.log('Medicine identity catalogue: exact matching, ambiguity, conflicts, route and ingredient gaps verified.');
