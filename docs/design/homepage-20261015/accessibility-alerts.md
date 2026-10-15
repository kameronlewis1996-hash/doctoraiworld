# Accessibility and clearer alert status

This pass follows the requested accessibility audit and lighter presentation. It adds no clinical rules and changes no medication-check consent, account, storage or payment mechanism.

## What changed

- Today and Medicines have a compact, keyboard-operable Alerts shortcut. The Today navigation item also shows a status symbol when a result needs attention or has no flagged notices. Accessible names include the status; colour is never the only cue.
- Green means **No flagged notices**, always paired with **Limited checks. No alert does not mean safe.** It requires a well-formed local result with no listed missing categories, unknown or omitted medicines, uncertain allergies, or other uncovered entries. Empty, malformed and failed results never become green; incomplete inputs go to review.
- Orange means **Review needed**, including entries outside the limited checks. Red means **Contact a professional**. Existing urgent results keep the stronger **Urgent medical help** wording. The full Alerts cards retain every next-action instruction and source.
- Today, Visit Prep and Profile use shorter copy. Two repetitive Profile cards became direct links. Health Memory is a compact native disclosure with an explicit Off/On status. Alert trigger evidence and background explanations are expandable; next steps stay visible.
- Fixed low contrast on the Medicines scan label (previously 3.91:1) and expanded coverage note (previously 4.19:1). Added mobile scroll clearance for the fixed navigation and clear focus styling for new controls.

## Evidence

[Browser audit JSON](hub-clarity-audit.json) records 28 checks: Today, My Health, Visit Prep, Profile, Medicines and Alerts at 1440, 390 and 320 CSS pixels; the mobile homepage; green/orange/red/urgent/failed alert states; expanded Health Memory and coverage; medicine and symptom dialogs. Final automated WCAG A/AA checks report zero violations in these states and no horizontal page overflow or browser exceptions. Axe-core 4.14.0 was obtained from its official npm package and verified against the published SHA-512 integrity value.

A [focused follow-up](hub-alert-badges-audit.json) covers the final Today badge rendering and repeats 10 affected accessibility checks with zero violations. Computed badge colours and borders were asserted for desktop, category and mobile navigation in every alert state, after the existing icon hydrator ran.

Keyboard checks cover opening Alerts, visible focus, native disclosures, Escape dismissal and status labels on the Today tab. The neutral state clears stale green summaries. Forced colours retain status text and symbol borders. Earlier homepage tests cover reduced motion, motion pause and no-JavaScript rendering.

All browser checks use local source served with the production CSP, a temporary Edge profile, synthetic alert fixtures and unauthenticated API responses. No real health records or live account actions were used. State screenshots illustrate the status presentation; fictional engine results are injected independently of the empty demonstration medicine list.

| Screenshot | Purpose |
| --- | --- |
| [Today desktop](clarity-today-1440.png) / [Today mobile](clarity-today-390.png) | Shorter introduction and direct Alerts access |
| [Profile mobile](clarity-profile-390.png) | Compact Health Memory and fewer repeated explanations |
| [Medicines green](clarity-medications-green-390.png) | Limited-result wording with a green check symbol |
| [Medicines orange](clarity-medications-orange-390.png) | Unrecognised detail needs review |
| [Medicines red](clarity-medications-red-390.png) | Professional-review instruction and Today status symbol |
| [Alert detail](clarity-alerts-red-390.png) | Matching severity treatment and visible next step |

Repository checks passed: JavaScript syntax; 12 alert-status cases including actual engine results, uncertain allergies, incomplete inputs and fail-closed malformed fields; 12 existing renderer cases; four-tab and secondary route/consent/auth checks; existing local-medication UI verification; static-site verification; whitespace checks. Run the new regression check with `node scripts/verify-alert-status.cjs`.

The approach follows W3C guidance on [use of colour](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html). Automated results are limited to the tested states: a manual screen-reader audit, real-device/browser testing and authenticated hosted flows remain outstanding. The separately owned functional/clinical audit is not certified by this presentation pass.

## Integration follow-up

The integrated preview adds two synthetic fail-closed regressions beyond Astra's source audit: missing coverage and an uncertain allergy with a recognised medicine. The repository checks do not establish clinical validation or replace manual accessibility review.

## Scope and integration

Product files: `health-hub.html`, `health-hub.js` (alert rendering only), `hub-category-themes.css` and new `health-alert-status.js`. Test: `scripts/verify-alert-status.cjs`. No engine, generated clinical rules, shared base stylesheet, API or M-folder edit. PR72 carries this revision alongside the functional readiness changes. The separate uncommitted M-folder medication database coverage work remains excluded. No production merge or deployment is performed.
