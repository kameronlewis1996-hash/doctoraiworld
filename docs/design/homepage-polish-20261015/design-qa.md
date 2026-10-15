# DoctorAI homepage polish — 15 October 2026

final result: passed

## Scope and visual source

- Source visual truth: the live DoctorAI homepage at https://www.doctoraiworld.com/, main commit `01543ec14d82f8334a59d91d4fb4e3fd94f2dfc0`; original supplied DoctorAI marks and established category tokens. Existing DoctorAI Canva brand material was inspected read-only as a secondary reference.
- Implementation: isolated branch `codex/doctorai-homepage-polish-20261015`, served locally with the repository's production CSP.
- Product files: `index.html`, `welcome.css`, `welcome.js`. The medication, alert engine, Health Hub, About page, authentication, billing, APIs, storage and release configuration are inherited unchanged from main.
- State: public homepage, Today selected, no account or health record. Intentional changes are shorter copy, a framed tour, clearer selected state, full-card links, mobile navigation and a founder FAQ. This is an improvement of the existing direction, not a pixel clone.
- Original evidence is in the task's `site-polish-evidence/` directory. Screenshots are JPEG; display comparisons normalize equal widths without stretching.

## Visual evidence

- [Desktop implementation](desktop.jpg): CSS viewport 1440 × 1000, DPR 1; browser capture content 1425 × 866 pixels. The browser capture omits scrollbar/window regions.
- [Mobile implementation](mobile.jpg): CSS viewport 390 × 844, DPR 1; browser capture content 375 × 812 pixels.
- [Full-page side-by-side comparison](comparison.jpg): original on the left, implementation on the right; both full-page captures are normalized to 600px width within a 1200px-wide comparison. Desktop first-screen captures were also compared side by side at equal dimensions (1425 × 866, normalized to 720px each) in the task evidence.
- Focused mobile tour, category-card keyboard focus and expanded FAQ were inspected in the connected in-app browser. The new category cards keep their proper colours and readable heading/copy alignment.

## Required fidelity surfaces

- Typography: existing DM Sans body/UI and Newsreader italic headings retained. Heading hierarchy, line wrapping, body copy and mobile header label were inspected. Compact header says “Open Hub” at narrow widths.
- Layout: desktop two-column hero retained. The tour now sits within one white frame. Mobile uses a two-column grid for all four controls, with no absolute chip positioning. Cards have generous padding and full anchor targets.
- Colour: Today `#0759b6`, My Health `#176b60`, Visit Prep `#805418`, Profile `#65439b`, with existing light surfaces. Category colours remain separate from the clinical severity system. The logo remains at 84% opacity.
- Assets: canonical supplied raster marks reused, with native proportions and transparency. The established icon renderer is retained. No replacement logo, video, generated stock imagery or paid generation was used.
- Content: Add Health Detail and Scan medication / Pro remain prominent. Free core hub, optional Pro scanning, explicit brief selection, separate account syncing and organisation/education limitations remain accurate. Founder FAQ matches the released About page.

## Findings and fixes

1. P2, fixed: full-card anchors initially named only their heading while showing additional text. Removed the restrictive accessible-name override; the anchors now expose their natural visible text. Post-fix axe scan passed.
2. P2, fixed: the labelled generic feature-strip div lacked a supporting semantic role. Added `role="group"`. Post-fix scan has no unresolved ARIA checks.
3. P2, fixed: orbit artwork overlapped the toolbar/caption bounds and prevented automatic contrast evaluation. Confined the artwork to its own space and sized the rings to fit. Final desktop/mobile scans have no unresolved contrast checks; the final render was recaptured and inspected.
4. P2, fixed: the narrow header action could wrap awkwardly beside the menu. It now has a compact mobile label while the desktop label remains “Open Health Hub”.

No actionable P0/P1/P2 findings remain in the reviewed scope. Changes in card borders, framing and page height are intentional improvements.

## Browser verification

- Connected Codex in-app browser: 320, 390, 640, 768, 1024 and 1440px CSS widths. No horizontal overflow; tour controls remain within the viewport. At 320px each tour control is approximately 55px tall and its text is not clipped. Menu summary is at least 44px tall.
- All four tour states: exactly one pressed button, visible selected check, correct changing kicker, heading/copy and existing destination link. Category colours retained.
- Pause/resume verified against actual computed animation state. Existing reduced-motion CSS, pointer guards, offscreen/hidden-tab pausing and preference listener retained. OS-level reduced-motion and forced-colour emulation were not available in this browser interface; no new motion is introduced.
- Native mobile menu: opening, in-page link dismissal, Escape closure/focus return and no-JavaScript operation checked. Full-card keyboard focus is visible. FAQ opens/closes normally.
- No-JavaScript source fixture: all application scripts removed by the local server; native menu, four destination links, Add/Scan links and static logo remain usable. No tour controls are exposed without their handler.
- axe-core WCAG 2 A/AA + 2.1 A/AA: final desktop and mobile each report **0 violations, 0 incomplete checks, 26 passed rules**. This is a scoped automated check, not a WCAG certification.
- No browser console errors were returned. The QA-only axe harness emitted preload warnings under the production CSP during earlier runs; those are not application errors and the final scans completed.

## Source verification

- JavaScript syntax: passed (74 files).
- Static-site verification: passed (80 required files, 11 production pages).
- Four main destination/navigation/consent/auth contracts: passed.
- Record preparation: passed.
- About route and all three footer contracts: passed.
- `git diff --check`: passed.
- Read-only independent review of the three product-file diff found no concrete route, accessibility or factual regressions.

## Limits and release state

Screenshots and interaction checks are local-source evidence. Real-device testing, manual screen-reader testing and authenticated workflows are outside this homepage change. No real health data, AI calls, OCR request, payment or credential operation was used. Production publication requires a later release decision; this branch is a review candidate only.
