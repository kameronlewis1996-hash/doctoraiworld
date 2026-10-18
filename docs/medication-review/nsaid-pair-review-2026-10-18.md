# NSAID pair review packet — 18 October 2026

**Status: for independent pharmacist and source-rights review. Do not activate a new rule from this packet.**

This packet records the observable checker behavior and the external evidence that prompted review. It is not a clinical decision, a complete interaction review, or a conclusion that the pair is safe.

## Exact scenario

The synthetic test uses these Pharmac catalogue formulations:

- `pharmac-27fe3db7fbaac919` — Voltaren, diclofenac sodium, suppository 100 mg; the catalogue's `interactionRoute` is `systemic` for rule-scope metadata only.
- `pharmac-34fe78bf9d3ca1b3` — ibuprofen tablet 400 mg; the catalogue's `interactionRoute` is `oral` for rule-scope metadata only.

The fixture supplies diclofenac and ibuprofen as label-confirmed ingredients so that the checker exercises the ingredient-based path. This synthetic confirmation is not evidence that a person's package, dose, route, or schedule has been verified.

## Evidence and clinical expectation

The [Medsafe Brufen Extra New Zealand data sheet, section 4.5](https://www.medsafe.govt.nz/Profs/Datasheet/b/BrufenExtratab.pdf) advises against concomitant use of two or more NSAIDs because adverse effects may increase. That is a source-supported reason to request a pharmacist's review. The source is about the Brufen Extra product data sheet; an independent pharmacist must decide whether and how its statement applies to the exact diclofenac suppository and ibuprofen tablet, and what patient-facing action is accurate.

This source finding is separate from the software result below. It is not proof that this exact combination always causes harm, nor does it establish the right alert severity, route scope, or wording.

## Current checker result

On the current R149 main ruleset, both synthetic formulations resolve and their label-confirmed ingredients match. No retained pairwise rule matches them:

| Measure | Current result |
| --- | ---: |
| Requested pair | 1 |
| Pair assessed by a retained pair rule | 0 |
| Pair unassessed | 1 |
| Checker status | `unknown` |
| Interaction/contraindication alert | None |

The UI must report this pair as **unassessed**. No matching rule and no interaction alert do not mean safe. The same conclusion is shown whether or not synthetic label ingredients are supplied, because catalogue identity alone does not widen the confirmed-only ingredient gate.

The candidate rule `systemic-nonaspirin-nsaid-duplicate-toxicity` remains in [the exclusion ledger](../medication-provenance-exclusions.json) with reason `reuse-status-unverified-or-conditional`. Do not infer reuse permission from a public URL. The current [provenance audit](../medication-provenance-release-audit.md) requires record-level reusable rights and attribution for source-derived rules. This review has not established that the Medsafe sheet or another source grants the needed reuse rights for this rule.

## What the staff test tab exercises

The staff-only Medication clash testing tab sends fixed fixture IDs to a server endpoint. The server constructs the synthetic medicines; it rejects custom medicine payloads, requires the existing staff-admin session, runs the local rules, and returns results without reading or writing health records.

| Fixture | Expected software behavior | What it does not establish |
| --- | --- | --- |
| Voltaren suppository + ibuprofen | `unknown`, 0/1 assessed, 1/1 unassessed; no excluded rule | Clinical clearance or exact applicability of the data sheet |
| Warfarin + ibuprofen | `unknown`, unassessed; no retained warfarin–NSAID rule | That no interaction exists |
| Warfarin + Trisul | Retained warfarin–sulfamethoxazole rule appears | Complete review of the medicine list or patient |
| Warfarin + sertraline | Retained oral-anticoagulant–SSRI rule appears | Dose, bleeding risk, or treatment suitability |
| Ibuprofen + Nurofen | Duplicate-ingredient alert appears; unrelated pair coverage may remain unknown | Confirmation of a real person's labels |
| Lisinopril + furosemide + ibuprofen | Retained three-medicine alert appears; two-medicine pairs can remain unassessed | Kidney function, dose, route, timing, or current clinical status |
| Fictional unmatched pair | Unknown/unmatched result; no safety conclusion | Clinical response for real unmatched products |
| Empty list | No medication alerts and no medicine check | Any safety conclusion |

All fixture names and labels are synthetic. Rule matches verify software wiring only. The active R149 scope remains two pairwise interaction rules, one multi-medicine rule, zero medicine-condition prompts, and two internal allergy prompts. The excluded 1,269 candidate rules remain inactive.

## Decisions needed before any new rule

An independent pharmacist should record a dated decision on:

1. Whether the evidence applies to diclofenac suppository 100 mg with ibuprofen 400 mg, accounting for the source product, exact formulations, route information, dose, duration, and patient context.
2. Whether the software should use a narrow product/route-specific rule or a broader ingredient-class rule, and which formulations would be in and out of scope.
3. Appropriate severity and user action. Proposed wording for review only: “This pair may involve two NSAIDs. Ask a pharmacist or prescriber to review your exact medicines.” The wording should not tell a person to stop, start, or change a prescribed medicine.
4. Whether the source itself is current and suitable for the intended claim, and whether an appropriately rights-cleared source can support each statement in the rule.
5. The review owner, date, expiry/review date, and re-check trigger when the source or Pharmac catalogue changes.

The catalogue has 3,419 formulations, 109 of which remain ingredient-incomplete (80 empty mappings and 29 partial). The test must preserve those unknown states. No extra mapping or clinical rule was added for this review packet.
