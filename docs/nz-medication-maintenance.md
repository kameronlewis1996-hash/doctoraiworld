# NZ medicine catalogue maintenance: source and review proposal

**Prepared:** 2026-10-04 UTC  
**Current catalogue release:** `2026-10-01-pharmac` (source effective date 2026-10-01)  
**Scope:** reference terminology only. This proposal does not authorize a production update, deployment, provider change, or recurring workflow.

## Existing content and behavior

The repository already ships a generated Pharmac-derived reference catalogue at `data/medication/nz-pharmac-medicines.json` and a browser suggestion index at `data/medication/nz-medicine-names.json`. `scripts/import-pharmac-medicines.py` combines community Pharmaceutical Schedule and Hospital Medicines List XML with the curated terminology seed at `data/medication/medication-safety.seed.json`. The safety engine resolves a name only when its exact candidates agree on one complete ingredient set. It refuses incomplete and ambiguous product mappings rather than choosing a partial ingredient set.

Current release inventory:

| Measure | Existing value | What it describes |
| --- | ---: | --- |
| Product/formulation rows | 3,419 | Distinct normalized brand/chemical/form combinations from two schedules |
| Distinct brand names | 1,444 | Non-empty schedule brand labels |
| Distinct chemical/generic headings | 1,224 | Source chemical headings, including combinations |
| Ingredient terminology terms | 1,136 | Curated and source-derived normalized terms |
| Rows marked ingredient-mapped | 3,288 | Mapping algorithm returned a non-empty complete set; this is not clinical validation |
| Rows retained with incomplete mapping | 131 | Explicitly fail closed in product resolution |
| Curated interaction rules | 13 | A limited set of potential interaction flags with source references |
| Curated allergy-class rules | 2 | Penicillin-class and NSAID-class flags, plus exact ingredient-name matching |
| Medicine-condition rules | 0 | Condition risks are not covered |

The checked-in release already records its effective date, both source URLs, and input checksums, but it does not record the original fetch timestamp. The preparation importer does not invent that historical value; future generated releases carry an actual UTC retrieval timestamp.

The 13 interaction rules cover warfarin/NSAIDs, PDE5 inhibitors/nitrates, SSRI/MAOI, methotrexate/co-trimoxazole, lithium with NSAIDs/ACE inhibitors/ARBs/thiazides, spironolactone with ACE inhibitors/ARBs, simvastatin with selected interacting inhibitors, and serotonergic opioids with antidepressants/MAOIs. These are existing narrow flags, not complete interaction screening. Duplicate-ingredient flags only work when each medicine resolves to a complete ingredient list. Allergy flags compare a resolved ingredient with a recorded exact ingredient term or the two curated classes; an absent flag does not rule out allergy.

Even when every name resolves, current behavior explicitly returns limited interaction coverage and says “no known alert” does not mean safe. It does not establish dose, timing, route, pregnancy, or condition safety. Do not convert a successful terminology match into a safety guarantee or a negative check.

## Reuse terms checked

Official source pages were reviewed on 2026-10-04 UTC. Recheck each published reuse notice before any future source expansion.

| Source | Published mechanism/terms | Preparation decision |
| --- | --- | --- |
| Pharmac community Pharmaceutical Schedule XML archive | [Archive README](https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html) expressly licenses the files CC BY 4.0 and permits copying, distributing and adapting with written PHARMAC attribution (not its logo); it provides a source-error disclaimer. | **Include.** Fetch only the two exact XML files for one effective date; preserve written attribution, licence, source link, modifications disclaimer, effective date, retrieval timestamp and SHA-256. |
| Pharmac Hospital Medicines List XML archive | [HML README](https://schedule.pharmac.govt.nz/pub/HML/archive/README.html) publishes the same CC BY 4.0 grant and attribution/disclaimer requirements. | **Include.** Same treatment as the community Schedule; do not treat schedule membership as regulatory approval or individual funding eligibility. |
| Creative Commons Attribution 4.0 | [Legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en) grants reproduction, sharing and adaptation subject to attribution, source/licence notices, indication of modifications, and no implied endorsement. | **Use for the two licensed Pharmac files only.** Keep their licensor-specific notices alongside the CC BY link. |
| NZ Universal List of Medicines (NZULM) raw data | [NZULM data access and usage terms](https://info.nzulm.org.nz/data-access) say the raw files are distributed monthly by request; users accessing/downloading/using any data agree to the usage agreement, must pass the disclaimer and attribution, and must observe supplier licence terms. NZULM says its data aggregates NZMT, Medsafe, and Pharmac material with distinct supplier conditions. | **Exclude from this updater.** No download, account, application, agreement acceptance, or new provider grant was made. Preserve the existing, separately gated NZF/NZULM runtime integration. |
| Medsafe datasheets and Consumer Medicine Information | The official [Medsafe search page](https://www.medsafe.govt.nz/DbSearch/InfoSearch) says documents are published on behalf of medicine sponsors and commercial use requires permission from the sponsors. | **Link only.** The candidate catalogue can point users to Medsafe's official search index. Do not copy, parse, store, republish, or derive catalogue facts from the documents without sponsor permission. |
| Medsafe product/application search and status | The official [product search guidance](https://www.medsafe.govt.nz/DbSearch/) describes distinct statuses such as Consent given, Not available, and Approval lapsed. No reuse grant for extracting/re-publishing its product status dataset was verified in this review. | **Exclude structured status imports.** Provide an official lookup link only; do not scrape or infer a regulatory status. |
| NZF/DrugBank product and clinical services | Existing code has explicit provider/configuration, consumer-use, display, token expiry, consent, and identity gates; DrugBank NZ ingredient use requires its own explicit scope approval. | **Preserve all existing gates.** This task does not fetch, cache, or expand those sources, or alter the runtime/UI controls. |

Pharmac's existing records supply schedule-effective chemical headings, formulation labels (including published strength/form text), brand labels, Pharmacodes, NZMT identifiers, Schedule/HML membership, and the Section 29 annotation. The importer conservatively maps ingredient terms from chemical headings and explicit formulation exceptions. It does not import published excipients or a Medsafe regulatory-status dataset. The record field `market: "NZ"` identifies the catalogue's jurisdiction; it does not establish that an item is currently sold or supplied.

**Approval, funding and availability remain separate and unasserted.** A row in the community Schedule or HML records schedule membership for the effective date. It does not assert Medsafe consent, active marketing, stock availability, funding for a particular person or use, suitability, or complete product approval. `section29` is retained only as the source annotation. The catalogue is a limited slice of the NZ medicine landscape, not an exhaustive list of all registered, OTC, available, or funded products.

## Implemented preparation flow

`scripts/prepare-pharmac-catalogue.py` reuses the existing XML importer. It targets only the official fixed-host community and HML XML paths for one `YYYY-MM-01` effective date; it does not crawl archive listings or fetch other providers. It bounds input size, rejects a non-Pharmac redirect, stages outputs separately, and validates matching source dates, URLs, timestamps and checksums, licence and attribution metadata, unique IDs, ingredient references, row/statistic consistency, and paired suggestion-index versioning. Invalid input stops before replacing the current catalogue files.

For an accepted candidate, the updater writes a UTC `retrievedAt` next to each source's effective date and checksum. It emits a Markdown change report with added, removed, changed, and ingredient-mapping-changed counts and preserves incomplete mappings. Output replacement uses same-directory temporary files and restores the prior byte contents if the second file replacement fails. It can also run with `--dry-run` or local `--source-dir` inputs for deterministic verification.

The manual-only GitHub workflow at `.github/workflows/prepare-pharmac-catalogue.yml` is limited to `workflow_dispatch`; it prepares a draft pull request and has no auto-merge, deployment, or recurring trigger. A candidate PR must be reviewed against its source XML/change report before merge. Do not merge a data-only candidate until a separate review confirms any required app cache-key/effective-date notice updates. Patient medication records are separate and are never read or rewritten by this updater.

Offline synthetic verification:

```sh
python3 scripts/verify-pharmac-catalogue-update.py
node scripts/verify-medication-database.cjs
```

The synthetic test covers the approved host/date selection, two source versions, retrieval/checksum provenance, generated-record/statistic checks, invalid-source fail-closed behavior, idempotent rerun, and rollback after an injected second-file replacement error. It does not claim to validate a new real Pharmac release or clinically review any medicine facts.

## Proposed recurring activation, pending review

If this preparation code and its first real candidate are reviewed and accepted, enable the workflow schedule on the repository's default branch with:

```yaml
schedule:
  - cron: "17 6 25 * *" # 06:17 UTC on day 25 each month; prepare next month's effective date
```

Keep `workflow_dispatch` for controlled reruns. The scheduled run should only create/update a **draft** PR for human review. Require a reviewer to check both published Pharmac XML versions/checksums, all row and ingredient mapping changes, and the attribution/disclaimers. Merge remains a separate human action; no auto-merge or direct production deployment is proposed. If a merged catalogue release must be rolled back, revert its reviewed Git commit and regenerate both JSON files together from the prior release. No recurring trigger has been activated in this branch.
