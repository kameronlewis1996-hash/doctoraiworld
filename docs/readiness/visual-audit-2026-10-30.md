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

## Follow-up: below the fold, sources and failure states

An additional local sweep captured full-page and bottom-of-page screenshots for the 26 route snapshots at 390 and 1440 CSS pixels. The 390px bottom-view contact sheet was inspected, along with individual Hub and resource screenshots. The screenshot utility renders fixed navigation at the current scroll position; a full-page image should not be read as proof that navigation stays in one position throughout a real scroll. The only additional filter defect found in this pass was in Documents: at 320px, “Results” was clipped and “Letters” was hidden in a horizontal row. The four buttons now wrap, retain 44px targets and remain selectable. [Before](visual-evidence/documents-before-320.png) and [after](visual-evidence/documents-after-320.png).

Synthetic delayed or failed sign-in and pricing responses were also rendered. The session gate now uses the Hub blue surface; saved information remains hidden while verification is unavailable. Checkout remained disabled while pricing loaded or failed. See [sign-in loading](visual-evidence/auth-loading-320.png), sign-in error [before](visual-evidence/auth-error-before-320.png) and [after](visual-evidence/auth-error-after-320.png), [pricing loading](visual-evidence/pricing-loading-320.png), and [pricing error](visual-evidence/pricing-error-320.png). These are simulated responses and contain no real account or payment information.

The route groups use existing DoctorAI blue/cyan backgrounds and existing logo assets, with compact stacked marks in the Hub and resource headers and wider horizontal treatments on public pages; their image boxes and headers are not identical in size. Inputs remain light for readability and warning colours remain distinct. Full uniformity and contrast are not certified by this comparison. DM Sans and Newsreader are declared by the pages but are not bundled or installed in this executor. Google Fonts was blocked by the environment's network policy, so the font files and their final rendered metrics could not be verified; all local screenshots use fallbacks. Confirm the declared fonts and compare logo, text and controls in the authorised protected preview without changing its access settings.

For reproducibility, the 390px fallback-font capture measured the logo image element boxes as 130×87px for the home/About wordmark image, 176×118px for subscription/Privacy, 104×56px for the checklist, 98×56px for the medication template, and 130×64px for the Hub header image. Some are cropped by their parent, so these measurements are not the visible wordmark dimensions. The local review found the same blue/cyan background family across route groups, with intentionally distinct header treatments and content scales; it does not establish pixel-identical components across all pages. Buttons, warning cards, and form fields were inspected in the captured states, with focused bounds tests for the changed controls. A real-font comparison is still required.

## Final focused review

The Documents Pro link's arrow previously wrapped onto its own line at 320px. The label and arrow now use one inline row; a local regression checks the actual text and arrow bounds at 320 and 390px. See [the final 320px capture](visual-evidence/documents-pro-link-after-320.png). The home and About footers used a stacked logo treatment while other public pages used the official head mark with a text lockup. They now use the existing public-page footer treatment with a 42×42px mark; header branding and footer destinations retain their prior roles. See [the final home footer](visual-evidence/footer-home-after-390.png).

The translucent bottom navigation can visually overlap content during scrolling. The local clearance regression checks every currently visible interactive control in 14 signed-out Hub routes at 320×568, 390×844 and 568×320, plus the last visible control at scroll end: 42 synthetic cases passed. Closed disclosures and real populated account data are outside that pass. The stylesheet contains safe-area inset handling, but this browser fixture reports no real device inset; physical-device safe-area testing is still required.

The earlier `followup-2026-10-30.zip` contains **four** document/sign-in before-and-after PNGs and a readme, not the full-page sweep. The separate `final-after-2026-10-30.zip` contains the two final PNGs above and a readme. The full-page captures are not included in either bundle; the [390px bottom-view contact sheet](visual-evidence/routes-bottom-390.jpg) is available separately.

## Remaining review

The screenshots cover sampled initial views and the named local states, not every populated, loading, error, keyboard, safe-area or nested interaction. Browser 200% zoom, screen-reader behaviour, physical Android/iPhone devices, authenticated production flows and independent protected-preview review remain open. A 720px viewport is only a reflow approximation, not proof of browser zoom. Validate contrast and touch targets on actual devices. Review the exact CI and preview for the final commit before any separate production decision.
