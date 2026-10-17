# NZ medication terminology and safety-rule coverage

Ruleset **2026.10.15-r149** is a rights-filtered, very limited prototype dataset. It is not a complete interaction checker, has not been clinically validated, and does not have NZF production authorization.

## Included data

- The medicine terminology catalogue contains 3,419 Pharmac product/formulation records, including 1,444 brand names and 1,224 chemical names. Of these source products, 113 have incomplete ingredient lists; name matches do not establish that a medicine is current, approved, funded or suitable.
- The medication-list lookup and Health Hub suggestions search all 3,419 bundled product formulations by brand, chemical name, linked ingredient names and aliases, formulation/strength text, Pharmac code, NZMT identifier and schedule. Search results display only the ingredient IDs mapped in the source catalogue; incomplete records are labelled and no missing ingredient is inferred. The search query is filtered in the browser against the locally hosted catalogue.
- This search denominator is the two Pharmac source lists above. It does not include every New Zealand retail, over-the-counter, unlisted or current shelf-pack product. The database’s 113 incomplete ingredient records and the Pharmac source disclaimer remain visible limitations.
- The filtered safety seed contains 534 ingredient entries and no seed product aliases. Product terminology is mapped from the separate Pharmac catalogue.
- The October 2026 Pharmac Pharmaceutical Schedule is attributed to Pharmac | Te Pātaka Whaioranga under CC BY 4.0. Source: [Pharmac schedule archive](https://schedule.pharmac.govt.nz/pub/schedule/archive/2026/2026-10-01/Schedule_2026-10-01.xml). Attribution: “Medicine terminology adapted from Pharmac community and hospital XML schedules. Names are normalised and ingredients conservatively mapped by DoctorAI. Pharmac does not endorse DoctorAI.” See also [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Pharmac’s source-file disclaimer is retained: “Pharmac takes no responsibility for errors or omissions in the source files. A Schedule listing does not establish Medsafe approval, current supply, suitability, funding eligibility or complete interaction coverage.”

## Active safety prompts after rights review

- 2 pairwise interactions: `oral-anticoagulant-ssri` and `warfarin-sulfamethoxazole`.
- 1 multi-medicine interaction: `ras-inhibitor-diuretic-nsaid-aki`.
- 0 medicine-condition prompts.
- 2 internally authored allergy prompts: `penicillin-class` and `nsaid-class`.
- 1,269 source-derived safety rules are excluded pending explicit reusable rights and complete attribution: 1,115 pairwise, 17 multi-medicine, 133 medicine-condition and 4 allergy rules.

The filter retains a source-derived rule only when each attached source has an explicit CC BY 4.0 license, canonical license URL and record-level attribution. Internal DoctorAI rules are retained only when explicitly marked as internally authored and no external source is attached. A public URL or independent paraphrase does not establish reuse permission. Retained and excluded IDs with their rights basis are recorded in [the provenance ledger](medication-provenance-exclusions.json), and the [release audit](medication-provenance-release-audit.md) summarizes the decision policy.

Medsafe states that data sheets and Consumer Medicine Information remain the sponsoring medicine company's property; commercial reuse needs permission from that sponsor. Candidate rules based on those documents therefore remain inactive until the applicable reuse rights and clinical review are recorded. See [Medsafe's site information and copyright terms](https://www.medsafe.govt.nz/other/siteinfo.asp).

## Coverage limits

Only listed and matched rules can produce an interaction alert. Any unmatched medicine pair is **unassessed**, even when both medicine names resolve. A missing alert is not evidence that a combination is safe. Strength, dose, route, timing, treatment intent, patient-specific risk, pregnancy and many other clinical factors are not evaluated. Review the complete medicine list and actual labels with a pharmacist or prescriber; do not change prescribed treatment based on this prototype.

The Health New Zealand Top 100 prescribing figures were removed because the source-specific reuse license was not confirmed. The rights-filtered note is in [the Top-100 coverage audit](top-100-common-prescriptions-coverage-audit.md); it contains no ranked counts or derived coverage claims.
