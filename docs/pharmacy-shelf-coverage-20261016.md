# NZ pharmacy-shelf identity sample — 16 October 2026

This is a bounded **eight-listing sample**, not a pharmacy inventory, approval list, stock check or estimate of market coverage. Product names on linked NZ retailer pages establish that a product is offered; they are not clinical evidence. Availability, pack size and formulation can change. No retailer text, product images or medicine records were imported into the runtime catalogue.

The separate [Pharmac pack source coverage report](pharmacy-source-coverage-20261016.md) measures 3,590 source pack-to-formulation rows across the licensed community and hospital XML files. It does not treat those listings as retail shelf coverage.

The only product terminology used by this change remains the October 2026 [Pharmac Pharmaceutical Schedule XML](https://schedule.pharmac.govt.nz/pub/schedule/archive/2026/2026-10-01/Schedule_2026-10-01.xml), whose [archive notice](https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html) expressly licenses the files under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) with attribution. The existing catalogue records source and non-endorsement. A Schedule match does not establish Medsafe approval, retail supply or interaction coverage. Retail listings have no verified commercial data-reuse permission here, so they are linked as observations only.

| NZ retailer listing checked | Local identity result with synthetic input | Limit |
| --- | --- | --- |
| [Gaviscon Extra Strength Peppermint Tablets 60s](https://www.lifepharmacy.co.nz/products/gaviscon-extra-strength-peppermint-tablets-60s) | `Gaviscon Extra Strength Tab 500 mg` resolves the three ingredients in the licensed Pharmac formulation: sodium alginate, sodium bicarbonate and calcium carbonate. | The lone 500 mg value does **not** verify the other two component strengths. Pair interaction coverage stays unassessed. |
| [Betadine Antiseptic Ointment 65g](https://www.lifepharmacy.co.nz/products/betadine-antiseptic-ointment-65g) | The Pharmac formulation `Betadine - Povidone iodine - Oint 10%` resolves to povidone iodine. | The shelf title itself is not a complete catalogue key; pack size is not matched. |
| [Voltaren Rapid Tabs 12.5mg 20s](https://www.lifepharmacy.co.nz/products/voltaren-rapid-tabs-12-5mg-20s) | Exact shelf name is unmatched. | Do not map this branded product through another Voltaren formulation or assume a route from the brand alone. |
| [Voltaren Emulgel No Mess 75g](https://www.lifepharmacy.co.nz/products/voltaren-emulgel-no-mess-75g) | Exact shelf name and `Voltaren Emulgel 1%` are unmatched. | Topical products are not silently treated as the catalogue's systemic Voltaren products. |
| [Nurofen Tablets 48s](https://www.lifepharmacy.co.nz/products/nurofen-tablets-48s) | The existing `Nurofen` ingredient alias suggests ibuprofen only; `Ibuprofen Tab` with `200 mg` resolves a generic licensed tablet formulation. | No product-level Nurofen record is imported, and the generic match is not proof of this shelf product's exact pack or formulation. |
| [Nurofen Cold & Flu Tablets 12s](https://www.lifepharmacy.co.nz/products/nurofen-cold-flu-tablets-12s) | Exact combination name remains unmatched. | The simple Nurofen alias must not stand in for a multi-ingredient cold-and-flu product. |
| [Panadol Optizorb Caplets 48s](https://www.lifepharmacy.co.nz/products/panadol-optizorb-caplets-48s) | Exact shelf name remains unmatched; the existing `Panadol` alias is ingredient-level only. | No product-level Panadol Optizorb record, pack or strength is asserted. |
| [Difflam Dual Action Orange Lozenges 16s](https://www.lifepharmacy.co.nz/products/difflam-lozenge-orange-sugar-free-16s) | Exact combination name remains unmatched. | A licensed single-ingredient Difflam solution is not substituted for this lozenge. |

## Reported Voltaren + ibuprofen case

Synthetic replay of `{name: "Voltaren", dose: "20"}` plus `{name: "Ibuprofen Tab", dose: "Ibuprofen 200 mg"}` now resolves the second entry to a licensed oral tablet formulation and leaves the first **unknown** because the brand spans forms and `20` has no unit or formulation. The one requested pair stays unassessed. A separately tested, fully named oral diclofenac tablet plus the ibuprofen tablet resolves both identities but still has **no retained pairwise rule**, so it also stays unassessed. A topical Voltaren name remains unknown. None is labelled safe.

The [NZ Voltaren tablet data sheet](https://www.medsafe.govt.nz/profs/datasheet/v/voltarentab.pdf), sections 4.4–4.5, describes concerns with other systemic NSAIDs. [NHS diclofenac guidance](https://www.nhs.uk/medicines/diclofenac/taking-diclofenac-with-other-medicines-and-herbal-supplements/) also describes the ibuprofen combination. These are **research leads only**, not active DoctorAI rules. [Medsafe states](https://www.medsafe.govt.nz/DbSearch/InfoSearch) that commercial reuse of sponsor data sheets requires sponsor permission; none is documented. The [NHS terms](https://www.nhs.uk/our-policies/terms-and-conditions/) allow specified content under OGL v3 with attribution and refresh/adaptation conditions, but do not substitute for NZ clinical scope and independent clinical review. No data-sheet text was copied into a runtime rule.

### Proposed clinical-evidence queue — inactive

| Candidate | Source, checked | Formulation scope to review | Rights state | Clinical state |
| --- | --- | --- | --- | --- |
| Systemic diclofenac plus systemic ibuprofen or other systemic NSAID | NZ Voltaren 50 mg enteric-coated tablet data sheet, sections 4.4–4.5; NHS diclofenac guidance, checked 16 October 2026 | Oral diclofenac and oral ibuprofen first; topical diclofenac needs a separate assessment; dosage, duration and patient context not established by product names | Medsafe sponsor permission **unverified**; NHS OGL v3 conditions identified but no production attribution/refresh workflow approved | **Not clinically reviewed; inactive** |

Before any rule is activated: confirm source-specific reuse rights and attribution; pin each exact product/route; obtain qualified NZ clinical review of severity, wording, exclusions and next action; add positive and negative route tests; update the rights ledger and ruleset version. AI-generated suggestions alone cannot publish a rule. No real user health data was sent to research tools.

## Synthetic verification boundary

`verify-medication-database.cjs` covers the reported unknown, exact tablet strength, oral-versus-topical distinction, three-ingredient Gaviscon mapping, duplicate ingredients, unsupported shelf variants and the retained warning. `verify-health-alerts.cjs` covers the local Today/Alerts unassessed state and combination duplicate. `verify-local-medication-ui.cjs` covers the consented UI→API→rules presentation of the ambiguous pair and the already-retained warfarin/sulfamethoxazole warning. These tests use invented accounts/records and do not validate real label capture, stock, signed-in production behavior, clinical suitability or comprehensive interaction coverage.
