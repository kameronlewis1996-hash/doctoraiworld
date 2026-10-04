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

These are terminology records, not 3,419 independently approved treatments. Generic headings include combinations. This is not the full NZULM or all Medsafe-registered/OTC products. A Schedule listing does not establish Medsafe approval, availability, suitability, subsidy eligibility or complete interaction knowledge. NZULM monthly raw-data access is requested from its provider: https://info.nzulm.org.nz/data-access.

Broad ingredient-class coverage and clinician approval are not established by this import. Salt equivalences are explicit; no general salt stripping, substring brand matching or fuzzy automatic selection is used. Different ingredient sets sharing a brand/manufacturer remain ambiguous. Full imported product names are available in name suggestions. Strength suffix matching identifies ingredients only and does not validate the strength or route.

Every result reports limited interaction coverage and `completeForRequest: false`, even if all names match. Existing and newly sourced rules flag potential risks for professional review; they do not provide treatment directions. Source URLs accompany each rule in the seed database. Conditions, dose, timing, route, pregnancy and unlisted interactions remain outside complete coverage.

## Updating and testing

For the planned review updater, source permissions, field coverage, gaps, rollback, and activation proposal, see [NZ medicine catalogue maintenance](nz-medication-maintenance.md).

Download the official **XML** community and hospital schedules for the same effective date. Do not import the Excel reporting views into production. Prefer the staged updater, which checks provenance, validates a generated pair, and prepares a human-readable change report:

```sh
python3 scripts/prepare-pharmac-catalogue.py --effective-date YYYY-MM-01
python3 scripts/verify-pharmac-catalogue-update.py
node scripts/verify-medication-database.cjs
node scripts/verify-local-medication-ui.cjs
node scripts/check-js.js
```

The importer remains available for offline source files and requires `--retrieved-at <UTC-ISO-8601>` as well as optional `--output-dir`. Review ingredient-mapping changes, ambiguity, additions/removals, names, forms, identifiers and counts before committing any generated release. Raw XML is not bundled into the public app; only the reference catalogue and name list are generated.

Name suggestions are filtered in the browser from a public static list. Typing does not send the query to Pharmac, NZULM or DrugBank. The separate provider features retain their original access/licence gates. No provider approval is asserted or enabled by this expansion.

The local safety API rejects invalid, blank and oversized input instead of returning a partial check. It does not cache personal requests. Tests use synthetic medicine lists, never user health records.
