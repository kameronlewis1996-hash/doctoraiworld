# r149 checker rights and clinical-rule gap audit — draft

Baseline: commit `7bec9131662b72d74e45efbf1aaaea0eda220dbe`, ruleset `2026.10.15-r149`. This inventory reads the [release exclusions ledger](../medication-provenance-exclusions.json), [release audit](../medication-provenance-release-audit.md), and filtered [seed](../../data/medication/medication-safety.seed.json). [rights-ledger.json](rights-ledger.json) holds the machine-checkable totals. Run `node docs/checker-rights-20261016/verify.cjs` from the repository root.

## Decision boundary

The release filter kept **5 of 1,274 candidate rules (0.39%)** and excluded **1,269 (99.61%)**. Its decision establishes a *recorded reuse basis* for the five retained prompts; it does not establish clinical validity, complete coverage, product-level suitability, or pharmacist approval. Public access to an article or guidance page does not itself grant reuse permission. The 1,269 exclusions remain candidates only and must not be activated by this audit.

| Rule family | Retained | Excluded | Candidate denominator |
| --- | ---: | ---: | ---: |
| Pairwise interactions | 2 | 1,115 | 1,117 |
| Multi-medicine combinations | 1 | 17 | 18 |
| Medicine-condition prompts | 0 | 133 | 133 |
| Allergy prompts | 2 | 4 | 6 |
| **Total** | **5** | **1,269** | **1,274** |

### Source and permission ledger

| Source group | Retained | Excluded | Recorded rights position | Remaining action |
| --- | ---: | ---: | --- | --- |
| Rahman et al. 2024, *JAMA Network Open* | 1 | 0 | CC BY 4.0, license URL and rule attribution in release ledger | Check attribution in any downstream display; clinical adjudication still open. |
| Vega et al. 2023, *Life (Basel)* | 1 | 0 | Same recorded basis | Same. |
| Kunitsu et al. 2026, *Journal of Pharmaceutical Health Care and Sciences* | 1 | 0 | Same recorded basis | Same. |
| DoctorAI internally authored allergy class prompts | 2 | 0 | Internal authorship and attribution recorded; no external source attached to the r149 rule | Review class mapping, individual-product limits, and clinical wording. |
| **Excluded source unresolved** | **0** | **1,269** | The release exclusions ledger preserves ID and filter reason, **not source publisher, URL, terms, or attribution for each excluded rule**. No source-specific permission conclusion is possible from it. | Recover the controlled original candidate source map, then identify each source and every additional source per ID; document applicable permission/license and attribution before considering reuse. Clinical adjudication remains separate. |

The final row is an explicit unknown-source bucket, not a claim that all excluded rules share one source. Do not assign excluded IDs to Medsafe, NZF, NHS, product sponsors, or other publishers by guessing from their names. The release filter also excluded the Health New Zealand Top 100 table and derived counts because a dataset-specific reuse license was not confirmed; that dataset is outside the 1,274-rule denominator. Pharmac terminology has its own CC BY 4.0 catalogue attribution and is likewise outside this rule count.

| Exclusion reason in release ledger | Rules | Permission/attribution gap to close |
| --- | ---: | --- |
| Reuse status unverified or conditional | 1,214 | Confirm source-specific permission/terms for intended use, then record attribution. |
| Reuse status missing | 41 | Identify source and its governing terms; obtain a documented reuse basis and attribution. |
| Record-level license or attribution incomplete | 12 | Complete rule-level license URL, publisher, title/source URL and attribution; independently verify applicability. |
| Additional-source rights not explicit | 2 | Clear **each** attached source independently, not just the primary source. |

The exact 1,269 IDs and their reasons live in the existing release ledger. It does not permit exact per-publisher denominators for excluded rules. A later source mapping should be joined by exact `category + id`, retain the original rejection reason, and show source counts that reconcile to **1,269 unique IDs**. Unknown, mixed, or conditional rights stay blocked. Permission clearance would make a rule an *authorized reuse candidate*, not a clinically approved rule.

## Separate NHS/NHS SPS wrapper inventory

The local health-alert wrapper in `server-src/health/alerts-engine.cjs` cites **8 NHS or NHS Specialist Pharmacy Service pages** across **9 prompt IDs**. Seven IDs are wrapper prompts: `severe-breathing-or-swelling`, `chest-warning-context`, `severe-chest-pain-context`, `asthma-breathing-context`, `warfarin-bleeding-symptom`, `ibuprofen-bleeding-symptom`, and `asthma-nsaid-breathing-context`. Two r149 allergy IDs, `penicillin-class` and `nsaid-class`, receive additional NHS context in the wrapper. This is source context on a separate code path, **not nine extra r149 rules** and not part of the 1,269 exclusions.

The eight source records have publisher, title, public URL, checked date, and scope note, but no license, license URL, or permission evidence. Treat their reuse/attribution position as unresolved until the exact intended use and applicable terms are verified. The wrapper prompt wording and clinical behavior also need their own clinical review. The `Chest pain` source note says page review was due **8 August 2026**, before this audit; recheck its current source metadata and have the clinical reviewer assess the two chest-pain prompts. This audit does not change emergency behavior.

The combined wrapper's `safeSources` projection also drops `license`, `licenseUrl`, `attribution`, and `rightsBasis` from the **three retained literature rules**, and its source URL allowlist omits their JAMA, PMC, and Springer hosts. A separate, exact-URL display fix should preserve the three r149 CC BY source links and their attribution/license metadata, including the Kunitsu Springer URL. It should not admit arbitrary public hosts or excluded candidate sources. This is a display and attribution gap, not a reason to expand the active rule set.

## Release gates for any future rule expansion

1. Recover a controlled source map for all 1,269 excluded `category + id` records. Log primary and additional sources, exact version/page, rights holder, applicable terms or written permission, attribution, and any use restrictions. Preserve an unresolved state if evidence is absent.
2. Independently assess the clinical claim, population, route, dose/context, severity and wording for each proposed rule; obtain the designated clinician/pharmacist decision and date in the private review process. No clinical sign-off is asserted here.
3. Verify the resulting rule set against the source map, rights records, and clinical decisions before any separate activation proposal. Keep unmatched and partial pairs explicitly unassessed.
