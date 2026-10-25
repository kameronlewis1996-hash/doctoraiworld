# Today and My Health release audit

Date: 2026-10-25  
Branch: `codex/account-status-visibility-20261025`  
Browser: local Chromium with synthetic records and mocked account responses only.

## Audit 1: information architecture and responsive presentation

**User goal:** answer “what matters to me today?” while keeping the detailed record list in My Health.

The signed-out baseline repeated medicine, condition, allergy, diary, and appointment detail below the alert summary. Today now presents one optional user-written focus, the next saved appointment, a check-in/diary action, and links to the detailed records. Existing safety notices remain available; the focus and question actions are personal organisers and do not generate health advice. Detailed profile, medication, allergy, condition, appointment, and history records remain available in their existing views.

**Result: passed** in a fresh local Chromium run at 1440, 390, and 320 CSS pixels. The browser audit found no horizontal overflow, exposed no medicine/condition/allergy list on Today, and showed honest empty states for a signed-out profile. Focus actions fit in one row at 390 px and stack at 320 px. My Health contains the detailed medicine list and meaningful accessible names for condition, allergy, and emergency edit actions.

Screenshots inspected from this run:

- `/tmp/doctorai-today-focus-audit/today-populated-1440.png`
- `/tmp/doctorai-today-focus-audit/today-populated-390.png`
- `/tmp/doctorai-today-focus-audit/today-populated-320.png`

These are synthetic visual captures, kept outside the repository.

## Audit 2: function, authentication, privacy, and accessibility

**Result: passed** in local Chromium using synthetic identities and health records.

- `node scripts/verify-today-records-browser.cjs` passed 15 check groups: create/edit/complete a focus; Pacific/Auckland date rollover and stale-focus handling; guest, account A, account B, and return-to-guest isolation; account sync state text; question diary save; medication search/manual add; symptom modal keyboard close, 14 px labels, and 44 px targets; zero, one, and multiple medicines in My Health; and hidden-but-preserved unowned legacy storage.
- `node scripts/verify-auth-status-browser.cjs` passed its functional, visual, and adverse auth states at 1440, 390, and 320 CSS pixels. Checking, unavailable, signed-out, and verified signed-in states were distinct; sign-in, logout, expiry/tab return, account switch, and late responses were covered. The mobile control measured 82 × 44 px with solid keyboard focus; status text contrast was at least 4.5:1. Identity was mocked, not verified against production authentication.
- `node scripts/verify-signedout-alert-privacy-browser.cjs` passed 14 cases. Twelve unowned legacy keys remained unchanged and hidden while signed out; explanatory legacy text appeared only after a verified sign-in. The six-medicine guest fixture had 36 unchecked pairs and zero confirmed interaction alerts. The test kept those counts distinct. Ordinary medication search returned eight suggestions and add worked.
- `node scripts/verify-zero-medication-browser.cjs` passed 21 Chromium cases at 1440, 390, and 320 CSS pixels across empty, allergy/condition, stopped, pair, unknown, independent-alert, and stale-result fixtures.

Tab return and expiry checks used scripted visibility changes in Chromium. They are synthetic browser checks, not real user sessions or physical-phone testing.

## Audit 3: final-code review and regression aggregate

Reviewed the scoped diff for Today/My Health information architecture, auth state rendering, account isolation, retained records, cache invalidation, and changes outside scope. The app changes remove the duplicate Today record lists without deleting saved state. Clinical rules and research data are unchanged. The service-worker cache and asset query versions were updated for the shipped HTML, CSS, and JavaScript.

**Result: passed locally** for JavaScript syntax (108 files), whitespace validation, and the relevant regression aggregate:

`verify:server`, `verify:health-state`, `verify:device-storage`, `verify:record-preparation`, `verify:medication-database`, `verify:medication-safety`, `verify:medication-pipeline`, `verify:medication-evidence`, `verify:medication-check-controller`, `verify:medication-login`, `verify:medication-staff-test`, `verify:local-medication-ui`, `verify:medication-provider-retirement`, `verify:scan`, `verify:alerts` (81 fictional fixtures), `verify:alerts-presentation` (13 checks), `verify:five-tabs`, `verify:zero-medications`, `verify:today-diary`, and `verify-medication-scan-session.cjs` (17 synthetic race cases).

The local environment does not include PowerShell, so `verify:static` was not run locally. GitHub Actions runs the repository's static-site PowerShell verifier; the PR must have green required CI before it is marked ready or merged. Production authentication was not tested locally. A public signed-out smoke check is a separate release step and will be reported only if the public site is reachable without access-control bypass.
