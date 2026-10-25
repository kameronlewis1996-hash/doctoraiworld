# Scanner cleanup during session changes

Date: 2026-10-25

Scope: Stop the live medication camera and cancel a pending label extraction when DoctorAI no longer has a verified session. Tests use mocked auth and synthetic camera/label data only.

## Finding

On the released code, a synthetic Pro account could open the medication scanner, then keep its dialog and live camera stream active while a held tab-return auth request changed the header to “Checking sign-in.” The Chromium regression failed before the fix: the modal remained open and the synthetic camera track remained live. No real camera, label, or production account was used.

## Change

- When the private view gate first locks, abort an in-progress label request and close the scanner so its camera tracks stop before the session check finishes.
- Bump the app script URL and service-worker shell cache to `health-hub.js?v=114` and `doctorai-shell-v186` so installed clients receive the fix.
- Move focus to the session gate when closing an open scanner, and add synthetic browser coverage for held expiry revalidation, delayed logout, late camera-permission results, and cancellation of a consented label request while its mocked endpoint is held.

## Audit

**Passed in local Chromium with mocked auth.** The post-fix cases verify that tab-return revalidation and delayed logout close the scanner and end the synthetic camera track immediately; a camera stream that resolves after expiry is stopped; and a pending label request is aborted on expiry without reopening the scan result UI. Focus moves to the session gate after the revalidation closes the dialog. Existing account A → guest → account B, late response, focus editor, saved overview, and private My Health gate cases also pass in the same adverse auth suite.

The final local checks also passed: JavaScript syntax (108 files); the full auth-status Chromium suite at 1440, 390 and 320 CSS px; signed-out alert privacy Chromium (14 cases); Today records Chromium (16 groups); zero-medication Chromium (21 cases); server, health-state, device-storage, record-preparation, five-tabs, Today diary, medication login/evidence/scan-session/pipeline/check-controller/provider-retirement checks; 81 alert fixtures; and 13 alert-presentation checks. The Windows-only static-site PowerShell check is assigned to hosted CI.

`mockedAuth: true`; `realProductionAuthentication: false`. The camera is a synthetic `MediaStreamTrack`; the label is synthetic canvas bytes sent only to a locally mocked endpoint.

## Limits

These checks verify the local build. They do not prove real-user exposure or production-account behavior. Public-site requests from this executor have previously failed with `ERR_TUNNEL_CONNECTION_FAILED`; do not bypass deployment protection or use a different route to reach the site.
