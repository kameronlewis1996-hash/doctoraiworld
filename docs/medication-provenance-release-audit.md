# Medication provenance release filter

Applied 2026-10-15 to the R149 seed. This is a provenance filter, not a clinical validation.

## Rule-level policy

Retain only records with record-level CC BY 4.0 licensing, a license URL, and source attribution, or internally attributed DoctorAI rules with no external source. Each additional source attached to a retained rule must independently meet the same CC BY 4.0 and attribution check. Independent paraphrasing or a public URL does not grant reuse permission. All rules with unverified, conditional, missing, or otherwise unclear rights remain excluded. The exact retained IDs, rights basis, attribution, and excluded IDs are recorded in [medication-provenance-exclusions.json](medication-provenance-exclusions.json).

## Active counts

- Pairwise interaction rules: 2
- Multi-medicine rules: 1
- Medicine-condition prompts: 0
- Allergy prompts: 2
- Excluded source-derived safety rules pending reusable rights and attribution: 1269
- Coverage status: highly limited; every absent or partial pair is unassessed. No alert does not mean safe.
- Added Pharmac-coded ingredients present in the licensed catalogue; pre-existing DoctorAI ingredient mappings preserved. Product mapping comes only from the licensed Pharmac catalogue; medication seed product aliases were removed.

The Health New Zealand Top 100 prescribing table and derived counts were excluded because a dataset-specific reuse license was not confirmed. No NZF production authorization or clinical validation is claimed. Pharmac product data retain their source attribution and non-endorsement disclaimer.
