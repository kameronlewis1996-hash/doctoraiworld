# Visit brief priorities — 14 October 2026

## Purpose and evidence

Continue the researched homepage's promise in the existing Visit prep flow: make the person's concerns and questions easy to find in the brief they choose to share. The [homepage research](homepage-research-2026-10-14.md) records the completed 22-minute research session and its primary sources. NHS and NIH preparation guidance informed the agenda-first structure. This change makes no claim about shorter consultations or improved clinical outcomes.

Source baseline: main `682e4c3bb89a59e33eab783346e2d1b10d7a489e`.

## Source findings and implementation

1. Questions were appended after all selected records in one flat list. With up to 100 records per dated category, they could be buried. The question field now follows the main concern field. In the reviewed, copied and printed brief, concerns and questions come before the selected record categories. The user's typed question order is preserved.
2. All saved medicines were labelled “Current saved medicines”, although the medication form supports start and end dates and the brief did not filter those entries. The label now says “Saved medicine details”. Recorded start/end dates are included when present, with a prompt to check which medicines the person still takes. No medicine is automatically excluded or classified as current.
3. The review uses semantic section headings and two lightly highlighted agenda sections. Supporting records keep separate headings. Print rules allow long record sections to continue across pages while keeping headings with their content. Rendered page breaks remain unverified.

The explicit selection, date filter, review, Back to edit, copy and print controls remain. Empty categories do not appear in the reviewed brief. No health details are sent automatically. Appointment-only and question-only briefs remain supported. User text is escaped in every generated section, and input limits are enforced during generation as well as in the form.

## Validation and limits

- JavaScript syntax: passed for 66 files.
- Existing four-main-destination checks: passed, including reviewed-brief controls and session/privacy contracts.
- Existing static-site checks: passed for 75 files and 10 production pages.
- A source execution check used fictional records to exercise the actual brief functions: concerns/questions before 100 selected records; original question order; unchecked and date-excluded records omitted; medicine dates retained; escaped user text; retained edit form; empty selection; appointment-only brief; generation limits. No browser, storage or network calls were used.
- Cache references updated to shell v138, health-hub.js v83 and care-design.css v10, including existing version assertions.

The saved browser origin policy still blocks DoctorAI observation. It was respected; no alternate browser, raw fetch or local rendering workaround was used. There are no current screenshots. Actual responsive layout, keyboard focus, clipboard behaviour and print pagination still need browser review. Under Product Design audit: “Do not claim an audit if the actual flow could not be accessed and captured.” This document is a source review and implementation record.

The pull request and deployment metadata identify the final released commit. A successful deployment does not establish visual, accessibility or clinical acceptance.
