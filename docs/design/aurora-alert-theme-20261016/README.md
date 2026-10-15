# Selected aurora theme and alert presentation

The user selected the attached centred aurora homepage with the exact heading “Your health, with a little more clarity.” This implementation keeps the existing canonical raster logo, DM Sans, routes, forms, privacy choices and alert engine.

## Behaviour

- Public homepage: calm cyan/lilac/blush background, 84% logo opacity, optional float/tilt motion, one clear Add Health Detail action and Scan medication / Pro immediately below.
- The four direct links are Today, My Health, Visit Prep and Profile. On small screens the glass dock becomes two columns. All four work without JavaScript.
- Health Hub: the same background palette follows the existing `DoctorAIAlertStatus.describe()` result through `body.dataset.healthAlertLevel`. Orange means review/limited or unassessed checks; red is high/urgent/critical. The existing wording distinguishes professional review from urgent medical help.
- Neutral and green retain the calm palette. A calm background is not a safety judgement. Empty records, unavailable results and exceptions clear stale warning tints. No status is stored or sent anywhere.
- Existing Today symbols and summaries beside medicines remain the non-colour indication. Decorative route icons and headings share one restrained blue; cyan/lilac are confined to the atmospheric background. Orange/red remain reserved for clinical warnings.

## Scope and integration

Based on fetched main `09c0353dfcb29754f62fb7e9116b87f5ef31a3e1`, in an isolated worktree/branch `codex/aurora-alert-theme-20261016`. The draft branch now also integrates the separate PR75 head `6f5fc90ebcf609c241c3023bf4b43525a22e5b36` so the preview contains its Today, terminology, storage and visit-prep work alongside this presentation.

Aurora presentation files include `index.html`, `welcome.js`, `aurora-theme.css`, `health-alert-status.js`, `health-hub.html`, `health-hub.js`, `hub-category-themes.css`, `accessibility.css`, and `service-worker.js` (combined cache v157 and current asset tags). The shared accessibility stylesheet tag is v14 across the HTML pages; category tokens are in `hub-category-themes.css?v=3` and the aurora layer is v7. The `health-hub.js?v=95` update also makes medicine-history deletion semantics explicit. PR75 additionally brings its own catalogue, Today, visit-prep, storage and verification files into this integrated draft; see its commit history and readiness note for that distinct functional scope.

The aurora presentation itself changes no medication rules, API, authentication, subscription logic, About content, footer content or Vercel routing. The integrated PR75 parent does add catalogue/importer and other functional files. No production deployment or main-branch merge was performed. The medication-evidence verifier's cache assertion was reconciled to the combined shell and asset versions.

When integrating subsequent medication release work, preserve its data, rules and cache versions; do not overwrite them with this draft's older snapshot. Re-run static and medication checks after that reconciliation.

## Verification

- JavaScript syntax: 82 files passed on the combined branch.
- Alert engine: 76 fictional fixtures passed.
- Alert status: 15 checks passed, including real-result severity transitions, high/urgent wording, failure/empty reset, three Today badge locations, accessible names and category preservation.
- Actual alert renderer: 12 presentation checks passed.
- Four-tab routes and record-preparation checks passed.
- Static verification: 93 required files and 12 production pages passed on the combined branch.
- Browser: the aurora-only preview was checked at six widths from 320 to 1487 CSS px without horizontal overflow, including direct category routes, Add Health Detail, motion pause/resume, mobile menu and Escape/focus return, and no-JavaScript links/static logo. The combined worktree with the blue-icon correction was inspected at desktop 1487 × 1058 and mobile 390 × 844, with no horizontal overflow at mobile width. Route, chooser and Profile icons were measured blue; synthetic orange/red Today states retained their separate text and symbols. A final v7 pass compared the selected reference with richer, smaller edge glows at those same two viewport sizes; the central reading area, heading and controls remained clear, and desktop/mobile scroll widths stayed within their viewports. The added gradients are static; the existing reduced-motion guard is unchanged. Real-device mobile acceptance remains open.
- Earlier axe WCAG 2/2.1 A/AA homepage scan: zero violations, 26 rules passed. Gradient and pseudo-element backgrounds require manual contrast assessment; earlier token checks are in `contrast.json` (minimum sampled conservative combination 4.51:1). The v7 gradient placement was visually inspected but has no new pixel-level contrast measurement or axe rerun. This is not a screen-reader audit or WCAG certification.
- No application console errors observed. The connected browser reports an unrelated wallet-extension injection error (`chrome-extension://.../evmAsk.js`); no app source is involved.

Browser previews use synthetic presentation results only; no personal records or live clinical service calls. Authentication/entitlement responses are local test stubs. Backend, scanning and billing were not exercised by this presentation change. The saved screenshots below predate the final palette/icon refresh. Fresh final desktop/mobile captures, Profile and Add Health Detail colours, and synthetic orange/red Today states were inspected live from the combined worktree. Screenshot export was explicitly blocked, so those current captures appear only in the browser QA output; they were not saved into this repository. The [labelled walkthrough](demo-walkthrough-20261016.md) records exact dimensions and the visual comparison.

The [combined-build fictional journey](../aurora-fictional-journey-20261016.md) completed a selected two-record visit brief and exposed an ambiguous generated medicine-history item after single-medicine deletion. The follow-up change links newly generated list-change events to the saved medicine, removes only those linked events on deletion, labels retained older/user-authored medicine notes as historical in Timeline and Visit Prep, and provides an explicit history-entry delete action. Regression checks cover this distinction and full-data deletion of both history kinds. A fresh browser rerun is recorded separately in the journey note; no broad device-data purge was used for that browser journey.

## Evidence

- `desktop-stitched.jpg`: 1472 × 1058 composition assembled from two in-app browser captures at CSS viewport 1487 × 1058; the 15px difference is the scrollbar. Original visible captures were 1472 × 866. Below-fold sections stay in the page.
- `mobile.jpg`: 375 × 812 browser content at CSS viewport 390 × 844; cropped browser content reflects the available capture surface.
- `theme-states.jpg`: calm homepage, orange Today and red Today. Warning states are explicitly labelled synthetic in the preview.
- `alert-red-mobile.jpg`: professional-review status beside the medicine list.
- `responsive.json` and `contrast.json`: measured sizes and contrast calculations.

OS reduced-motion and forced-colour emulation, real-device checks and screen-reader testing were unavailable through this browser interface. CSS and existing motion preference guards are retained. The inline reference attachment is the visual truth; no local copy of the user's original image was available to export.
