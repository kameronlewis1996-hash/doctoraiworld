# DoctorAI visual audit — 30 October 2026

Draft review evidence for the advertising-readiness branch. All Health Hub records and API responses used for this audit were fictional; this is local Chromium rendering, not production or physical-device testing. External fonts and third-party requests were blocked, so screenshots use fallback fonts.

## Route and state coverage

The automated first-viewport sweep loaded each route below at 320, 360, 375, 390, 412, 768 and 1440 CSS pixels. Initial and final screenshots were captured at 320, 390 and 1440; additional final screenshots cover the other four widths. The initial sweep detected one horizontal page overflow: appointment checklist at 320 pixels. The first post-fix 19-route sweep reported none. The extended 26-route sweep also reported no page overflow or broken visible images, but was captured before the final history-filter adjustment; the targeted regression captures that adjustment separately.

| Route group | Locally rendered states | Limit |
| --- | --- | --- |
| Home, About, subscription, Privacy, Terms, Download and Research | Signed-out first viewport; subscription review dialog with fictional prices | No live checkout, real account, or independent preview inspection |
| Appointment checklist and medication-list template | Initial page and resource navigation | No real personal entries or external sharing |
| Professional brief demo, mobile sign-in and staff | Demo, invalid sign-in request, and restricted staff state | Real authenticated staff and mobile sign-in not exercised |
| Hub: My Health, Medication, Visit Prep, Profile, Add, Diary and Alerts | Signed-out empty states at all widths | Saved account data and actual clinical evaluation not inspected |
| Hub: Ask, Documents, Appointments, Results, Symptoms, History and Scan | Signed-out initial views at all widths | Real uploads, AI responses, scanner camera and paid entitlements not exercised |
| Medication record, form, profile drawer, privacy, sign-in and subscription dialogs | Fictional long medication label and local dialogs at 320×568, 390×844, 568×320 and 720×450 | These viewports do not prove behaviour on a physical phone or at browser 200% zoom |

## Findings and changes

1. **Appointment checklist header, 320px.** The “Open appointments” link extended past the right edge. The navigation now wraps below the logo at narrow widths, retains both links, and uses at least 44px targets. The public journey regression checks bounds and focus at all seven widths.
2. **Health history, 320px.** The horizontal filter row clipped the third label and concealed later filters without an obvious cue. The five filter buttons now wrap at small widths; the regression checks their bounds, minimum height and selection at 320 and 390px.
3. **Hub dialogs and account drawer.** These surfaces rendered white against My Health's blue panels. They now use the same pale blue surface as the subscription review, with white form fields and existing warning colours retained. The forced-colours rule uses system colours.
4. **Account drawer, 320px.** “Sign in” wrapped onto two lines. It now stays on one line inside the drawer; the accessibility regression checks this at each tested width.

Reviewable synthetic screenshots: [checklist before](visual-evidence/checklist-before-320.png), [checklist after](visual-evidence/checklist-after-320.png), [history before](visual-evidence/history-before-320.png), [history after](visual-evidence/history-after-320.png), [medicine dialog](visual-evidence/medicine-dialog-after-320.png) and [account drawer](visual-evidence/drawer-after-320.png). The after-history image has the Appointments filter selected for the interaction check.

Synthetic long labels wrapped without page overflow in the sampled medicine view. The short landscape form, drawer and review dialogs remained inside the viewport with scrollable content. The subscription review at 320px requires scrolling to reach Continue; its price, renewal and consent remain available. No camera, upload or checkout session was started.

## Remaining review

The screenshots cover sampled initial views and the named local states, not every populated, loading, error, keyboard, safe-area or nested interaction. Browser 200% zoom, screen-reader behaviour, physical Android/iPhone devices, authenticated production flows and independent protected-preview review remain open. A 720px viewport is only a reflow approximation, not proof of browser zoom. Validate contrast and touch targets on actual devices. Review the exact CI and preview for the final commit before any separate production decision.
