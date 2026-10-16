# Checker reliability — bounded draft stage

Production stays frozen at PR83 `7bec9131662b72d74e45efbf1aaaea0eda220dbe`, rules `2026.10.15-r149`. This branch is a reviewable draft/preview, not a clinical release. No new clinical rule, advice, provider permission, real account, paid call or health-photo upload is introduced.

## Implemented and integrated

- **Photo draft PR84**, `db8fc554f2c284fc34e6ec91fdce3715345c4e0c`: local packaging-photo comparison, orientation/metadata handling, remove/reset and account/form isolation. Visual consistent/mismatch/unsure choices do not alter ingredient confirmation or alerts. No licensed exact-product reference image is available; that panel remains honestly unresolved/no-image.
- **Rights audit PR85**, `eb67c4661bef1fb8e350c4b65022740491b6ba67`: reconciles 5 retained / 1,269 excluded rules, permissions gaps and NHS/NHS SPS wrapper sources separately. It activates nothing.
- **Identity draft PR86**, `7b740b0c9c68409e1d26412578f77fac08dfa180`: independent exact-source resolver and reproducible coverage ledger. Full brand/chemical/formulation or exact source identifier plus region is required; conflicting, incomplete, ambiguous and unknown states remain explicit. It is not automatically wired into current safety rules or image references.
- **Test-first propagation fix**, `542acdd` then `238a6549a3d5731952179822c948020c20d4bf1d`: the medicine engine detected the retained three-medicine notice but the combined wrapper dropped it. The wrapper now forwards that existing notice once with exact saved-record triggers; pairwise coverage remains separate. Clinical predicates, rule data, severity and advice are unchanged.
- **Integration source display**: the three exact retained literature URLs and attribution/licence metadata survive the wrapper, and the real Alerts renderer displays escaped attribution and an exact CC BY4 link. Arbitrary pages on those hosts remain blocked. Before integration the explicit attribution gate had four display failures; it now passes all 38 checks.

## Measured coverage and unresolved work

| Area | Measured result | Remaining gate |
| --- | --- | --- |
| Frozen Pharmac formulation subset | 3,419 rows; 113 ingredient-incomplete; 2,991 without one explicit route token | Verify actual product/strength/form/route and ingredient completeness; no whole-market coverage claim |
| PR79 source-pack dry run | 3,189 single-formulation matches / 3,380 distinct codes; 191 ambiguous | Source rows remain in a separate draft; no current shelf/OTC denominator or retail inventory |
| Rule rights | 5 retained / 1,274 candidates; all 1,269 exclusions remain blocked | Exclusion artifact lacks original per-rule source map; obtain controlled provenance and permission before any reuse |
| Wrapper sources | 8 NHS/SPS references across 9 prompt IDs | Rights/currentness/NZ applicability separate from r149; overdue chest metadata review |
| Route handling | Explicit resolved-route seams are tested | Existing saved `route` fields are not assessed; unknown/mixed route behavior requires independent review. No exact topical NSAID source record was available for a full product-path negative |
| Reference photos | 0 approved product images | Exact-product bridge, packaging currentness, documented image permission/attribution and local approved assets |
| Clinical evidence | Proposed pack has 16 fictional cases, all unvalidated/not-run | Pharmacist must define expected outcomes independently and adjudicate observations; software fixtures do not estimate real-world sensitivity |

Detailed denominators and blocked states: [coverage-and-gap-ledger.json](coverage-and-gap-ledger.json), [identity ledger](../medicine-identity-coverage-20261016.md), [rights ledger](../checker-rights-20261016/README.md), [combined review](../checker-combined-e2e/review.md).

## Verification

The failing-before case is committed separately: 0/1, because the combined notice was absent. Integrated `--require-visible-attribution` conformance is **38/38**. This includes actual saved-state loading, generated medicine/wrapper engines and the real renderer; four route seams and six URL sanitization cases are explicitly lower-level checks. Full Edge browser saved/reload/delete scenarios are **4/4**. The source UI has **5** real-renderer cases and **5** axe states across 320/390/1440px, including all three retained literature sources.

On the integrated code, photo verification passed **5** journey groups / **6** axe states and Today passed **11** groups / **7** axe states. Existing 76 alert fixtures, 12 presentation checks, medication recognition/database/pipeline/controller/login, zero-medicine lifecycle, record preparation, device/account isolation, navigation, generated-bundle consistency, syntax and static checks pass. These sets overlap; they are not one clinical denominator. All records/images/identities were synthetic.

Performance observations in `source-ui-qa.json` are loopback headless measurements with blocked external requests, not real-user internet benchmarks. The photo module adds 14,754 JS bytes and 3,695 CSS bytes before compression; there are no remote product-image requests. The existing catalogue/engine payload remains material (about 5 MB transferred by the uncompressed local preview); payload optimisation and real-device/network measurements remain future work. No paid video or AI image service was used.

The historical `checker-combined-e2e/attribution-integration-gap.json` preserves the earlier failed gate. Use this folder's `integrated-conformance.json` and source UI evidence for the final integrated state; do not mistake historical failures for current passes or remove the failing-before evidence.

## Private reviewer portal — separate, not in this preview

[Draft PR87](https://github.com/kameronlewis1996-hash/doctoraiworld/pull/87), `3f75b055efb09bb8de9d09021ef4294c01f998d3`, is deliberately separate and has no deployment. The API export is disabled and unwired. It includes versioned feedback, author/owner read isolation, separate credentials/session scope, CSRF, expiry/revocation and old-worker cache protection. Independent security review fixes are recorded; 15 security groups and three native browser/a11y states pass using synthetic content only.

The supplied Pack 1.0 has been structured and validated **outside Git and public web roots**, with 16 unvalidated/not-run cases and 20 metadata/link sources. No persistent import or access was enabled. Activation needs its own approval plus encrypted/atomic private storage, durable rate limiting, retention/deletion and secure user-set credentials. Proposed access: one workspace, owner/reviewer roles, maximum seven days, two-hour sessions, 20-minute idle expiry, 30-minute single-use setup code and immediate server revocation. No patient, billing or admin access.

## Practical next review

Have the pharmacist define expected responses and acceptable limits for M01–M08/H01–H08 before running them. Prioritise multi-view parity, identity/combination completeness, route uncertainty, negation/history/currentness, missing/overflow inputs and account failure states. Record exact build/rule/source and feedback issue IDs. Resolve rights/currentness separately; qualify all unassessed states clearly. Do not activate excluded rules or enlarge claims from this fixture pass. Production rollout and reviewer access each require their own explicit approval after their remaining gates are satisfied.
