# Selected aurora theme and alert presentation

The user selected the attached centred aurora homepage with the exact heading “Your health, with a little more clarity.” This implementation keeps the existing canonical raster logo, DM Sans, routes, forms, privacy choices and alert engine.

## Behaviour

- Public homepage: calm cyan/lilac/blush background, 84% logo opacity, optional float/tilt motion, one clear Add Health Detail action and Scan medication / Pro immediately below.
- The four direct links are Today, My Health, Visit Prep and Profile. On small screens the glass dock becomes two columns. All four work without JavaScript.
- Health Hub: the same background palette follows the existing `DoctorAIAlertStatus.describe()` result through `body.dataset.healthAlertLevel`. Orange means review/limited or unassessed checks; red is high/urgent/critical. The existing wording distinguishes professional review from urgent medical help.
- Neutral and green retain the calm palette. A calm background is not a safety judgement. Empty records, unavailable results and exceptions clear stale warning tints. No status is stored or sent anywhere.
- Existing Today symbols and summaries beside medicines remain the non-colour indication. Category identities stay blue/cyan/lilac family regardless of alert severity. The blue logo and primary actions remain consistent.

## Scope and integration

Based on fetched main `09c0353dfcb29754f62fb7e9116b87f5ef31a3e1`, in an isolated worktree/branch `codex/aurora-alert-theme-20261016`. The draft branch now also integrates the separate PR75 head `6f5fc90ebcf609c241c3023bf4b43525a22e5b36` so the preview contains its Today, terminology, storage and visit-prep work alongside this presentation.

Aurora presentation files include `index.html`, `welcome.js`, `aurora-theme.css`, `health-alert-status.js`, `health-hub.html`, `health-hub.js` (the Add Health Detail heading label), `hub-category-themes.css`, `accessibility.css`, and `service-worker.js` (combined cache v153 and current asset tags). The shared accessibility stylesheet tag is v13 across the HTML pages; category tokens are in `hub-category-themes.css?v=2` and the aurora layer is v3. PR75 additionally brings its own catalogue, Today, visit-prep, storage and verification files into this integrated draft; see its commit history and readiness note for that distinct functional scope.

The aurora presentation itself changes no medication rules, API, authentication, subscription logic, About content, footer content or Vercel routing. The integrated PR75 parent does add catalogue/importer and other functional files. No production deployment or main-branch merge was performed. The medication-evidence verifier's cache assertion was reconciled to the combined shell and asset versions.

When integrating subsequent medication release work, preserve its data, rules and cache versions; do not overwrite them with this draft's older snapshot. Re-run static and medication checks after that reconciliation.

## Verification

- JavaScript syntax: 82 files passed on the combined branch.
- Alert engine: 76 fictional fixtures passed.
- Alert status: 15 checks passed, including real-result severity transitions, high/urgent wording, failure/empty reset, three Today badge locations, accessible names and category preservation.
- Actual alert renderer: 12 presentation checks passed.
- Four-tab routes and record-preparation checks passed.
- Static verification: 93 required files and 12 production pages passed on the combined branch.
- Browser: the aurora-only preview was checked at six widths from 320 to 1487 CSS px without horizontal overflow, including direct category routes, Add Health Detail, motion pause/resume, mobile menu and Escape/focus return, and no-JavaScript links/static logo. After integrating PR75, the fresh combined preview was inspected at desktop width for the homepage, matching route heading/nav colours and synthetic orange/red Today states. PR75's own preview notes document a separate 320/390px responsive pass; the combined branch still needs real-device mobile acceptance.
- axe WCAG 2/2.1 A/AA homepage scan: zero violations, 26 rules passed. Gradient and pseudo-element backgrounds require manual contrast assessment; token checks are in `contrast.json` (minimum sampled conservative combination 4.51:1). This is not a screen-reader audit or WCAG certification.
- No application console errors observed. The connected browser reports an unrelated wallet-extension injection error (`chrome-extension://.../evmAsk.js`); no app source is involved.

Browser previews use synthetic presentation results only; no personal records or live clinical service calls. Authentication/entitlement responses are local test stubs. Backend, scanning and billing were not exercised by this presentation change. The saved screenshots below predate the final palette/icon refresh. The refreshed desktop/mobile aurora layout, four Hub routes and Add Health Detail chooser were inspected live before PR75 integration; the combined desktop homepage, route colours and synthetic orange/red Today states were inspected afterward. The browser interface did not provide a supported way to save those current captures to the repository.

The [combined-build fictional journey](../aurora-fictional-journey-20261016.md) completed a selected two-record visit brief. Deleting the synthetic active medicine and diary entry left the medicine's generated history item available to later briefs. This is a functional cleanup limitation outside the aurora styling; the broad device-data purge was not used.

## Evidence

- `desktop-stitched.jpg`: 1472 × 1058 composition assembled from two in-app browser captures at CSS viewport 1487 × 1058; the 15px difference is the scrollbar. Original visible captures were 1472 × 866. Below-fold sections stay in the page.
- `mobile.jpg`: 375 × 812 browser content at CSS viewport 390 × 844; cropped browser content reflects the available capture surface.
- `theme-states.jpg`: calm homepage, orange Today and red Today. Warning states are explicitly labelled synthetic in the preview.
- `alert-red-mobile.jpg`: professional-review status beside the medicine list.
- `responsive.json` and `contrast.json`: measured sizes and contrast calculations.

OS reduced-motion and forced-colour emulation, real-device checks and screen-reader testing were unavailable through this browser interface. CSS and existing motion preference guards are retained. The inline reference attachment is the visual truth; no local copy of the user's original image was available to export.
