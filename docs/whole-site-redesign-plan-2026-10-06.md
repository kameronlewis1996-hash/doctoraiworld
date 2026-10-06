# DoctorAI World whole-site redesign plan — 6 October 2026

Status: implemented and regression-checked; ready for the existing private preview branch.

## Source and goal

This plan follows the detailed October 6 meeting directions in the user's instruction. I did not find a separate notes document in the Doctor AI Library folder, Google Drive's recent files, or accessible meeting-notes Pages. The intended product promise is clear preparation: help people organise the health information they choose to bring to a visit, so they and their care team have a clearer starting point. The visit brief is the primary value. Medication scanning and the DoctorAI-owned medicine reference data support that journey.

Keep the site calm, premium, direct, and easy to use on a phone. Do not promise time or money savings, fewer visits, diagnoses, treatment advice, or complete interaction coverage.

## Page-by-page plan

| Page or route | Current role and audit finding | Planned change |
|---|---|---|
| Public home (`index.html`, `welcome.css`, `welcome.js`) | Current hero says “Organise your health details” but its mock dashboard promotes a symptom log alongside medicines, documents, and appointments. The page repeats symptoms and pattern tracking as the first two “how it works” steps. | Make a reviewed visit brief the single lead benefit. Show medicines, allergies, appointment details, questions, and optional notes as the information a person can choose to bring together. Keep a clear free-start CTA and a secondary Pro link. Move Research out of primary navigation. Keep the medical-scope and privacy disclosures. |
| Shared site navigation and footer (`index.html`, public resource pages, `subscription.html`, shared shell assets) | Navigation differs by page; Research is a prominent destination on several pages. | Use a consistent compact header: Home, How it works, Pro, Sign in, and Open Health Hub. Keep research and secondary tools in the footer or a secondary resources area. Preserve all existing URLs and useful resource links. |
| Onboarding and sign-in (`/health-hub`, `mobile-auth.html`, `mobile-auth.js`, Health Hub sign-in modal) | A new visitor sees a browser-storage choice. The Health Hub can be used without signing in; account sync is separate. Opening `mobile-auth.html` without the native-app state/return parameters correctly shows an invalid-request message. | Explain the guest start and storage choice in plain language, show that signing in is optional and for the user's own workspace, and make return/back actions clear. Preserve OAuth state and return validation, account isolation, and privacy controls. Do not imply sign-in is configured when it is not. |
| Signed-in/guest overview (`health-hub.html`, `health-hub.css`, `health-hub.js`) | “Today” currently exposes nine sidebar destinations plus a symptom diary card, a separate observations panel, a medication card, and a Research link. The visit-brief CTA exists but competes with other tasks. | Reorder the overview around visit preparation: an upcoming visit or empty state, a clear “Build my visit brief” action, and small status summaries for medicines and profile/allergies. Put optional symptoms/routine notes inside preparation. Group secondary existing tools under “More” without deleting routes or saved data. Keep device/session storage and safety language intact. |
| Visit preparation and brief (`view-appointments`, `openCareSummary` in `health-hub.js`) | Appointment records and the summary builder exist. The summary already supports selection, review, copy, and browser print/PDF. | Make this the main journey. Bring appointments, the user's main concern/questions, medicines, profile allergies, and optional symptoms/routine notes into one clear review. Preserve per-item selection and the explicit review-before-copy/print step. Do not automatically send the brief or add new data sharing. |
| Medicines and scan review (`view-medications`, `health-hub.html`, `health-hub.css`, `health-hub.js`) | A working medication list and consented scan pipeline exist. The current branch adds a separate pending scan review, uncertainty highlights, and final confirmation. | Keep the clear list and existing DoctorAI-owned lookup visible as support for preparation. Keep scan secondary to the overall appointment task. Preserve image consent, field correction, cancellation/back, final confirmation, and the limited-coverage warnings. No OCR or medicine-check behavior changes are planned. |
| Profile and allergies (`view-health`, account/profile settings) | Allergies, conditions, and emergency details are stored in the existing health profile. The medication page links to that profile. | Surface allergies/reactions in the preparation context and make profile editing easy to find. Keep values user-entered and editable; never infer “none” from a blank field. Preserve export, deletion, storage, and Health Memory choices. |
| Pro and account surfaces (`subscription.html`, `subscription.css`, `subscription.js`, profile drawer) | The Pro page covers appointments, documents, scanning, and other tools. It currently says “Pro pays for itself when it saves one stressful hour,” which is an unsupported savings claim. | Reorder benefits around preparation and organisation, distinguish actual Free/Pro features in plain language, and remove savings claims. Preserve the current prices, Stripe flows, cancellation and billing controls, eligibility copy, and current feature gates. Do not claim new services. |
| Free appointment checklist (`appointment-checklist.html/.css/.js`) | A detailed printable/interactive resource exists with source notes, local-only fields, print/share choices, and opt-in analytics. | Match the site hierarchy and typography, make the path back to the Health Hub/visit brief clear, retain the source/scope disclosure and local-only behavior, and preserve analytics consent. |
| Free medication-list template (`medication-list-template.html/.css/.js`) | A detailed printable list and local medicine-name lookup exist with explicit limitations. | Keep it as a supporting resource, visually align it with the main preparation flow, and link it to the visit brief. Preserve the local lookup, source/license attribution, print/export, and limited-coverage warnings. |
| Research and standalone symptom view (`research.html/.css/.js`, `view-symptoms`) | Research and Symptom Diary are presented as primary product destinations. | Remove both from the primary journey and main navigation. Keep the Research page available as a secondary resource. Preserve all existing symptom entries; expose useful optional symptoms/routine notes within visit preparation and the reviewed brief. Do not migrate, clear, or rewrite stored records. |
| Privacy, terms, app download, and support (`privacy.html`, `terms.html`, `download.html`) | These contain important data-use, medical-scope, account, storage, and app availability information. | Keep their meaning and current disclosures. Align only shared layout/navigation. Update privacy text only if implementation changes data flows; the planned redesign adds none. Keep app availability and support links honest. |

## Boundaries

- No schema, storage, API, account, authentication, Health Memory, OCR, medication rules, consent, or billing changes.
- No deletion or migration of existing user information or routes.
- No pricing changes, production deploy, merge, or public release. Preview updates remain on the existing private PR54 branch.
- Use only existing product capabilities and local synthetic test data. Do not test with real accounts or real health information.

## Verification plan

- Capture and inspect public home, sign-in entry, Health Hub overview, medicines/scan review, profile/allergies, appointment preparation/brief, Pro/account, checklist, and medication-list pages at phone and desktop widths.
- Exercise the existing summary selection, review, copy, and print controls with synthetic data. Confirm optional notes and allergies remain user-controlled and do not get sent automatically.
- Exercise guest and mocked-account transitions with network/API mocks; preserve consent and per-account separation. Do not call real OCR, Google sign-in, billing, or health-state services.
- Run JavaScript syntax, medication/safety/account regression checks, static-site verification where the runner is available, and responsive/keyboard checks. Recheck the protected preview deployment SHA after each push.

## Current audit evidence

Screenshots and route inventory from the pre-change audit are in `doctorai-design-preview/whole-site-audit/current/`. At 390 px and 1440 px the public home, checklist, medication-list, subscription, privacy, and Health Hub shell rendered without horizontal overflow. Direct `mobile-auth.html` access without a valid native-app handoff correctly displayed an invalid-request state. External Google/font requests were blocked in the isolated local capture; the signed-in view and live OAuth handoff remain unverified.

## Implementation completed

The redesign was implemented on the existing `codex/doctorai-integrated-medication-flow-20261006` branch. The public home and shared navigation now lead with visit preparation; the Health Hub presents Visit prep, Appointments, Medicines, and My Health as its four primary destinations, with existing Research and optional tools retained in secondary navigation. Visit prep brings user-selected medicines, self-reported allergies/reactions, appointment details, questions, and an ephemeral optional note into an editable review before copy/print. Pro language was updated to reflect existing Free and Pro capabilities without savings claims. Supporting resources now link back to visit preparation.

No data schema, persistence model, API, auth, OCR, medicine rules, consent, account, feature gate, price, or billing flow was changed. Research and symptom records/routes remain available. No production release or merge was performed.

## Verification outcome

- `pnpm run check:js` passed.
- The scan, server, medication database, medication safety, medication pipeline, medication evidence, medication check controller, medication login, local medication UI, and retired-provider verification scripts passed.
- `node scripts/verify-stripe-pricing.js` passed.
- Local Playwright checks passed at 390×844 and 1440×900 for the public home, Health Hub navigation, secondary Research access, Pro page, overflow, session-only synthetic medicine/allergy/appointment data, and editable reviewed visit brief with optional note. API and third-party requests were blocked or safely mocked; no live account, OCR, or billing flow was used. Screenshots and the machine-readable test report are in `/workspace/doctorai-design-preview/whole-site-audit/redesigned/`.
- `git diff --check` passed.
- `pnpm run verify:static` remains unavailable in this environment because its PowerShell runner (`pwsh`) is not installed.
- Live protected-preview readiness still requires checking the deployment status after the branch push; GitHub CLI PR metadata was unavailable due to an API `Forbidden` response during the initial read.
