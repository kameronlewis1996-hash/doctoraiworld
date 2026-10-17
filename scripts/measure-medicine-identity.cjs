'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sourceRoute } = require('../server-src/medication/identity-catalogue.cjs');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'data/medication/nz-pharmac-medicines.json');
const destination = path.join(root, 'docs/medicine-identity-coverage-20261016.md');
const raw = fs.readFileSync(source);
const catalogue = JSON.parse(raw);
const rows = catalogue.products;
const count = predicate => rows.filter(predicate).length;
const exactKey = row => [row.brand, row.chemical, row.formulation].map(value => value.trim().toLowerCase()).join('|');
const uniqueKeys = new Set(rows.map(exactKey));
assert.equal(rows.length, catalogue.stats.productFormulations);
assert.equal(uniqueKeys.size, rows.length, 'Duplicate source product tuple');
const complete = count(row => row.ingredientsComplete);
const incomplete = rows.length - complete;
const brand = count(row => !!row.brand);
const combination = count(row => row.ingredients.length > 1);
const combinationComplete = count(row => row.ingredients.length > 1 && row.ingredientsComplete);
const strengthText = count(row => /\d/.test(row.formulation));
const routeExplicit = count(row => !!sourceRoute(row.formulation).value);
const routeAbsent = rows.length - routeExplicit;
const byBrandForm = new Map();
for (const row of rows) {
  if (!row.brand) continue;
  const key = `${row.brand.toLowerCase()}|${row.formulation.toLowerCase()}`;
  byBrandForm.set(key, (byBrandForm.get(key) || 0) + 1);
}
const brandFormUnique = [...byBrandForm.values()].filter(value => value === 1).length;
const brandFormAmbiguous = [...byBrandForm.values()].filter(value => value > 1).length;
const routeTagged = count(row => !!row.interactionRoute);
const lines = [
  '# Medicine identity coverage ledger - 16 October 2026',
  '',
  `Frozen denominator: **${rows.length.toLocaleString('en-NZ')}** formulation records in \`data/medication/nz-pharmac-medicines.json\`, dataset \`${catalogue.datasetVersion}\`, SHA-256 \`${crypto.createHash('sha256').update(raw).digest('hex')}\`. Sources: [Pharmac community Schedule](${catalogue.sources[0].url}) and [Hospital Medicines List](${catalogue.sources[1].url}), both effective ${catalogue.sources[0].effectiveDate}. [Archive rights notice](${catalogue.licence.source}): ${catalogue.licence.name}; the catalogue retains Pharmac attribution and non-endorsement. This denominator is the bundled source subset, not all New Zealand or retail products.`,
  '',
  '| Source-record property | Numerator / denominator | Gap / interpretation |',
  '| --- | ---: | --- |',
  `| Exact brand label present | ${brand} / ${rows.length} | ${rows.length - brand} generic/unbranded source rows |`,
  `| Complete mapped ingredient list flag | ${complete} / ${rows.length} | ${incomplete} explicitly incomplete; this is importer metadata, not independent label verification |`,
  `| Multiple mapped ingredients | ${combination} / ${rows.length} | ${combinationComplete} of those ${combination} marked complete; per-ingredient strength is not structured |`,
  `| Formulation text contains a numeral | ${strengthText} / ${rows.length} | ${rows.length - strengthText} without a numeral; a numeral alone is not a verified strength |`,
  `| Route explicitly named in formulation text | ${routeExplicit} / ${rows.length} | ${routeAbsent} have no single explicit route token under the conservative extractor |`,
  `| Existing interaction-route tag | ${routeTagged} / ${rows.length} | This is safety-rule scope metadata, not administration-route evidence |`,
  `| Unique brand + formulation text | ${brandFormUnique} / ${brand} branded rows | ${brandFormAmbiguous} brand + form strings refer to more than one source row; include chemical or exact source ID |`,
  `| Unique brand + chemical + formulation text | ${uniqueKeys.size} / ${rows.length} | An exact tuple identifies a source row, not a current shelf pack |`,
  '',
  'The identity resolver requires NZ region and either an exact source identifier or the complete brand + chemical + formulation tuple. Unbranded/generic products require a source identifier. It intersects all supplied facts and returns explicit unknown, incomplete, conflicting or ambiguous states. It never resolves an ingredient from a bare generic or brand name, formulation alone, suggestion, image or OCR text. A matched source row still reports ingredient completeness and route evidence separately; an unknown route is not upgraded from a tablet name or the interaction-route tag. Form and strength remain the exact source formulation statement because splitting combination strengths without a checked ingredient-to-strength map would overstate precision.',
  '',
  '## Shelf, OTC and pack gaps',
  '',
  'There is **no defensible denominator** for all New Zealand shelf/OTC medicines, supplements or current stocked packs in these files. Numerator and percentage for those markets are **not measurable**. An unmatched shelf name is unknown; a similar ingredient or brand is not a product match. The separate PR79 draft (`fbfc20b`) adds 3,590 traceable Pharmac source pack-to-formulation rows, not a retail inventory. A dry run of this resolver against its 3,380 distinct Pharmacodes returned 3,189 single-formulation source matches and 191 ambiguous codes. The source rows remain a separate draft and this resolver accepts that pack snapshot only when explicitly passed with the matching dataset version; the production bundle remains unchanged.',
  '',
  '## Integration contract',
  '',
  'Call `createIdentityCatalogue(medicines, optionalPacks).resolve({region: "NZ", productId | nzmtId | pharmacode | (brand + chemical + formulation), route})` from a future identity-review boundary. Brand and chemical are exact filters, not aliases. A source ID or the complete branded tuple is mandatory, and every supplied field must agree on one record. Pass a pack catalogue only after its source snapshot and rights are approved. Treat `status: "matched"` as a terminology match only; inspect `ingredientStatus`, `route.value`, `strengthState` and `assessment` separately. Do not feed this object into active safety rules without a separately reviewed mapping and clinical gate.',
  '',
  'No clinical interaction, dose, contraindication, substitution, approval or stock conclusion follows from any identity result. Rule set r149 and the 1,269 excluded source-derived rules are unchanged. Further coverage needs a rights-cleared product source with a defined market denominator, pack/region reconciliation, ingredient and per-component strength review, and route verification.',
  '',
  'The bundled Pharmac catalogue is pinned to its version, source digests, licence metadata, and 3,419-row denominator by `node scripts/verify-pharmac-catalogue-integrity.cjs`. A changed snapshot fails closed and requires an explicitly reviewed pin update; incomplete ingredient and route facts are not inferred. Rebuild with `node scripts/measure-medicine-identity.cjs --write`; verify the committed ledger with `node scripts/measure-medicine-identity.cjs --check`.',
  '',
].join('\n');
if (process.argv.includes('--write')) fs.writeFileSync(destination, lines);
else if (process.argv.includes('--check')) assert.equal(fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n'), lines);
else process.stdout.write(lines);
