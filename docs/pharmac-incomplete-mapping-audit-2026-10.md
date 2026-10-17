# Pharmac catalogue incomplete-mapping audit

This audit describes the bundled Pharmac snapshot at `2026-10-01-pharmac`. It is a conservative terminology catalogue, not a complete medicine or safety database.

## Source and reproducibility

The importer reads the official [Pharmaceutical Schedule XML](https://schedule.pharmac.govt.nz/pub/schedule/archive/2026/2026-10-01/Schedule_2026-10-01.xml) and [Hospital Medicines List XML](https://schedule.pharmac.govt.nz/pub/HML/archive/2026/2026-10-01/HML_2026-10-01.xml). Their SHA-256 values were recomputed from the downloaded files and match the bundled source metadata:

- Schedule: `cb89c7d2d44be5145f8966f4c7e3bedf971f28432c208748fed91a68f4260b7b`
- Hospital Medicines List: `f60f7df51ef4716f2382580dda49f033ea3b45ee5734deeb826068e0a49f2bf7b`

The importer previously rejected the substring `enzyme` anywhere in a chemical heading. That incorrectly treated `Coenzyme Q10` as an unspecified mixture. The filter now requires the whole word `enzyme`, and has a built-in regression guard against this false positive. Rebuilding from the hash-matched XML identifies the exact Pharmac chemical heading `Coenzyme Q10` for four formulations. Those rows now map to one Pharmac-sourced terminology entry with no aliases or safety classes. No interaction, allergy, or condition rule was added.

Corrected rows:

- `pharmac-1566ae8ef06fc485` — Coenzyme Q10, Cap 120 mg
- `pharmac-e3ebd2cfb6bbbfac` — Coenzyme Q10, Cap 160 mg
- `pharmac-fe7fd70950eb0249` — Go Healthy, Coenzyme Q10, Cap 160 mg
- `pharmac-893a79aa51fbfed2` — Solgar, Coenzyme Q10, Cap 120 mg

## Remaining incomplete rows

After the correction, the 3,419-formulation snapshot has 3,310 rows marked complete and 109 still marked incomplete: 80 with no mapped ingredients and 29 with only a partial list. The remaining rows fall into these conservative groups:

| Rows | Mapping state | Why they stay incomplete |
| ---: | --- | --- |
| 72 | Empty | Broad or complex headings such as vaccines, mixed salts, multivitamins, electrolyte solutions, extracts, and other non-single-substance terms are not safely reducible to one or more ingredients by this importer. |
| 8 | Empty | Comma-separated or similarly ambiguous chemical headings, including multi-constituent vaccine headings and proprietary formulations, are not split automatically. |
| 25 | Partial | The formulation text names additional constituents or a presentation that the chemical heading alone does not safely establish. Examples include Betadine Skin Prep, Breztri Aerosphere, and Chlorvescent. |
| 4 | Partial | Multi-constituent chemical headings do not align cleanly with the formulation text. Examples include Egopsoryl TA, Kenacomb, Prepkit Orange, and Viaderm KC. |

These totals are 80 empty plus 29 partial. The UI must continue to describe any mapped terms as known or partial and unconfirmed against a person’s package. The checker receives only the saved name and strength/dose, and label ingredient terms only after the person compares and confirms them. A Pharmac product ID or source-derived ingredient list is not sent to the checker.

## Safety scope

The correction changes terminology coverage only. The retained ruleset remains two pairwise interaction rules, one three-medicine rule, zero condition prompts, and two internal allergy prompts. Excluded candidates remain inactive. A complete mapping only means the catalogue row was mapped under the importer's conservative rules; it does not establish clinical completeness, label identity, suitability, dose, route, availability, or safety.
