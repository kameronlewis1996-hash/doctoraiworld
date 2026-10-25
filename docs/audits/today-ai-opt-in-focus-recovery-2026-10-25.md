# Today AI briefing consent and focus recovery audit — 25 October 2026

## Findings

- Opening the private daily health briefing automatically posted up to five saved symptom notes to `/api/chat`, which requires a signed-in session and forwards the message to OpenAI. The screen did not preview the payload or offer a choice to omit symptom notes.
- Today focus had create, edit and complete controls, but no clear action. Removing the focus from the daily panel would otherwise require overwriting it, with no recovery path.

## Changes in this draft

- The briefing now previews at most four normalized symptom notes. The preview snapshot is the exact symptom data used by the request. Notes are unchecked by default; opening, selecting or cancelling makes no AI request. Generate is the affirmative action. The signed-in prompt names OpenAI and the summary purpose, discloses the stated default abuse-monitoring retention, links to the Privacy Notice, and identifies excluded profile, medication, appointment, document and Health Memory context.
- The request uses no Health Memory field. It sends only selected notes, or an empty organizer request when the person chooses to continue without those notes. With no recent symptom notes, the UI offers no generation action. The account/session revision must match at confirmation and completion; closing the dialog aborts and invalidates an in-flight result. Responses that fail the organizer-only format check are hidden. Failed or rejected output never claims that records were saved.
- Today focus can be cleared after confirmation. Clearing archives the existing task with a restore action; it does not delete the record. Clear, complete and restore actions verify the rendered owner/session revision. Storage status remains visible in the save feedback.
- Updated page and service-worker asset versions. Updated the corresponding cache checks and the modal-close harness.

## Verification

- `scripts/verify-today-privacy-and-focus-browser.cjs`: 7 synthetic Chromium check groups passed. It intercepts every API request; no real auth, AI provider, account or health data is used. Cases cover 1440/390/320 CSS px, no request before Generate, Cancel after selecting notes, uncheck/deselect, included/excluded payload fields, empty and signed-out states, invalid AI advice, provider failure, owner-change preview clearing, late response after account switch, and clear/cancel/reload/restore/account isolation.
- Existing signed-out alert privacy Chromium suite: 14 cases passed, including 36 unchecked medicine pairs and zero interaction alerts; the number of unchecked pairs remains distinct from confirmed interactions.
- Existing Today records Chromium suite: 16 groups passed; existing auth/privacy Chromium suite passed (`audit: all`, mocked identity; real production authentication not exercised); zero-medication Chromium suite: 21 cases passed.
- JavaScript syntax passed for 109 files. Health-state contract, device storage, record preparation, five-tab navigation, server-core, Today diary, medication evidence and retired-provider checks passed.
- `git -c core.whitespace=cr-at-eol diff --check` passed. The checked-in JavaScript uses CRLF; this mode treats its line endings as line endings.
- PowerShell static-site check was not available in this Linux executor. Hosted PR CI is still needed for that check.

## Limits and release status

The Chromium identity and API responses are synthetic; no request reached OpenAI. The output keyword/format check is a fail-closed filter, not clinical validation or a guarantee about model content. Provider retention wording mirrors the current Privacy Notice. No real production account, device camera, AI response or saved health record was used.

This is an isolated branch based on deployed main `91b774d0e64e05f4dd5a144b56cef0294338c39d`. Initial implementation commit: `cc541a05cd664b98da95b694870557704656b469`; a follow-up commit records the draft-PR blocker. Draft PR creation was rejected twice by automatic approval review: it classified these changes as outside the narrowly authorized signed-out-alert scope. PR #118 does not exist. Do not use another path to create it, mark it ready, merge or deploy in this task. The parent owns any further authorization. PR #116 remains a separate draft.
