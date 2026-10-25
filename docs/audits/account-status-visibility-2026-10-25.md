# Account status visibility: release audits

Date: 2026-10-25  
Base revision: `842eb5eef2922d18e846ecbe4e9a402cd71df482`

All browser checks ran in local Chromium against the final account-status UI code. Session responses and user identities were synthetic test fixtures (`.invalid`); production authentication and real health records were not used.

## Audit 1: functional states and transitions

Command: `npm run verify:auth-status-browser -- --audit functional`

Result: passed. Verified first-open checking, signed-out Sign in action, pending and confirmed sign-in, signed-in profile action, sign-out pending and confirmed states, live status announcements, keyboard focus, contrast, and touch target. The header does not expose the fixture identity. The verified mobile target measured 82 × 44 px.

Related regression checks passed: `npm run verify:five-tabs`, `npm run verify:medication-login`, and `npm run verify:signedout-alert-browser`.

## Audit 2: desktop/mobile visual and accessibility

Command: `npm run verify:auth-status-browser -- --audit visual`

Result: passed at 1440 px desktop, 390 px mobile, and 320 px narrow mobile. Checked first-open signed-out presentation, signed-in label, checking state, unavailable state, label fit, page/header bounds, no horizontal overflow, keyboard focus, accessible name and live-region role, 44 px minimum control height, and at least 4.5:1 status-text contrast. The unavailable state remains visually distinct and does not claim signed-out.

Visual captures from this audit:

- `/tmp/doctorai-auth-status-audit/final-first-open-1440.png`
- `/tmp/doctorai-auth-status-audit/final-first-open-390.png`
- `/tmp/doctorai-auth-status-audit/final-first-open-320.png`
- `/tmp/doctorai-auth-status-audit/final-signed-in-1440.png`
- `/tmp/doctorai-auth-status-audit/final-checking-mobile.png`
- `/tmp/doctorai-auth-status-audit/final-unavailable-mobile.png`

## Audit 3: expiry, account changes, and delayed responses

Commands:

- `npm run verify:auth-status-browser -- --audit adverse`
- `npm run verify:signedout-alert-browser`
- `node scripts/verify-medication-scan-session.cjs`

Result: passed. Verified expiry and tab return clear stale identity while status is checking; account A to B changes; late prior-account responses are ignored; logout ignores delayed account responses; unavailable auth endpoint state and retry; and empty medication state. The signed-out alert browser suite passed 13 cases, including legacy data preservation/isolation, guest data, tab return, expiry, zero medicines, and ordinary search/add. Its synthetic six-medicine fixture showed 36 unchecked pairs and zero confirmed interaction alerts; unchecked pairs remain distinct from confirmed interactions.

## Audit notes

The visual run initially exposed a hidden desktop header in the selected layout and delayed state colors; those were corrected before the passing three-pass run. Screenshots show blank synthetic state only. No claim is made about live production authentication; a public signed-out production smoke check remains separate from these local browser audits.

The repository's separate legacy navigation and zero-medication browser scripts require Microsoft Edge, which is not installed in this environment, so they could not start. The scoped account-status and signed-out-alert suites above ran in Chromium. The PowerShell static-site verifier is likewise unavailable locally; the pull-request workflow invokes it with PowerShell on its runner before merge.
