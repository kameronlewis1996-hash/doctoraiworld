'use strict';

// Measure only the licensed source snapshot. No retailer stock or interaction
// coverage is inferred from these counts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const medicines = require('../data/medication/nz-pharmac-medicines.json');
const catalogue = require('../data/medication/nz-pharmac-packs.json');
const outputPath = path.join(root, 'docs/pharmacy-source-coverage-20261016.md');

assert.equal(catalogue.datasetVersion, medicines.datasetVersion);
assert.deepEqual(catalogue.sources, medicines.sources);
assert.deepEqual(catalogue.licence, medicines.licence);
const products = new Map(medicines.products.map(product => [product.id, product]));
assert.equal(products.size, medicines.products.length);
const seen = new Set();
for (const pack of catalogue.packs) {
  assert.ok(products.has(pack.productId), `Missing formulation ${pack.productId}`);
  assert.ok(/^\d+$/.test(pack.pharmacode));
  assert.ok(/^\d+(?:\.\d+)?$/.test(pack.sourceQuantity));
  assert.ok(pack.sourceUnit && pack.sourceCategory && pack.sourceSubcategory);
  assert.ok(pack.schedules.length && pack.schedules.every(value => ['Schedule', 'HML'].includes(value)));
  const key = [pack.productId, pack.pharmacode, pack.nzmtId, pack.sourceQuantity, pack.sourceUnit].join('|');
  assert.ok(!seen.has(key), `Duplicate source pack ${key}`);
  seen.add(key);
}
assert.equal(catalogue.packs.length, catalogue.stats.packRecords);
const community = catalogue.packs.filter(pack => pack.schedules.includes('Schedule'));
assert.equal(community.length, catalogue.stats.communityPackRecords);
assert.equal(catalogue.packs.filter(pack => pack.schedules.includes('HML')).length, catalogue.stats.hospitalPackRecords);
assert.equal(catalogue.packs.filter(pack => pack.sourceQuantity === '0').length, catalogue.stats.zeroSourceQuantity);
assert.equal(community.filter(pack => pack.sourceQuantity === '0').length, 0);

const groups = [
  ['Pain-related source categories', pack => ['Analgesics', 'Non-Steroidal Anti-Inflammatory Drugs', 'Antimigraine Preparations'].includes(pack.sourceSubcategory)],
  ['Allergy-related source categories', pack => ['Antihistamines', 'Antiallergy Preparations', 'Nasal Preparations'].includes(pack.sourceSubcategory)],
  ['Digestive-health source categories', pack => ['Antacids and Antiflatulents', 'Antidiarrhoeals', 'Antiulcerants', 'Laxatives'].includes(pack.sourceSubcategory)],
  ['Skin/topical source category', pack => pack.sourceCategory === 'Dermatologicals'],
  ['Nasal, throat and mucolytic categories', pack => ['Mucolytics', 'Nasal Preparations', 'Mouth and Throat'].includes(pack.sourceSubcategory)],
  ['Funded vitamin/mineral categories', pack => ['Vitamins', 'Minerals'].includes(pack.sourceSubcategory)],
];
function summary(rows) {
  const productIds = new Set(rows.map(row => row.productId));
  return {
    packs: rows.length,
    formulations: productIds.size,
    brands: new Set([...productIds].map(id => products.get(id).brand).filter(Boolean)).size,
  };
}
const categoryRows = groups.map(([name, matches]) => [name, summary(community.filter(matches))]);
const byPharmacode = new Map();
for (const pack of catalogue.packs) {
  if (!byPharmacode.has(pack.pharmacode)) byPharmacode.set(pack.pharmacode, new Set());
  byPharmacode.get(pack.pharmacode).add(pack.productId);
}
const crossFormulationCodes = [...byPharmacode.values()].filter(ids => ids.size > 1).length;
const date = catalogue.sources[0].effectiveDate;
const lines = [
  `# Pharmac pack source coverage — ${date}`,
  '',
  `Rebuild: \`node scripts/measure-pharmacy-coverage.cjs --write\`. Check: \`node scripts/measure-pharmacy-coverage.cjs --check\`. These counts come solely from the ${date} [community Pharmaceutical Schedule](${catalogue.sources[0].url}) and [Hospital Medicines List](${catalogue.sources[1].url}) XML. The [Pharmac archive notice](${catalogue.licence.source}) licenses this source under CC BY 4.0. DoctorAI normalises the names and does not claim Pharmac endorsement.`,
  '',
  `The existing medicine catalogue contains **${medicines.stats.productFormulations.toLocaleString('en-NZ')} formulations**. The new pack catalogue preserves **${catalogue.stats.packRecords.toLocaleString('en-NZ')} distinct source pack-to-formulation rows**, including **${catalogue.stats.communityPackRecords.toLocaleString('en-NZ')} community Schedule rows** and **${catalogue.stats.hospitalPackRecords.toLocaleString('en-NZ')} HML rows**; ${catalogue.stats.bothSchedules.toLocaleString('en-NZ')} rows occur in both. The importer excludes ${catalogue.stats.excludedNonMedicinePackRows} device/special-food pack occurrences already outside the medicine catalogue. Rows are source listings, not independently verified products on sale. ${catalogue.stats.zeroSourceQuantity.toLocaleString('en-NZ')} HML rows have source quantity \`0\`, so that number must never be shown as a pack size.`,
  '',
  '| Source-based group | Community pack rows | Distinct formulations | Brands |',
  '| --- | ---: | ---: | ---: |',
  ...categoryRows.map(([name, value]) => `| ${name} | ${value.packs} | ${value.formulations} | ${value.brands} |`),
  '',
  'Groups are defined by the exact Pharmac category/subcategory labels in the measurement script and may overlap. They do not measure the number of products in New Zealand pharmacies. The nasal/throat/mucolytic row is **not** a measure of branded multi-ingredient cold/flu products. Funded vitamin/mineral formulations are medicines in this source, **not** a retail supplements catalogue.',
  '',
  '## Identity and safety boundary',
  '',
  `The pack file records Pharmacode, NZMT CTPP ID when present, source quantity and formulation unit, and the linked formulation ID. **${crossFormulationCodes} Pharmacodes** point to more than one formulation row across the two source schedules. A Pharmacode alone must not silently choose one formulation; schedule and formulation need reconciliation before product-level matching. No pack row has been added as an active interaction rule or used to declare a medicine safe. The browser safety bundle still uses the existing formulation catalogue.`,
  '',
  'Neither Pharmac schedule is an exhaustive retail catalogue. The [NZULM data-access page](https://info.nzulm.org.nz/data-access) offers a broader monthly dataset on request, with its actual licence supplied with the files; [NZULM FHIR access](https://build.fhir.org/ig/HL7NZ/nzf/howtouse.html) requires onboarding. This project has neither that dataset nor permission/accreditation for production API use. [Medsafe product search](https://www.medsafe.govt.nz/DBSearch/) can be checked individually; [Medsafe product information](https://www.medsafe.govt.nz/DbSearch/InfoSearch) says commercial reuse of sponsor data sheets/consumer information requires sponsor permission. No bulk Medsafe or retailer content was copied.',
  '',
  'Outstanding coverage: non-funded shelf medicines, branded variants that differ from Schedule names, and retail vitamins/supplements have no verified complete source or denominator here. Their identity and interactions must remain unknown/unassessed until a licensed dataset is obtained and checked. The separate [eight-listing shelf sample](pharmacy-shelf-coverage-20261016.md) records observed mismatches, not market coverage.',
  '',
];
const report = lines.join('\n');
if (process.argv.includes('--write')) {
  fs.writeFileSync(outputPath, report, 'utf8');
  console.log(`Wrote ${path.relative(root, outputPath)}: ${catalogue.stats.packRecords} pack rows, ${crossFormulationCodes} shared Pharmacodes.`);
} else if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(outputPath, 'utf8'), report, 'Coverage report is stale; run with --write');
  console.log(`Pharmac source coverage verified: ${catalogue.stats.packRecords} pack rows, ${crossFormulationCodes} shared Pharmacodes.`);
} else {
  console.log(report);
}
