'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ledger = require('./rights-ledger.json');
const release = require('../medication-provenance-exclusions.json');
const seed = require('../../data/medication/medication-safety.seed.json');
const categories = ['interactionRules', 'combinationRules', 'contraindicationRules', 'allergyRules'];
const baseline = [2, 1, 0, 2];
const excluded = [1115, 17, 133, 4];
const seen = new Set();
const reasons = {};

assert.equal(seed.datasetVersion, ledger.datasetVersion);
assert.equal(release.sourceDatasetVersion, ledger.datasetVersion);
for (const [index, category] of categories.entries()) {
  const kept = seed[category];
  const keptLedger = release.retainedRules[category];
  const removed = release.exclusions[category];
  assert.equal(kept.length, baseline[index], `${category}: seed count`);
  assert.equal(keptLedger.length, baseline[index], `${category}: retained ledger count`);
  assert.equal(removed.length, excluded[index], `${category}: exclusion count`);
  assert.equal(ledger.r149.retained[category], baseline[index]);
  assert.equal(ledger.r149.excluded[category], excluded[index]);
  const categoryReasons = {};
  for (const rule of kept) {
    const key = `${category}:${rule.id}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
    const record = keptLedger.find(item => item.id === rule.id);
    assert.ok(record, `missing retained record ${key}`);
    assert.equal(rule.source.rightsBasis, record.basis);
    assert.equal(rule.source.attribution, record.attribution);
    if (rule.source.kind !== 'internal-rule') {
      assert.equal(rule.source.license, 'CC BY 4.0');
      assert.equal(rule.source.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
    }
  }
  for (const rule of removed) {
    const key = `${category}:${rule.id}`;
    assert.ok(!seen.has(key), `duplicate or retained excluded ID ${key}`);
    seen.add(key);
    reasons[rule.reason] = (reasons[rule.reason] || 0) + 1;
    categoryReasons[rule.reason] = (categoryReasons[rule.reason] || 0) + 1;
  }
  assert.deepEqual(categoryReasons, ledger.r149.excludedByCategoryAndRightsGap[category]);
}
assert.equal(seen.size, 1274);
assert.equal(ledger.r149.retained.total, 5);
assert.equal(ledger.r149.excluded.total, 1269);
assert.deepEqual(reasons, ledger.r149.excludedByRightsGap);
assert.equal(ledger.r149.sourceGroups.reduce((n, row) => n + row.retained, 0), 5);
assert.equal(ledger.r149.sourceGroups.reduce((n, row) => n + row.excluded, 0), 1269);
for (const row of ledger.r149.sourceGroups.filter(row => row.ruleIds)) {
  for (const id of row.ruleIds) assert.ok(categories.some(category => seed[category].some(rule => rule.id === id)), `unknown source-group rule ${id}`);
}

const wrapper = fs.readFileSync(path.join(root, 'server-src/health/alerts-engine.cjs'), 'utf8');
const nhsSourceRows = [...wrapper.matchAll(/\b\w+: source\('(?:NHS|NHS Specialist Pharmacy Service)'/g)];
assert.equal(nhsSourceRows.length, ledger.nhsWrapper.sourceReferences);
for (const id of ledger.nhsWrapper.promptIdsUsingNhsSources.slice(0, 7)) {
  assert.ok(wrapper.includes(`ruleId: '${id}'`), `missing wrapper prompt ${id}`);
}
assert.match(wrapper, /alert\.ruleId === 'penicillin-class'[\s\S]*?sources\.amoxicillinAllergy/);
assert.match(wrapper, /alert\.ruleId === 'nsaid-class'[\s\S]*?sources\.nsaidAllergy/);
assert.equal(ledger.nhsWrapper.promptIdsUsingNhsSources.length, 9);
assert.match(wrapper, /The page review was due 8 August 2026/);
assert.equal(ledger.nhsWrapper.chestPainSourceReviewDue, '2026-08-08');
console.log('r149 rights inventory verified: 5 retained, 1,269 excluded, 8 NHS/SPS sources, 9 wrapper prompt IDs.');
