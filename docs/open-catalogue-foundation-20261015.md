# Open terminology foundation — preview, 15 October 2026

This is a small, versioned starting point for a future international catalogue. It is **not** a comprehensive medicine, disease, allergy or adverse-effect database and has had no clinical validation. Terminology selection records what a person chose to report; it never diagnoses and never creates a safety rule by itself.

## Included and excluded source material

| Catalogue | Records in this preview | Identity scope | Rights and attribution |
| --- | ---: | --- | --- |
| Conditions/history | 3 | Human Disease Ontology (`DOID`) condition IDs, English labels and a few verified aliases | [Human Disease Ontology](https://obofoundry.org/ontology/doid.html), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Medicines | 2 | [ChEBI](https://obofoundry.org/ontology/chebi.html) chemical identities; no brand, product, formulation, strength, route, availability or jurisdiction mapping | ChEBI, EMBL-EBI, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); this subset adapts its IDs and labels with attribution |
| Allergies/reactions | 1 substance class and 4 reaction labels | ChEBI penicillin class and [Symptom Ontology](https://obofoundry.org/ontology/symp.html) reaction labels | ChEBI, EMBL-EBI, CC BY 4.0; Symptom Ontology, CC0 1.0 |
| Alert mappings | 0 | No term-to-alert mappings | A future mapping requires independently reviewed evidence and reusable rights |

The individual record URLs are stored with each term. The terms were manually selected from source pages or the July 2026 Symptom Ontology OBO snapshot and checked on 15 October 2026. The complete source ontologies have **not** been imported. Search works locally from these bundled files; no external terminology API is required at use time. English is the only language in this preview. The [machine-readable manifest](../catalogues/manifest.v1.json) gives exact counts and limits.

The existing New Zealand Pharmac terminology and rights-filtered DoctorAI safety rules remain separate. Their [provenance and exclusions](nz-medication-database.md) are unchanged. The 1,269 excluded source-derived rules do not return through these open catalogues. NZF content is not included. [Medsafe's data sheet and CMI search](https://www.medsafe.govt.nz/DbSearch/InfoSearch) is linked for users in New Zealand, but its content is not copied; that page says commercial use requires permission from the relevant sponsors.

## Identity and safety boundaries

- A global chemical ID is not proof of equivalence to a local product. `medicines.v1.json` has zero local product mappings. Later mappings need separate jurisdiction, language, brand, formulation, strength, route, source, effective date and review status.
- A `DOID` condition ID or `SYMP` reaction ID is a searchable label, not a diagnosis, allergy confirmation, drug effect or contraindication.
- `alert-mappings.v1.json` is empty. Future rules need record-level evidence, licence review, route/formulation and jurisdiction scope, clinical review, deterministic matching tests and an explicit unknown result when information is missing.
- The current medication check remains the separately reviewed, narrow rights-filtered ruleset. A missing alert does not establish safety. Food and side-effect advice for specific medicines is **not assessed** by this preview.

## Personal data compatibility

The existing `profile.conditions` and `profile.allergies` strings remain for older records and current local checks. On opening the edit form, older text is shown as unreviewed entries; nothing is silently overwritten. Saving the form records structured `conditionEntries` and `allergyEntries` with stable source IDs or explicit user-generated custom IDs. Each condition has current, historical or unsure status. Each allergy/reaction entry stores substance, optional reaction and certainty separately. Historical conditions stay visible but are omitted from the legacy current-condition string. New possible/unsure reactions remain visible for discussion but do not enter the legacy confirmed-allergy check. Older unreviewed allergy text stays in that check until the person changes or removes it.

The user must choose a search suggestion explicitly or select **Other / unsure** before adding free text. Typed but unadded text blocks profile save. Search failure allows the same explicit free-text path. Catalogue aliases improve finding a label; they do not imply clinical equivalence.

## Reproducing this preview

`node scripts/verify-open-catalogues.cjs` checks IDs, source URLs, licences, counts, aliases, legacy migration, status handling and the offline OBO parser using synthetic data. `node scripts/verify-today-diary.cjs` checks explicit question entry creation and duplicate prevention. `scripts/import-open-obo.cjs` is an offline parser scaffold; it filters obsolete terms and rejects licences outside the reviewed allowlist. It is not an automatic clinical importer. Any larger import needs a pinned source release, full redistribution review, attribution, normalization review, terminology QA and a separate preview.

This preview still needs actual browser/device and assistive-technology review, authenticated persistence rehearsal, clinical review of any future rules and legal review before production use.
