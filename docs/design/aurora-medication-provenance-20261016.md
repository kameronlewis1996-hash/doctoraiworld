# Medication provenance and alert semantics review

Reviewed 2026-10-16 against the current aurora branch. This is a presentation and evidence review, not a clinical validation.

## Provenance and coverage

The R149 release audit is explicit that its filter establishes reuse rights and attribution only. It retains two pairwise interaction rules, one multi-medicine rule, no medicine-condition prompts, and two internally attributed allergy prompts; 1,269 source-derived rules remain excluded while reuse rights or attribution are unclear. The Health New Zealand Top 100 counts and derived coverage figures are removed pending confirmation of a dataset-specific licence. The audit makes no NZF production authorization or clinical-validation claim, and says every absent or partial medicine pair is unassessed.

The active provenance ledger is checked against the bundled seed. Product aliases without verified source rights are not shipped; Pharmac catalogue products retain their attribution and non-endorsement disclaimer. Incomplete catalogue ingredient listings fail closed to unknown. No alert is explicitly described as not meaning safe.

## Visible status and aurora palette

The local status summary keeps labels and symbols alongside color: unavailable or malformed results are neutral; unassessed pairs and other review cases are orange; high and urgent cases are red; green is limited to a well-formed local result with no uncovered entries and always carries “Limited checks. No alert does not mean safe.” Empty and failed results clear prior warning tints. The Today badge is separately labelled for assistive technology, and red has a distinct square mark while review and green marks are circular.

The new aurora rules recolor route and decorative icons. They do not select `.hub-alert-icon` or `.medication-warning-icon`; alert-card severity colors remain in their existing severity selectors. Today status badges are a separate element from route icons, excluded from the mobile route-icon rule, and retain explicit green, orange, and red colors. The page background is calm in neutral and green states, while the status label and badge carry the current result; the design notes correctly state that a calm background is not a safety judgement.

## Focused verification

- `node scripts/verify-alert-status.cjs` — 15 checks passed, including unassessed-pair orange, urgent red wording, and stale-warning reset.
- `node scripts/verify-alerts-presentation.cjs` — 12 checks passed using the actual renderer and synthetic fixtures.
- `node scripts/verify-medication-pipeline.cjs` — passed; incomplete identity, strength, and label mismatch remain unverified/unknown.
- `node scripts/verify-health-state-contract.cjs` — passed.
- `node scripts/verify-medication-evidence.cjs` — provenance and fail-closed assertions passed before the verifier stopped at its stale cache assertion on line 117. It expects `doctorai-shell-v145`; the current `service-worker.js` declares `doctorai-shell-v147`, and the asserted medication asset versions are present. The shared verifier was not changed in this review.
