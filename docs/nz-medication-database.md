# DoctorAI NZ medicine catalogue

Release: **2026-10-01-nz-pharmac-v4**.

## Source and licence

Medicine terminology is adapted from **Pharmac | Te Pātaka Whaioranga**, October 2026 community Pharmaceutical Schedule and Hospital Medicines List XML files:

- https://schedule.pharmac.govt.nz/pub/schedule/archive/2026/2026-10-01/Schedule_2026-10-01.xml
- https://schedule.pharmac.govt.nz/pub/HML/archive/2026/2026-10-01/HML_2026-10-01.xml

The source files are licensed **CC BY 4.0**: https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html and https://creativecommons.org/licenses/by/4.0/.

DoctorAI normalises names, excludes devices/special foods, combines duplicate community/hospital product/formulation records, preserves source Pharmacodes/NZMT IDs and Section 29 annotations, and conservatively maps ingredient terms. **Pharmac does not endorse DoctorAI.** Pharmac takes no responsibility for source errors or omissions. Source SHA-256 checksums and the exact effective date are included in `data/medication/nz-pharmac-medicines.json`.

## Coverage

| Measure | Count |
| --- | ---: |
| Product/formulation records | 3,419 |
| Distinct brand names | 1,444 |
| Distinct chemical/generic headings | 1,224 |
| Substance terminology entries (including curated seed) | 1,136 |
| Product/formulations with complete imported ingredient mappings | 3,288 |
| Product/formulations retained with incomplete mappings | 131 |
| Curated interaction rules | 13 |
| Medicine-condition rules | 0 |

These are terminology records, not 3,419 independently approved treatments. Generic headings include combinations. This is not the full NZULM or all Medsafe-registered/OTC products. A Schedule listing does not establish Medsafe approval, availability, suitability, subsidy eligibility or complete interaction knowledge. NZULM data is not part of this local dataset.

Broad ingredient-class coverage and clinician approval are not established by this import. Salt equivalences are explicit; no general salt stripping, substring brand matching or fuzzy automatic selection is used. Different ingredient sets sharing a brand/manufacturer remain ambiguous. Full imported product names are available in name suggestions. A numeric strength is labelled as a catalogue match only when the same numeric strength appears in an indexed formulation. Unlisted or conflicting strengths are marked unverified; no dose, route, timing, or treatment assessment is performed.

Every result reports limited interaction coverage and `completeForRequest: false`, even if all names match. Existing rules are records under ruleset `2026.10.05-r1` with per-record versions, source metadata and concise evidence summaries. All 13 interaction records have a version, review date, named HTTPS source, evidence summary and source-currentness caveat. Seven source pages were fetched during this change; the linked 2017 lithium article was not retrievable, the cited 2016 spironolactone and 2014 simvastatin articles say they may be out of date, and the cited 2023 FDA label says it may not be the latest approved label. Each such caveat is shown with a matching alert. Two allergy class prompts are internally curated, versioned and marked as not externally sourced; there are no condition rules. A source-backed interaction rule is still only a potential flag for professional review; it does not provide treatment directions. Conditions, dose, timing, route, pregnancy and unlisted interactions remain outside complete coverage.

Scanned fields are suggestions and require an explicit comparison with the original label before saving. Ingredient entry is optional; the form shows where to find the active-ingredient list and says to leave it blank and ask a pharmacist when it cannot be read. A checkbox records only the user's statement that the text was copied from the package; it is not clinical validation of the product, ingredients, dose or safety. Only ingredients explicitly checked against the label are sent with a one-time, consented local check. If the checked label terms conflict with the medicine-name mapping or do not map to local terminology, the engine withholds ingredient-based results for that item and reports an unknown state. The local strength comparison is catalogue terminology only, not dosage validation.

Medication safety uses the replaceable `server-src/medication/safety-provider.cjs` interface (interface version 1). The active implementation is `doctorai-local-pharmac-rules`, which delegates to the existing local rules; no remote or paid clinical provider is connected. Provider or entitlement failures return an unavailable error and no partial result. Chat may explain only medication evidence explicitly supplied in the conversation with source attribution; it must not determine interactions. The daily AI briefing does not send saved medication names or label data.

## Updating and testing

For the planned review updater, source permissions, field coverage, gaps, rollback, and activation proposal, see [NZ medicine catalogue maintenance](nz-medication-maintenance.md).

Download the official **XML** community and hospital schedules for the same effective date. Do not import the Excel reporting views into production. Prefer the staged updater, which checks provenance, validates a generated pair, and prepares a human-readable change report:

```sh
python3 scripts/prepare-pharmac-catalogue.py --effective-date YYYY-MM-01
python3 scripts/verify-pharmac-catalogue-update.py
node scripts/verify-medication-database.cjs
node scripts/verify-medication-evidence.cjs
node scripts/verify-medication-pipeline.cjs
node scripts/verify-local-medication-ui.cjs
node scripts/check-js.js
```

The importer remains available for offline source files and requires `--retrieved-at <UTC-ISO-8601>` as well as optional `--output-dir`. Review ingredient-mapping changes, ambiguity, additions/removals, names, forms, identifiers and counts before committing any generated release. Raw XML is not bundled into the public app; only the reference catalogue and name list are generated.

Name suggestions are filtered in the browser from a public static list. Typing does not send the query to Pharmac, NZULM or DrugBank. NZF/NZULM product and interaction checks and DrugBank ingredient-check routes have been retired from the Health Hub. The separate DoctorAI local rules check remains limited and is not equivalent to or as comprehensive as any external catalogue. No provider approval is asserted.

The local safety API rejects invalid, blank and oversized input instead of returning a partial check. It does not cache personal requests. Tests use synthetic medicine lists, never user health records.
