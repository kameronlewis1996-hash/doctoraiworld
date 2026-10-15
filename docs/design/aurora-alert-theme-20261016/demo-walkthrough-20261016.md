# Aurora screenshot walkthrough and demo narration

**Deliverable type:** screenshot walkthrough and timed narration/caption script; no video recording is claimed.

**Capture boundary:** Fresh desktop and mobile screenshots were captured in the supported in-app browser against the worktree preview at http://127.0.0.1:4188/. The browser displayed the captures in the task output, but screenshot export was explicitly blocked and the interface provides no supported way to save those image bytes into this repository. I did not try another tool or route. Do not present the saved JPEGs below as current: they are explicitly **pre-refresh** visual references. The exact selected reference remains inline in the parent conversation and has no local export. No video or audio recording was produced.

**Measured desktop composition:** CSS viewport **1487 x 1058**; the browser image is **1472 x 1058** because the vertical scrollbar uses 15 px. The aurora mark bounds are x498/y78/w476, versus reference x~495-982; the heading begins y467 versus y473; the Add Health Detail pill begins y714 versus y711; and the glass dock begins y858 versus y857. The centered logo, two-line navy/cobalt headline, lead, primary pill, Pro scan link, and four-item dock are in the selected order. These measurements were taken before the final gradient-only refinement; that refinement adds smaller cyan/blue/lilac edge glows and pale light pockets to better match the selected reference without moving the content.

**Measured mobile composition:** CSS viewport **390 x 844**; the browser image is **375 x 812** after the scrollbar. The page width and content width both measure 375 CSS px, so there is no horizontal overflow. The centered mark is x69/y80/w238; the two-line heading x20/y300/w335; Add Health Detail x20/y463/w335/h66; and the two-column four-item dock x20/y599/w335/h148. The scan link remains directly below the primary action. Existing responsive metrics cover 320, 390, 680, 768, 1024, and 1487 CSS px; see [responsive.json](responsive.json).

The measured captures used accessibility.css v14, aurora-theme.css v6, hub-category-themes.css v3, health-hub.js v95, and service-worker cache v156. A later **v7 / cache v157** gradient-only pass was inspected live at 1487 x 1058 and 390 x 844: richer peripheral colour and small white pockets appeared, the navy heading and actions remained clear, and neither viewport developed horizontal overflow. Dock icons still computed to rgb(7, 89, 182). The extra gradients are static; the existing reduced-motion CSS guard remains. These v7 images are also not attached because screenshot export was explicitly blocked.

## Visual references (pre-refresh)

These are the repository captures available for the walkthrough. Each predates the final palette/icon refresh per the accompanying design QA notes.

### Desktop hero and frosted dock

![Pre-refresh desktop hero composition](desktop-stitched.jpg)

### Mobile hero and two-column dock

![Pre-refresh mobile hero composition](mobile.jpg)

### Calm hero beside synthetic warning examples

![Pre-refresh theme states; warning panels are explicitly synthetic](theme-states.jpg)

### Medicine screen with a synthetic alert preview

![Pre-refresh mobile medicine view; no personal records](alert-red-mobile.jpg)

## Three-minute walkthrough script

All story content is fictional. Do not enter or change any health details during this walkthrough. The alert examples in the referenced screenshots carry the banner “Synthetic alert preview — no personal records.”

| Time | Frame guidance | Narration | On-screen caption |
|---|---|---|---|
| 0:00–0:25 | Desktop hero reference. Hold on the halo, two-line heading, primary action, scan link, and dock. | “DoctorAI opens with a quieter place to begin. The soft cyan, lilac, and blush atmosphere frames the familiar blue mark, then leads with one clear promise: ‘Your health, with a little more clarity.’ Add Health Detail is the main action; medication label scanning stays a secondary Pro option.” | **A calm start. One clear next step.** |
| 0:25–0:50 | Mobile hero reference. Point out the full-width action and compact two-by-two dock. | “On a phone, the same hierarchy remains visible: the headline, supporting sentence, and Add Health Detail button come first. Today, My Health, Visit Prep, and Profile stay together in a compact dock, so the route names remain easy to find without crowding the screen.” | **Same hierarchy, compact mobile layout.** |
| 0:50–1:17 | Use the Add Health Detail action as a transition; no current chooser screenshot is available, so use a neutral title card until a fresh capture can be saved. | “For this fictional example, Alex wants to remember one question for an upcoming appointment. Tapping Add Health Detail opens the existing chooser: Medication, Health profile, Symptom, Appointment, Measurement, or Document or photo. Alex can choose only what is useful. This narration does not create or submit a record.” | **Fictional example · choose only what matters.** |
| 1:17–1:44 | Show pre-refresh [My Health desktop](../homepage-20261015/hub-theme-health-935.png) and [Profile mobile](../homepage-20261015/hub-theme-profile-390.png); label both as historical references. | “The Health Hub keeps its four destinations recognizable across the homepage and app. Category icons and shortcuts help with navigation; they do not signal health status. Profile remains the place for account and storage choices. A saved detail can stay in the browser or session according to the user’s selected storage preference.” | **Navigation colour is not a clinical status.** |
| 1:44-2:15 | Use the [synthetic orange and red columns](theme-states.jpg); make the synthetic banner legible. | "When a presentation example includes a notice, its severity keeps its clinical meaning. Orange says 'Review needed.' Red says 'Contact a professional.' Those messages remain distinct from the gentle page palette and blue navigation icons. A calm background is not an all-clear, and an alert is not a diagnosis." | **Orange: review needed. Red: contact a professional.** |
| 2:15–2:43 | Show the pre-refresh [medicine screen](alert-red-mobile.jpg), then return to the [four-destination dock](desktop-stitched.jpg). | “Optional Pro scanning can help capture label details. It does not check drug interactions or determine whether a medicine is safe. The Hub is for organisation and education, not medical care. Any warning should keep its wording and non-colour indicator visible, even as the surrounding interface adopts the selected aurora theme.” | **Scanning captures label details; it does not assess safety.** |
| 2:43–3:00 | Return to the desktop hero reference and pause on the headline. | “The result is a softer first impression with familiar routes and clear actions. Alex decides what to keep and what to bring to a conversation with a care professional. No personal information was used in this walkthrough, and no recording of the live app was produced.” | **Your health, with a little more clarity.** |

## Verification boundary

- Desktop and mobile measurements above came from fresh live captures of the exact worktree preview after the icon correction. The browser images were displayed in task output but could not be saved here.
- All four homepage dock icons, all four Health Hub bottom-navigation icons, all six Add Health Detail chooser icons, and all six Profile shortcut-card icons use the shared blue, rgb(7, 89, 182). At the v6 icon correction, `#view-profile .profile-page-hero > .secondary-button` and `#view-profile .memory-card-actions > .text-button` arrow icons (Account & settings and Privacy controls) also computed to rgb(7, 89, 182). The v7 change touches only the background gradients.
- The empty “No saved details have been assessed yet” alert remained neutral. Synthetic orange preview retained an exclamation symbol and “Review needed”; synthetic red retained an exclamation symbol and “Contact a professional” plus professional-review guidance. Both local QA states visibly carried “Synthetic alert preview: no personal records.”
- Vercel marked checkpoint df7b630 READY and the corresponding hosted homepage and Health Hub opened in an existing browser session. The hosted interface did not expose colour pixels or a synthetic alert state, so that checkpoint's hosted visual acceptance remained open. The subsequent v7 gradient-only head requires its own preview deployment check.
- The two saved homepage images and two warning images are pre-refresh repository captures. They must not be presented as current final screenshots.
- Current mobile homepage, Health Hub, Add Health Detail chooser, Profile, and synthetic orange/red states were inspected live. No current screenshot file was persisted in this document.
- No actual video, audio, or voice track was created. The companion [WebVTT captions](demo-captions-20261016.vtt) provide timed on-screen caption overlays; the full narration is in the table above, not in the VTT as a verbatim speech transcript.
- No health records, external service, scanner, camera, or personal account were used by this artifact.
