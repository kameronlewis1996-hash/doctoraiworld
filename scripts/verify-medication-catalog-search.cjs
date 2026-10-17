'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const search = require('../medicine-catalog-search.js');
const snapshot = require('../data/medication/nz-pharmac-medicines.json');
const lookupPage = fs.readFileSync(path.join(__dirname, '..', 'medication-list-template.js'), 'utf8');

let catalogue;
async function loadedCatalogue() {
  if (!catalogue) {
    const originalFetch = global.fetch;
    try {
      global.fetch = async url => {
        assert.match(url, /^\/data\/medication\/nz-pharmac-medicines\.json\?/);
        return { ok: true, json: async () => snapshot };
      };
      catalogue = await search.load();
    } finally {
      global.fetch = originalFetch;
    }
  }
  return catalogue;
}

const ids = results => results.matches.map(record => record.product.id);
const names = results => results.matches.map(record => record.product.name);

class TestElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.hidden = false;
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  async dispatch(type) {
    await Promise.all((this.listeners.get(type) || []).map(callback => callback({ preventDefault() {} })));
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  focus() {}
  requestSubmit() {
    this.currentSubmission = this.dispatch('submit');
    return this.currentSubmission;
  }
}

function createLookup(catalogueForPage, load = () => Promise.resolve(catalogueForPage)) {
  const elements = new Map([
    ['medicine-name-search', new TestElement('form')],
    ['medicine-name-query', new TestElement('input')],
    ['medicine-name-search-status', new TestElement('p')],
    ['medicine-name-search-results', new TestElement('ul')],
    ['medicine-name-search-more', new TestElement('button')]
  ]);
  const ready = [];
  const document = {
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') ready.push(callback); },
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) { return new TestElement(tag); }
  };
  const window = { DoctorAIMedicineCatalogSearch: { ...search, load } };
  vm.runInNewContext(lookupPage, { document, window }, { filename: 'medication-list-template.js' });
  ready.forEach(callback => callback());
  const [form, input, status, results, more] = [
    'medicine-name-search', 'medicine-name-query', 'medicine-name-search-status',
    'medicine-name-search-results', 'medicine-name-search-more'
  ].map(id => elements.get(id));
  return {
    input, status, results, more, form,
    async submit(query) { input.value = query; await form.requestSubmit(); },
    async nextPage() { assert.equal(more.hidden, false); await more.dispatch('click'); await form.currentSubmission; },
    renderedNames() { return results.children.map(item => item.children.find(child => child.tagName === 'H3').textContent); }
  };
}

test('all catalogue matches remain reachable in stable, unique pagination prefixes', async () => {
  const data = await loadedCatalogue();
  assert.equal(data.products.length, 3419, 'the bundled Pharmac snapshot should remain the known test denominator');
  const first = search.search(data, 'mg', 20);
  const second = search.search(data, 'mg', 40);
  const all = search.search(data, 'mg', data.products.length);
  assert.ok(all.totalMatches > 40);
  assert.equal(all.matches.length, all.totalMatches);
  assert.deepEqual(ids(first), ids(second).slice(0, 20));
  assert.deepEqual(ids(second), ids(all).slice(0, 40));
  assert.equal(new Set(ids(all)).size, all.totalMatches, 'no matching formulation is duplicated');
  assert.deepEqual(search.search(data, 'zzzxq', 20), { matches: [], totalMatches: 0 });
});

test('unit spellings are equivalent without conflating clinically different strengths or forms', async () => {
  const data = await loadedCatalogue();
  const find = query => search.search(data, query, data.products.length);
  const ramipril5mg = ['pharmac-158af66cc87eca0b', 'pharmac-085972cd00a81861'];
  assert.deepEqual(new Set(ids(find('ramipril 5 mg'))), new Set(ramipril5mg));
  assert.deepEqual(ids(find('ramipril 5 milligrams')), ids(find('ramipril 5 mg')));
  assert.deepEqual(ids(find('ramipril tab 5 mg')), ['pharmac-158af66cc87eca0b']);
  assert.deepEqual(ids(find('ramipril cap 5 mg')), ['pharmac-085972cd00a81861']);
  assert.deepEqual(new Set(ids(find('fluconazole 50 mg'))), new Set([
    'pharmac-1978be4d2d659605', 'pharmac-86e104128054c3a8'
  ]), '50 mg must not match 150 mg');
  assert.deepEqual(ids(find('fluconazole cap 50 mg')), ['pharmac-86e104128054c3a8']);
  assert.deepEqual(ids(find('fentanyl 5 mcg')), [], '5 mcg must not match 25 or 75 mcg');
  assert.deepEqual(ids(find('amoxicillin 5 mg 5 ml')), [], '5 mg must not match 125 mg per 5 ml');
  assert.deepEqual(ids(find('fentanyl 50 micrograms')), ids(find('fentanyl 50 µg')));
  assert.deepEqual(ids(find('amoxicillin 5 millilitres')), ids(find('amoxicillin 5 ml')));
  assert.equal(search.normalise('5 grams'), search.normalise('5 g'));
  assert.notEqual(search.normalise('5 mg'), search.normalise('5000 mcg'), 'search must not infer dose equivalence');
});

test('ingredient aliases and partial name searches remain available', async () => {
  const data = await loadedCatalogue();
  const aliasMatches = search.search(data, 'acetaminophen', data.products.length);
  assert.ok(aliasMatches.totalMatches > 0);
  assert.ok(aliasMatches.matches.every(record => record.ingredientRecords.some(ingredient => ingredient.aliases?.includes('acetaminophen'))));
  assert.ok(search.search(data, 'ramipr', 20).totalMatches >= 8);
});

test('the lookup reaches exact 20, 21, 40 and 41-result boundaries, then hides Show more', async () => {
  const data = await loadedCatalogue();
  const uniqueNames = new Set();
  const pool = data.products.filter(record => {
    if (!record.searchText.includes('nz') || uniqueNames.has(record.product.name)) return false;
    uniqueNames.add(record.product.name);
    return true;
  }).slice(0, 41);
  assert.equal(pool.length, 41);
  const pagesByCount = new Map([[0, [0]], [20, [20]], [21, [20, 21]], [40, [20, 40]], [41, [20, 40, 41]]]);
  for (const [count, pageCounts] of pagesByCount) {
    const subset = { products: pool.slice(0, count) };
    const lookup = createLookup(subset);
    await lookup.submit('nz');
    const expected = names(search.search(subset, 'nz', Math.max(count, 1)));
    assert.equal(lookup.renderedNames().length, pageCounts[0], `${count}: first page`);
    for (const expectedLength of pageCounts.slice(1)) {
      assert.equal(lookup.more.hidden, false, `${count}: another page is available`);
      await lookup.nextPage();
      assert.equal(lookup.renderedNames().length, expectedLength, `${count}: next page boundary`);
    }
    assert.equal(lookup.more.hidden, true, `${count}: no button after final page`);
    assert.deepEqual(lookup.renderedNames(), expected, `${count}: every match appears once and in order`);
    assert.equal(new Set(lookup.renderedNames()).size, count, `${count}: no duplicate rendered result`);
    assert.match(lookup.status.textContent, count ? /Showing all/ : /No matching product/);
  }
});

test('a new query resets pagination and empty searches hide Show more', async () => {
  const data = await loadedCatalogue();
  const subset = { products: data.products.filter(record => record.searchText.includes('nz')).slice(0, 41) };
  const lookup = createLookup(subset);
  await lookup.submit('nz');
  await lookup.nextPage();
  assert.equal(lookup.renderedNames().length, 40);
  await lookup.submit('zzzxq');
  assert.equal(lookup.renderedNames().length, 0);
  assert.equal(lookup.more.hidden, true);
  await lookup.submit('nz');
  assert.equal(lookup.renderedNames().length, 20, 'new searches begin at the first page');
});

test('a late catalogue response cannot overwrite a newer search', async () => {
  const data = await loadedCatalogue();
  const subset = { products: data.products.filter(record => record.searchText.includes('nz')).slice(0, 21) };
  const pending = [];
  const lookup = createLookup(subset, () => new Promise(resolve => pending.push(resolve)));
  const oldSearch = lookup.submit('nz');
  const latestSearch = lookup.submit('zzzxq');
  assert.equal(pending.length, 2);
  pending[1](subset);
  await latestSearch;
  pending[0](subset);
  await oldSearch;
  assert.equal(lookup.renderedNames().length, 0);
  assert.equal(lookup.more.hidden, true);
  assert.match(lookup.status.textContent, /No matching product/);
});
