# DoctorAI PR91 accessibility and layout audit  -  17 October 2026

Priority keyboard, focus, contrast and mobile medicine readability defects are resolved. The blue/lilac Aurora surfaces, destination colors, clinical warning copy, and consent boundaries are preserved.

Implementation branch: `codex/overnight-a11y-20261017`. Final patch is based on PR91 head `36aae58f6d59dcaab684467e8900e6e02aab255a`; baseline screenshots use original delegated head `3658f71`.

Full durable evidence: `C:\Users\User\Documents\Codex\2026-10-15\task\overnight-a11y-evidence`. This repository includes six representative screenshot pairs (about 3.5 MiB), this report, and [summary.json](summary.json). Full screenshots, DOM findings, and interaction results remain in the durable evidence directory. Final medicine-layout captures are under `after-final-medicine/`, while `after/` preserves the earlier full-matrix run and must not be cited as evidence of the later responsive fix. The committed medicine pair is a fresh 320x1000 viewport capture of the 427-character longest Pharmac product, with no toast or bottom-navigation overlap in the final card.

## Severity-ranked checklist

| Priority | Status | Finding and resulting behavior | Evidence |
| --- | --- | --- | --- |
| P1 | Resolved | Hub skip link changed the route to Today. It now preserves the current route, focuses the active content heading, and puts the next Tab inside that content. A main-landmark fallback covers a missing heading. | Keyboard verifier: skip/next-Tab checks at 1440/390/320. |
| P1 | Resolved | Profile drawer initially focused its backdrop outside the named dialog and exposed background content. It now focuses the close control inside the panel, wraps Tab within visible controls, and makes background regions inert until closed. | Keyboard verifier: drawer entry, wrap, inert and restoration checks. |
| P1 | Resolved | Editing/saving a medicine or deleting its focused action could leave focus on the body after rerender. Modal closure now returns to a surviving opener or active heading; deletion moves to a visible medicine action. | Keyboard verifier: save/edit/delete checks. |
| P1 | Resolved | Escape on a native dialog opened from the drawer could close both layers. Nested Escape now closes the top native dialog and returns to the still-open drawer. Dismissing sign-in returns outside the hidden drawer. | Keyboard verifier: nested privacy and drawer -> sign-in -> Escape checks. |
| P2 | Resolved | Medicine Delete text had 3.38:1 contrast on its light surface. The new `#9c3028` text is approximately 6.95:1 on `#f6f9ff`. | [Medicine before](screenshots/03-medicine-contrast-mobile-before.png), [after](screenshots/03-medicine-contrast-mobile-after.png); axe contrast finding eliminated. |
| P2 | Resolved | Long exact medicine names and source notes were squeezed into a narrow column beside actions. Mobile cards now put actions beneath readable medicine copy. | Fresh medicine screenshot pair: actual 427-character product `pharmac-fc6b1646362ed829` has 213px/283px copy columns at 320/390, versus 0px/61.64px before. The final 320px card ends at y=693, above bottom navigation at y=919. See durable `longest-medicine-evidence.json`. |
| P2 | Resolved | Dialog and answer-length focus rings were translucent; Health Memory's hidden checkbox had no painted focus indication. Rings are now opaque and the switch paints focus on its visible track, including forced colors. | [Dialog pair](screenshots/04-dialog-focus-mobile-after.png), [memory pair](screenshots/05-memory-focus-desktop-after.png), [answer-length pair](screenshots/06-answer-length-mobile-after.png). |
| P2 | Resolved | Switch, answer-length, medicine actions and footer actions had small targets. These controls now meet the project's 44px target. This is a project usability target, not a claim that WCAG AA universally requires 44px. | Keyboard verifier measures rendered targets at all three widths. |
| P2 | Resolved | At `/` with a 320 CSS-pixel viewport and WCAG text-spacing overrides, `.home-mobile-menu` reached x=322.1875 and document width became 322px. The menu edge/focus area could clip. Allowing the narrow header to wrap restores width to 320px and keeps the control in view. | Durable evidence: `text-spacing-home-before-320.png`, `text-spacing-home-after-320.png`, `header-and-forced-colors.json`; final regression repeats the overrides against shipped CSS. |

## Flow review

| Step | Surface and task | Health after patch |
| --- | --- | --- |
| 1 | Home: open Hub, navigate the four destinations, scan Pro entry, menu, footer and narrow text spacing | Passed; Aurora appearance retained. [Before](screenshots/01-home-mobile-before.png) / [after](screenshots/01-home-mobile-after.png). |
| 2 | Today: empty/current medicine summary, conditions, allergies, appointments, diary and record links | Passed; clear empty states and visible warning labels. [Before](screenshots/02-hub-mobile-before.png) / [after](screenshots/02-hub-mobile-after.png). |
| 3 | My Health: details, medicines, documents, measurements, history and Ask; Diary/appointments; Visit Prep; Profile; Alerts; Add Health Detail | Passed at 1440, 390 and 320 CSS px, with one active section, route state and heading focus preserved. Full captures are named `hub-*` in durable evidence. |
| 4 | Medicine: add, required-field validation, catalogue search, exact row selection, save, reopen, edit, delete and photo comparison | Passed. Source/label warnings remain readable; exact-product names wrap; controls stay reachable. [Medicine pair](screenshots/03-medicine-contrast-mobile-after.png). |
| 5 | Dialogs: medicine, health, symptom, appointment, measurement, visit brief, privacy, drawer and sign-in dismissal | Passed local checks. Sticky dialog headings remain usable; focused controls are never completely obscured during Tab traversal. [Dialog before](screenshots/04-dialog-focus-mobile-before.png) / [after](screenshots/04-dialog-focus-mobile-after.png). |
| 6 | Profile/Ask: Health Memory, answer-length arrows, focus indicators, drawer transitions and reduced motion | Passed. [Memory before](screenshots/05-memory-focus-desktop-before.png) / [after](screenshots/05-memory-focus-desktop-after.png); [answer length before](screenshots/06-answer-length-mobile-before.png) / [after](screenshots/06-answer-length-mobile-after.png). |
| 7 | Research, Pro, About, Download, Privacy, Terms, appointment checklist and medicine-list template | Local route/layout/axe checks passed. Signed-out Pro/error/empty states remained understandable. |

## Verification

- Axe-core 4.10.3, WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags: baseline 87 states, one serious contrast violation; after patch 105 states, zero violations, zero horizontal overflow, zero browser exceptions. After the last medicine layout adjustment, all 70 mobile states passed again. The final header adjustment also passed both 390/320 default-layout axe checks.
- Final dedicated accessibility browser verifier: **103 checks passed**, zero exceptions at 1440x1000, 390x844 and 320x844. Covers real Tab/Shift+Tab/Enter/Escape, required-field focus, focus after mutation, 44px targets, readable medicine copy, nested dialogs, text spacing, reduced CSS animation, and forced colors.
- Existing navigation browser verifier: **60 routes passed**, including Back/Forward, reload, legacy aliases, mobile menu exit/resize and keyboard activation of the red warning banner.
- JavaScript syntax: 104 files passed. Static site: 105 required files and 13 production pages passed. Five-tabs/navigation contract, local medication UI, medication evidence/cache contract, medicine identity, medicine photo contract/browser, Pharmac catalogue browser and PWA install asset checks passed.
- 640/320 CSS-pixel layouts were additionally sampled with 2x/4x pixel scaling as reflow equivalents for a 1280px desktop. WCAG text spacing used line-height 1.5, letter spacing .12em, word spacing .16em and paragraph margin 2em. Sustained decorative CSS animations were absent with reduced motion.

Reproduce keyboard verification in PowerShell:

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/verify-accessibility-browser.cjs
```

Reproduce the full 105-state axe matrix:

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:AXE_PATH='C:\Users\User\Documents\Codex\2026-10-15\task\overnight-a11y-evidence\axe-4.10.3.min.js'
$env:AUDIT_EVIDENCE_DIR='C:\Users\User\Documents\Codex\2026-10-15\task\overnight-a11y-evidence'
$env:AUDIT_PHASE='rerun'
node scripts/audit-accessibility-browser.cjs
```

Optional baseline reproduction for the interaction verifier: set `ACCESSIBILITY_BASELINE=1`, `ACCESSIBILITY_SOURCE_REF=3658f71` and `ACCESSIBILITY_EVIDENCE_DIR` to a separate output directory. Clear those variables for a final-patch verification.

## Remaining limits

No known P1/P2 defect from these local scenarios remains open. This is not full accessibility certification. Real NVDA/VoiceOver output and announcement timing, Safari/Firefox, native browser zoom controls, physical touch/camera behavior, hosted CSP/font delivery, and authenticated production/paid AI flows were not tested. Local fixtures block external requests and use invented health entries; warning-state captures are explicitly synthetic. Native dialogs may cycle through browser chrome; checks assess focused page controls. The raw small-target heuristic also lists inline prose links and visually hidden native inputs, which are not treated as standalone failures without context.

No medicine data/rule, auth/storage configuration or credential changes are part of this patch. Cache references are `accessibility.css?v=15`, `hub-aurora-secondary.css?v=4`, `health-hub.js?v=106` and shell `v177`.
