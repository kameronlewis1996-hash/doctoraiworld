# Record preparation fixes — 14 October 2026

## Scope

Continue DoctorAI's existing Health Hub by correcting three source-confirmed record-flow defects. Baseline: production main `c2fd39f04039e99c6ce58531cae9c88173763a33`. The public homepage and visual design remain the starting point. This release changes the web application and its existing private health-state validation; it does not submit a native app or integration.

## Findings and changes

| Finding in the baseline | Change | Intended result |
| --- | --- | --- |
| The browser always serialises `providers`, even as an empty array. The server's health-state allowlist omitted that key, so the actual browser payload failed validation before saving. | Accept the existing optional providers array in the server contract. Keep unknown-key rejection, the size limit, authentication, account routing, rate limits and storage failure handling. Reject non-array providers when supplied; older clients may omit the field. | Remove the confirmed validation mismatch without changing the existing sign-in or storage choices. This alone does not prove live account sync is available. |
| Appointment “Edit details” opened a blank add form and saving always appended a record. | Pass the appointment ID, prefill escaped fields and update that exact saved record. Preserve ID, status and unknown existing properties. Reject stale edit IDs. Keep legacy `notes` compatible when edited. Validate required reason/date/time and return to the appointment list. | Correcting a visit updates its existing choice in Visit prep instead of creating conflicting duplicates. Cancel does not change saved data. |
| The visit brief omitted structured symptom location, pattern, quality, associated symptoms, impact and interventions. | Format those six known saved fields with labels, alongside date/time, intensity, duration, context, triggers and notes. Keep distinct legacy free text; omit internal/unknown properties. Review escapes all text. | The person can see the known details included with a selected symptom before copying or printing them. No interpretation or new clinical inference is added. |

Appointment edits append a distinct, linked “updated” timeline event while retaining earlier history. New appointment events carry the appointment ID. Deletion removes exactly linked events; ambiguous historical title-only notes remain, since titles can repeat or change. The confirmation message describes removing the appointment from the appointment list.

## Verification scope

The focused checks exercise the actual browser functions, health-state serializer, API handler and validator with fictional data. External identity and storage services and the DOM are stand-ins. These checks can establish the source contract and record transformations; they cannot prove real authentication, durable storage or rendered interaction.

- `verify:health-state`: actual client payload to actual API/validator; empty/nonempty providers; older clients; roundtrip; rejected malformed, unknown and oversized input; account routing; authentication, rate-limit and storage failure gates.
- `verify:record-preparation`: actual appointment rendering/edit dispatch/form/save and brief generation; prefill escaping and legacy notes; cancel; update/add/stale IDs; preservation of unrelated records and metadata; selected symptom context; unchecked/date-excluded records; escaped export content.
- Existing server core, navigation/session/privacy, static-site and medication/scan checks remain part of release verification. The focused checks are also wired into the existing GitHub workflow.
- The cache shell is v139 and `health-hub.js` is v84. Version assertions match those assets.

Check results and exact tested/released tree, commit and deployment identities are recorded in the pull request and the release evidence. Passing source checks does not establish a clinical outcome or whole-product readiness.

## Remaining acceptance gates

The current Page requires desktop/mobile evidence for Today, My health, Visit prep and Profile, responsive and keyboard/focus checks, navigation/return paths, relevant account/storage interaction checks and dated before/after evidence. Current source fixtures cover some navigation and storage contracts, but current rendered evidence is missing.

The saved browser origin policy still blocks observation of DoctorAI. It was respected; no browser, raw-fetch, headless or local-render workaround was used. Product Design audit states: “Do not claim an audit if the actual flow could not be accessed and captured.” Real browser editing, clipboard, print pagination, signed-in sync and mobile appearance remain unverified. Native-device, store-submission, billing and clinical validation stay separate from this web release.
