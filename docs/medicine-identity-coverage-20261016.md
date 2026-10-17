# Medicine identity coverage ledger - 16 October 2026

Frozen denominator: **3,419** formulation records in `data/medication/nz-pharmac-medicines.json`, dataset `2026-10-01-pharmac`, SHA-256 `02c154e4b712ea0a5f76b8a396c2bf65060d345f564f72457a1aa45e898dbc9b`. Sources: [Pharmac community Schedule](https://schedule.pharmac.govt.nz/pub/schedule/archive/2026/2026-10-01/Schedule_2026-10-01.xml) and [Hospital Medicines List](https://schedule.pharmac.govt.nz/pub/HML/archive/2026/2026-10-01/HML_2026-10-01.xml), both effective 2026-10-01. [Archive rights notice](https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html): CC BY 4.0; the catalogue retains Pharmac attribution and non-endorsement. This denominator is the bundled source subset, not all New Zealand or retail products.

| Source-record property | Numerator / denominator | Gap / interpretation |
| --- | ---: | --- |
| Exact brand label present | 2596 / 3419 | 823 generic/unbranded source rows |
| Complete mapped ingredient list flag | 3306 / 3419 | 113 explicitly incomplete; this is importer metadata, not independent label verification |
| Multiple mapped ingredients | 342 / 3419 | 318 of those 342 marked complete; per-ingredient strength is not structured |
| Formulation text contains a numeral | 3293 / 3419 | 126 without a numeral; a numeral alone is not a verified strength |
| Route explicitly named in formulation text | 428 / 3419 | 2991 have no single explicit route token under the conservative extractor |
| Existing interaction-route tag | 1470 / 3419 | This is safety-rule scope metadata, not administration-route evidence |
| Unique brand + formulation text | 2464 / 2596 branded rows | 45 brand + form strings refer to more than one source row; include chemical or exact source ID |
| Unique brand + chemical + formulation text | 3419 / 3419 | An exact tuple identifies a source row, not a current shelf pack |

## Search coverage

The public medication-list lookup and Health Hub medication-name suggestions now use these 3,419 records. They match brand, chemical name, mapped ingredient names and aliases, formulation/strength text, Pharmac codes, NZMT identifiers and schedule labels. The medication-list lookup displays the catalogue’s mapped ingredient names and labels incomplete mappings; it does not infer missing ingredients. Search is terminology assistance only and does not resolve identity or activate an interaction rule.

The identity resolver requires NZ region and either an exact source identifier or the complete brand + chemical + formulation tuple. Unbranded/generic products require a source identifier. It intersects all supplied facts and returns explicit unknown, incomplete, conflicting or ambiguous states. It never resolves an ingredient from a bare generic or brand name, formulation alone, suggestion, image or OCR text. A matched source row still reports ingredient completeness and route evidence separately; an unknown route is not upgraded from a tablet name or the interaction-route tag. Form and strength remain the exact source formulation statement because splitting combination strengths without a checked ingredient-to-strength map would overstate precision.

## Shelf, OTC and pack gaps

There is **no defensible denominator** for all New Zealand shelf/OTC medicines, supplements or current stocked packs in these files. Numerator and percentage for those markets are **not measurable**. An unmatched shelf name is unknown; a similar ingredient or brand is not a product match. The separate PR79 draft (`fbfc20b`) adds 3,590 traceable Pharmac source pack-to-formulation rows, not a retail inventory. A dry run of this resolver against its 3,380 distinct Pharmacodes returned 3,189 single-formulation source matches and 191 ambiguous codes. The source rows remain a separate draft and this resolver accepts that pack snapshot only when explicitly passed with the matching dataset version; the production bundle remains unchanged.

## Integration contract

Call `createIdentityCatalogue(medicines, optionalPacks).resolve({region: "NZ", productId | nzmtId | pharmacode | (brand + chemical + formulation), route})` from a future identity-review boundary. Brand and chemical are exact filters, not aliases. A source ID or the complete branded tuple is mandatory, and every supplied field must agree on one record. Pass a pack catalogue only after its source snapshot and rights are approved. Treat `status: "matched"` as a terminology match only; inspect `ingredientStatus`, `route.value`, `strengthState` and `assessment` separately. Do not feed this object into active safety rules without a separately reviewed mapping and clinical gate.

No clinical interaction, dose, contraindication, substitution, approval or stock conclusion follows from any identity result. Rule set r149 and the 1,269 excluded source-derived rules are unchanged. Further coverage needs a rights-cleared product source with a defined market denominator, pack/region reconciliation, ingredient and per-component strength review, and route verification.

The bundled Pharmac catalogue is pinned to its version, source digests, licence metadata, and 3,419-row denominator by `node scripts/verify-pharmac-catalogue-integrity.cjs`. A changed snapshot fails closed and requires an explicitly reviewed pin update; incomplete ingredient and route facts are not inferred. Rebuild with `node scripts/measure-medicine-identity.cjs --write`; verify the committed ledger with `node scripts/measure-medicine-identity.cjs --check`.
