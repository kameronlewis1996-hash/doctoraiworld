# Appointment date groups — 14 October 2026

## Confirmed problem

Baseline production: `7a45ad255cceafe570970a978fcf52e3926e3ccb`.

`upcomingAppointments()` filtered only on `status !== 'past'`. Adding an appointment always set `upcoming`, so a saved date in the past could remain “next” indefinitely. The edit form also preserved legacy status without offering a status control: a rescheduled future date could remain archived if its old status was `past`.

## Correction

One shared function now groups all appointments using their saved calendar date and the current local day:

| Saved date | Display and use |
| --- | --- |
| Before today | Earlier dates, newest first; Edit and Delete remain available. |
| Today or later | Today and upcoming, earliest first; used by existing Today, overview and preparation consumers. |
| Missing or invalid | Check saved dates, with Edit and Delete. Not used as the next appointment or automatically supplied as upcoming context. |

Valid dates determine the group even when a legacy status disagrees. Stored records, statuses, order and timeline history are not changed by grouping. A date does not establish whether a visit occurred. No attendance or cancellation workflow is introduced.

The explicit appointment selector in the user-reviewed visit brief still lists every saved appointment, including earlier or undated entries. The person controls whether an appointment is included.

Date views refresh on a local-day change when navigating, returning to the foreground or through a local once-per-minute check. This does not make a network request or change stored health details. Same-day checks leave the view alone. Actual browser timer/background behavior remains unverified.

## Verification

The existing record-preparation regression executes the actual grouping, wrapper and rendering functions with fictional records and a DOM stand-in. It covers conflicting old statuses, today/future/past dates, ordering and time ties, missing/invalid dates, escaping, Edit/Delete availability, explicit brief choices, unchanged source records/history, local midnight and date edits moving the same record between groups. The day-refresh controller is checked separately from real browser event/timer execution.

The release uses shell v140 and `health-hub.js` v85. Its pull request records check results, exact source/tree and deployment identity. Deployment readiness and source checks are separate from rendered acceptance.

## Remaining gates

The requested research (22 minutes completed), researched homepage, explicit selected brief and recorded source corrections are implemented. The current Page still requires current desktop/mobile screenshots for Today, My health, Visit prep and Profile, responsive and keyboard/focus checks, navigation/return-path checks and relevant real interactions. Source fixtures establish only their own tested contracts.

The saved browser-origin policy continues to prevent DoctorAI observation. No browser, raw fetch, headless or local-render workaround was used. Product Design audit requires actual captured screens before claiming an audit. Rendered design acceptance, browser editing/cancellation, real sign-in and sync, clipboard and print pagination remain unverified. These are the remaining external acceptance gates for this website request; native/store, billing or clinical-validation work is not added to its scope.
