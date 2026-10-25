# Account transition privacy regression

Date: 2026-10-25  
Scope: Today focus, appointment and saved overview during sign-out, sign-in, expiry and account revalidation. All identities and health records used in local tests are synthetic.

## Finding

During a delayed sign-out or tab-return session check, Today could retain an account's focus and appointment in the page. The focus editor could also remain open, and its submit handler did not verify that the account and data owner were still current. The Today saved-overview action also read retained health state without checking that the current owner had been verified. This was a code-path finding confirmed by held-request browser tests; no real-user exposure was established.

## Change

- Gate Today records and overview entry points on a verified, ready health-data owner.
- Hide and reset an open focus editor while the session is pending or unavailable. Bind each edit session to the account revision and health-owner revision, and reject a submit if either changed.
- Close and clear open saved-overview content while a session is being checked.
- Immediately rerender the health notices and Today storage status when sign-out or credential verification becomes pending.
- Update isolated test harnesses to model the added session/owner readiness fields. Replace a fixed 50 ms wait in the zero-medication browser test with a wait for the alert renderer's ready status.

## Audit 1: functional session transitions

**Passed** in `node scripts/verify-auth-status-browser.cjs` using Chromium and mocked auth responses. Held DELETE and GET requests covered open focus editors, pending logout, tab-return expiry, an open saved overview, account A → guest → account B, account A → B switch, and late account A responses. Attempts to force the stale overview click or submit a stale form produced no modal read, local task change, or health-state PUT. The suite reports `mockedAuth: true` and `realProductionAuthentication: false`.

## Audit 2: browser and signed-out privacy regressions

**Passed** locally in Chromium at 1440, 390 and 320 CSS px for the auth suite. `node scripts/verify-today-records-browser.cjs` passed 16 check groups and captured four synthetic screenshots. `node scripts/verify-signedout-alert-privacy-browser.cjs` passed 14 cases: 12 unowned legacy keys remained unchanged and hidden while signed out; the six-medicine fixture displayed 36 unchecked pairs and zero confirmed interaction alerts; ordinary medication search and add worked. `node scripts/verify-zero-medication-browser.cjs` passed 21 cases. These checks use mocked identities/storage and do not establish a real production account session.

## Audit 3: final-code review and aggregate

**Passed locally** for JavaScript syntax (108 files), server core, health-state contract, device storage, record preparation, five-tab navigation, medication login, Today diary, 81 synthetic alert fixtures, 13 alert-presentation checks, zero-medication lifecycle, and 17 medication scan race cases. The final diff is limited to session/owner gating in `health-hub.js` and regression harnesses. It changes no clinical rules, research data, storage schema, or auth API. Repository CRLF line endings were validated with `git -c core.whitespace=cr-at-eol diff --check`.

Hosted required CI and production deployment status are recorded with the release PR. Public live signed-out checks from an independent browser reviewer previously passed; this local executor's public-site tunnel has returned `ERR_TUNNEL_CONNECTION_FAILED`. No access-control or network workaround is used, and real authenticated production behavior remains unverified.
