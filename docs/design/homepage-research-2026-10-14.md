# DoctorAI homepage research and source audit — 14 October 2026

## Goal and scope

Make the existing DoctorAI website more distinctive while retaining its purpose: one useful place for people to organise health details and prepare the information they choose to bring to a care conversation.

The user requested 20 minutes of research before implementation. Research began at 20:01:53 and concluded at 20:23:55 NZDT on 14 October 2026 (22 minutes, 2 seconds). It included official product material from eight health products, healthcare communication guidance, design standards, primary research, source review and challenge reviews. This is desk research and a source audit; it is not a user study or a visual audit of DoctorAI.

Implementation starts from production source `3901b28e60c0a3ffba14c6472b9f56a87e754c5c`. The original worktree with user changes was preserved. This change covers the public homepage, its stylesheet and cache/version references. The Health Hub's application logic and four main destinations are unchanged.

## Product research

Published features below are the products' own descriptions, not independently verified outcomes or capabilities available in DoctorAI.

| Official source | Useful observation | DoctorAI decision |
| --- | --- | --- |
| [Guava visit preparation](https://guavahealth.com/prepare-for-visits) | Makes a downloadable/printable visit summary a concrete product outcome. | Make a readable, labelled example visit brief the signature visual. Preserve DoctorAI's explicit selection and review flow. |
| [MyChart sharing](https://www.mychart.org/l/en-us/features/share/) | Distinguishes information sources and different ways of sharing records. | Describe personal saved details clearly; do not imply provider exchange or a complete clinical record. |
| [Patients Know Best](https://patientsknowbest.com/patients-and-carers/) | Explains one-place organisation alongside granular control and provider-dependent availability. | Show breadth through a few familiar tasks and specific controls. |
| [Apple Health privacy](https://www.apple.com/legal/privacy/data/en/health-app/) and [sharing controls](https://support.apple.com/en-euro/guide/iphone/iph5ede58c3d/ios) | Explains selecting, reviewing and changing shared categories. | Put selection and review beside the brief. Do not equate copying/printing with ongoing or revocable sharing. |
| [NHS App features](https://digital.nhs.uk/services/nhs-app/nhs-app-features) | Uses literal tasks and qualifies provider-dependent services. | Use the actual Today, My health, Visit prep and Profile names and working links. |
| [Bearable](https://bearable.app/) | Emphasises low-effort recording and remembering. | Invite a small first action rather than suggesting a complete profile is required. |
| [My Health Record access](https://www.digitalhealth.gov.au/initiatives-and-programs/my-health-record/manage-your-record/privacy-and-access) | Explains distinct record, document and representative controls. | Explain actual device/session and brief-selection choices without broad security claims. |
| [Manage My Health](https://managemyhealth.co.nz/how-it-works/) and [FAQs](https://managemyhealth.co.nz/faqs/) | Separates personal information from provider-linked records and services. | Position DoctorAI around the person's own organisation and preparation; imply no clinical-system integration. |

## Evidence that influenced the design

- [NHS service standard](https://service-manual.nhs.uk/standards-and-technology/service-standard-points/4-make-the-service-simple-to-use) and [Health Literacy Online homepage guidance](https://odphp.health.gov/healthliteracyonline/simplify-navigation-and-search/keep-your-homepage-simple-possible): prioritise a clear next action, familiar labels and a manageable amount of information. Use one main hub entry action rather than competing feature promotions.
- [NHS hub pattern](https://service-manual.nhs.uk/design-system/patterns/hub-page): cards cannot substitute for information architecture. Show the four real destinations lower on the homepage and retain a short, literal navigation.
- [NHS appointment preparation](https://www.nhs.uk/nhs-services/gps/what-to-ask-your-doctor/) and [NIH preparation worksheets](https://www.nia.nih.gov/health/medical-care-and-appointments/talking-your-doctor-worksheets): written questions, medicine information and concerns are useful preparation topics. These inform the brief specimen's content groups, not medical recommendations.
- [AHRQ patient-generated data guide](https://digital.ahrq.gov/health-it-tools-and-resources/patient-generated-health-data-i-patient-reported-outcomes/practical-guide): usability, burden and workflow integration matter. More information does not automatically mean less work for a medical professional. Keep claims specific to the selected personal brief.
- [Middleton et al., 2006 randomised trial](https://pubmed.ncbi.nlm.nih.gov/16707508/): agenda forms identified more problems but consultations were longer. Do not promise shorter appointments or measured time savings from DoctorAI.
- [Tuch et al., 2012 primary research](https://research.google/pubs/the-role-of-visual-complexity-and-prototypicality-regarding-first-impression-of-websites-working-towards-understanding-aesthetic-judgments/): lower complexity and familiar structure were associated with greater screenshot appeal. This is an aesthetic hypothesis, not evidence of usability, conversion or healthcare outcomes.
- [W3C contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): guide readable colours, fluid layouts, growing text containers and generous controls. A source review cannot establish conformance.
- [Health Literacy Online typography](https://odphp.health.gov/healthliteracyonline/design-easy-scanning/use-readable-font-thats-least-16-pixels) and [buttons](https://odphp.health.gov/healthliteracyonline/design-easy-scanning/design-buttons-are-easy-find): keep the substantive specimen readable and avoid static labels that resemble clickable controls.
- [GOV.UK details guidance](https://design-system.service.gov.uk/components/details/): keep essential explanations visible; use native disclosure for supplementary FAQs.

## Source audit and resulting changes

| Step | Source finding | Result and evidence limit |
| --- | --- | --- |
| 1. Public homepage | Two overlapping stylesheet designs flatten the offer into similar pale sections. The one-hub purpose and useful brief are spread across repeated explanations. | Replace the layered stylesheet with one coherent composition: large blue headline, readable example brief, compact navy journey and warm/light sections. This is source-backed design work; rendered appearance is unverified. |
| 2. Entering the hub | The old preview highlighted individual tools, while the app's main destinations are Today, My health, Visit prep and Profile. | Homepage destination links now match those four names and routes. Three direct tool shortcuts remain available. Existing route fixtures pass; real browser navigation remains unverified. |
| 3. Appointment preparation | The existing app explicitly selects details, reviews them and only copies/prints after the user's action. | Show that sequence in plain language and a clearly labelled static specimen. No fictional diagnosis, score, patient identity, live connection or auto-send state is introduced. App logic is unchanged; screenshot evidence is unavailable. |
| 4. User choice and narrow screens | Existing privacy choices are specific, and app styles have substantial shared layers. | Keep the app untouched. Homepage text grows naturally, grids become one column, controls have generous source dimensions, FAQs are native details/summary and reduced motion is supported. Actual zoom, keyboard and narrow-screen rendering remain unverified. |

## Chosen direction and rejected alternatives

The chosen visual direction retains DoctorAI blue/navy and the existing head mark, adds a warm/light page surface, uses DM Sans for functional content and the app's existing Newsreader typeface for short italic accents. The example brief is real HTML, not an image of tiny interface text. It is static and explicitly labelled as an example, with no fake form controls or new data collection.

A full clinical command-centre composition was rejected because it could suggest monitoring or integrations. An AI-chat-first hero was rejected because it weakens the organisation/preparation goal. A new photo or illustration was unnecessary: the brief itself demonstrates the product's purpose. The header reuses the existing head mark instead of downloading the much larger combined logo asset for a small display.

No testimonials, adoption statistics, health-outcome guarantees, certifications, clinician endorsements or comparative superiority claims were added. The broad hub proposition is immediately qualified by supported notes, medicine details, questions and visit preparation.

## Validation

Checks on 14 October 2026:

- JavaScript syntax: passed for 66 files.
- Existing static-site verifier: passed for 75 required files and 10 production pages.
- Existing four-main-destination verifier: passed, including route, return-path, session/privacy and reviewed-brief contracts.
- Existing medication-evidence verifier: passed, including its updated cache-version guard; no outbound calls.
- One-off HTML structure review: one H1, 11 unique IDs, all four in-page links and eight section-label references valid, 25 available icon keys, three native FAQ summaries, no inline event handlers.
- Seven foreground/background colour pairs were calculated using WCAG relative luminance. Main text on page: 15.00:1; muted text: 6.33:1; white on primary blue: 5.33:1; muted text on control panel: 5.97:1; light body on navy: 11.83:1; cyan on navy: 13.23:1; blue links on white: 6.74:1. These values are individual pair checks, not a whole-page accessibility audit.
- CSS syntax: parsed 247 style rules and 698 declarations without token/declaration errors using tinycss2. This does not verify rendered layout or computed styles.
- Cache shell moved from v136 to v137; the homepage stylesheet moved to v7. Related cache assertions were updated, and the homepage now uses the current feature-icon v9.

The automated browser origin gate rejected content observation because a saved permission or managed policy denies access to `https://www.doctoraiworld.com`. No alternate browser, indirect fetch, headless render or local rendering workaround was used to obtain that denied visual evidence. There are no current before/after screenshots. CSS and responsive appearance, native FAQ keyboard behaviour and focus visibility still need rendered review. The Product Design audit rule is explicit: “Do not claim an audit if the actual flow could not be accessed and captured.”

The release's PR and deployment metadata are the authority for its final commit and production state. Build/deployment readiness does not establish clinical validation, native-device readiness, store approval or visual/accessibility acceptance.
