# Today layout follow-up — 20 October 2026

Approved continuation of draft PR #100, implemented and verified with Astra. Starting feature commit: `3dff23a563e0d3cc7c775ed445f0f410f59f207d`; main remained `5881b2019d847749ec97a04285543554bf8999a2` on the final pre-commit fetch. Separate staff research work is untouched.

Today now uses My Health's page width, spacing, white hero with blue accent, full-width mobile action and labelled section picker. A shared `hub-page-heading` component serves Today and My Health's main details panel; nested My Health sections retain their existing headers. The extra pale Today wrapper is removed. Today keeps its greeting, explanatory copy, Alerts, medicine/condition/allergy/appointment/diary cards, Add/Manage/Scan actions, saved questions and additional-record links.

The mobile native selector and desktop section buttons filter only Today’s record cards. “All today’s details” is the default. Alerts and loading/error/retry status remain outside filtering. Selection changes neither route nor saved records. The new hero action opens the existing Add health details view and follows the existing loading-state disable hook. Today's breadcrumb uses a single current-location label instead of a redundant self-link.

No clinical rules, severity engine, medical wording, authentication, data storage, API, dataset, payment or deployment configuration changed. The only JavaScript changes are the Today section display handler and breadcrumb presentation. The PWA shell increments to v178 and references updated presentation assets; matching version assertions are updated.

## Before and after

- [Before: Today, 390 px](today-before-390.jpg)
- [After: Today, 390 px](today-after-390.jpg)
- [My Health reference from the starting source, 390 px](before-health-390.png)
- [After: Today full page, 320 px](after-today-320.png)
- [After: Today full page, 1440 px](after-today-1440.png)

These are local Chromium screenshots with empty fictional browser state and the repository CSP, using system fallback fonts because external font requests are unavailable. Before captures render the exact starting feature commit. They are not hosted preview screenshots. The supplied Library references resolved to the correct image metadata/captions, but the supported materialization download failed; the parent’s inspected screenshot description and actual My Health source guided the comparison.

## Focused verification

| Check | Result |
| --- | --- |
| Today/My Health geometry at 320, 390 and 1440 px | Passed: identical hero position, width, padding, margin, border, radius, background, shadow and heading size; matching page padding |
| Today selector and actions | Passed: all six choices, native keyboard selection, desktop keyboard buttons, persistent Alerts, Add/Manage, unaffected My Health picker, diary confirmation/save |
| Responsive behavior | Passed: no horizontal overflow; full-page and filtered-diary content can scroll above fixed bottom navigation |
| Existing Today records browser | Passed: 11 journey groups, including fictional add/edit/remove, scan sign-in gate, targeted forms, 200% zoom, account isolation, loading, unavailable state and retry |
| Keyboard accessibility browser | Passed: 103 assertions, no page errors |
| JavaScript syntax | Passed: 103 files |
| Navigation/source contracts | Passed; retained original assertions and added Today breadcrumb assertions |
| Today diary validation | Passed |
| Alert presentation | Passed: 12 renderer checks |
| Actual engine severity | Passed: orange/red atmosphere and status retained; Today’s Alerts shortcut remains available when filtering cards |
| Medication evidence/provenance and cache versions | Passed |
| PWA install assets and offline/update browser journey | Passed |
| Diff whitespace | Passed with `core.whitespace=cr-at-eol`, preserving the existing JavaScript CRLF convention |
| Independent Astra review | No actionable findings; reviewed source/diff and 320/390 screenshots |

[Geometry and interaction results](layout-report.json) · [Existing Today regression results](today-records-qa.json) · [Severity results](severity-report.json).

The earlier broad styling suite and its documented baseline failures were not rerun wholesale for this refinement. There is no application build/lint/type-check script; hosted build and CI results for the final commit are recorded on PR #100.

## Delivery gaps

The supported Library upload flow for the two before/after JPEGs failed at its initial tool-list network request, before preparation or writes. No Library IDs were created and no alternate upload route was used. The files are included here for review.

Prior direct preview browser access was rejected by the environment proxy before reaching Vercel. Final preview metadata/build/CI verification is recorded on the draft PR; no bypass links or access/security changes are used. Production merge or promotion remains outside this task.
