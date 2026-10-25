# Private health views during session revalidation

Date: 2026-10-25

Scope: Hide account-scoped health views until the current session and data owner are confirmed. Browser identities and health records used here are synthetic.

## Finding

With synthetic account A open on Medication & Prescriptions, a held tab-return auth request left A's medicine, condition and allergy in the visible page while the header said “Checking sign-in.” The new Chromium regression reproduced this before the gate was added. This was a local control-flow finding; no real-user exposure or production account case was established.

## Change

- Put all private hub views behind an accessible “Checking sign-in” / “Sign-in not confirmed” gate. While locked, hide and inert the view stack and move focus to the gate if focus was inside the private content.
- Verify session ownership separately from cloud sync readiness. A verified account can still view its records when account storage is unavailable.
- Offer a retry after an unconfirmed auth response. Clear modal content and unsent diary-question fields on the first lock; restore the prior view only after same-owner verification succeeds.
- Bump the page asset URLs and service-worker shell cache to `health-hub.js?v=113`, `health-hub.css?v=95` and `doctorai-shell-v185`.

## Audit 1: reproduce and verify transitions

**Passed** in local Chromium with mocked auth and synthetic health state. Covered the pre-fix held-GET reproduction; pending and failed checks; retry; delayed logout; expired-session tab return; open and closed saved-overview content; same-account recovery; account A → guest → account B; and late account responses. All private-view content was hidden while identity was unconfirmed, and the synthetic account B view contained no account A values. `mockedAuth: true`; `realProductionAuthentication: false`.

## Audit 2: responsive and accessible gate

**Passed** at 1440, 390 and 320 CSS px in Chromium. Confirmed status semantics, readable 16px explanatory copy, at least 44px retry target, focus movement, hidden/inert/aria-hidden state, no horizontal overflow, and restoration after same-owner verification. Verified signed-in access remains available during a synthetic cloud-storage-unavailable response.

## Audit 3: regression and scope review

**Passed locally** for JavaScript syntax (108 files), server core, health-state contract, device storage, record preparation, five-tab navigation, Today diary, medication evidence, medication login, 81 synthetic alert fixtures, 13 alert-presentation checks, zero-medication lifecycle, 17 medication scan race cases, medication provider retirement, medication pipeline and medication check controller. The signed-out browser suite passed 14 cases, Today records passed 16 browser groups with four synthetic screenshots, and zero-medication Chromium passed 21 cases. The final diff changes session gating and test fixtures only; it changes no clinical rules, research data, auth API, storage schema or user records. `verify-static-site.ps1` is included in hosted CI; this executor has no PowerShell binary.

## Limits

All authentication cases are mocked and use fictional records. No real authenticated production account was tested. Public-site requests from this executor have previously failed with `ERR_TUNNEL_CONNECTION_FAILED`; no alternate route or access-control change is used. Production smoke evidence must be recorded separately from these local-build checks.
