# Web integration checkpoint — 2026-10-03

Paused at the user's request to reduce usage. This is a local work-in-progress checkpoint, not a release-ready candidate. No branch was pushed, draft PR created, Preview deployed, or production merged in this pass. No Android files were changed.

## Sources and reconciliation

- Production/main: `5a4ad6041d5d24806c0125279614325d1329a5e1`.
- Family draft PR33: `53a597e41ce2b7e25f1ba84ce75404691ef6aab8`; base of this branch.
- Earlier redesign/scanner/medicine draft PR22: `b5b4b6b653370490ac6ef4bd64208e804e6be9e9`; deliberately integrated after reviewing conflicts.
- Branch: `codex/web-accessibility-integration-20261003`.

Preserved the PR33 core, opaque account-bound self cache, scoped health/profile handlers and document deletion handler. Rejected obsolete email-hash account caches from PR22. Retained child AI/OCR restrictions, adult consent, revision/CAS guards, quarantine/recovery, storage consent and scoped deletion. Published Privacy and Terms remain the production versions; caregiver policy and complimentary Pro remain draft. Preview billing is disabled.

Integrated explicit record-selection/consent for medicine checks and briefings, scanner review, accurate document messaging, public-MCP quote fixes and targeted checks. Added a final blue/cyan visual layer, larger text and controls, responsive cards and manual-entry CTA. Fixed a real keyboard issue: the skip link now focuses main content without triggering the view router. Updated service-worker asset versions and exact inline CSP hashes.

## Verification already performed

The initial aggregate run passed 18 checks and found obsolete fixtures in profiles, managed AI, person-switch and document deletion checks. Those four fixtures were updated to the integrated consent/context contracts, and all four reruns passed. The obsolete PR22 account-isolation script was removed in favor of the stronger PR33 account-cache checks. Detailed first-run results, including failures, remain in `/workspace/doctorai-web-evidence/integration-first-tests.json`.

The portable static verifier passed 11 pages, 201 local references, exact inline CSP hashes, versioned offline assets and privacy/provider invariants. Browser automation used synthetic local handlers with provider/storage mocks; it performed no paid provider calls. An agent-browser CDP content/error check passed. No real patient records were used.

The latest focused browser run passed: skip-link focus; named manual-entry dialog; Escape/focus restoration; required name/strength validation and focus; one manual medicine save; appointment save; notes save/reload; no AI request when opening overview or withholding consent; one request on double activation; consent reset after completion. It then stopped on one axe color-contrast rule in the briefing dialog:

- `div:nth-child(3) > dt`: 4.45:1 (`#62798b` on `#fbfdff`, 10px).
- Two list `<small>` labels: 4.16:1 (`#6b7f8c` on white, 12px).

Failure detail: `/workspace/doctorai-web-evidence/final/web-verification-failure.json`. The remaining browser assertions have not run to completion. Do not claim WCAG conformance or release readiness.

## Evidence and boundaries

Before/after screenshots and local audit JSON: `/workspace/doctorai-web-evidence`. Existing `after-integrated-*` captures precede the latest scanner-label color and skip-link fixes; refresh only the relevant captures in a future focused pass. No Library upload was attempted or confirmed. Original branches and detached audit worktrees remain intact.

Live page text was reviewed through the web tool. Direct browser access to `www.doctoraiworld.com` was blocked by the environment proxy (CONNECT 403 / tunnel failure); baseline browser captures therefore use the exact production source locally. Auth/KV/Blob Preview isolation is not configured or owner-approved. Deployed sign-in, real storage, camera hardware, Android and end-to-end external-provider behavior are unverified. No credentials/resources, billing, legal publication or production settings were changed.

## Focused next step

Fix only the briefing dialog contrast, run the focused browser check, inspect the result, and decide the next single priority with the parent. Refresh current evidence and recheck affected privacy/consent behavior before publishing a draft PR or Preview. Native Android work remains owned by its separate thread; this branch has no native changes.

## Focused follow-up — briefing contrast

At the parent's request, only the two briefing label colors were darkened to `#405d73`. Their ratios are now 6.79:1 on `#fbfdff` and 6.93:1 on white. A `--briefing-only` mode was added to the existing browser verifier so this flow can be checked without expanding the audit.

Commands run:

- `DOCTORAI_CHROMIUM=/usr/bin/chromium DOCTORAI_WEB_EVIDENCE_DIR=/workspace/doctorai-web-evidence/briefing-after node scripts/verify-web-accessibility.cjs --briefing-only` — PASS: 8 assertions, 2 axe states (1440px and 390px), zero JavaScript errors, zero paid calls. Verifies opening/withholding consent makes no request, double activation makes one request, consent resets, Escape closes, and briefing accessibility in the two viewports.
- `node scripts/verify-managed-client-guards.cjs` — PASS: declined transmissions, child blocking, managed disclosures and serialized document deletion.
- `git diff --check` — PASS.

The original failure was reproduced and captured before changing the CSS. Evidence: `/workspace/doctorai-web-evidence/briefing-before/briefing-1440.png`, `/workspace/doctorai-web-evidence/briefing-after/briefing-1440.png`, `/workspace/doctorai-web-evidence/briefing-after/briefing-390.png`, and `/workspace/doctorai-web-evidence/briefing-after/briefing-verification.json`. All data is synthetic. No Library upload, branch push, PR, deployment, credentials, paid calls or production changes.

The earlier broad browser run remains incomplete. The next safe integration step is to run the remaining checks once, resolve any concrete failure, refresh evidence and cache versions, then publish the draft PR and fail-closed Preview without configuring credentials. This focused result does not establish full WCAG conformance or release readiness.

## Bounded integration follow-up

The remaining browser check passed **41 assertions and 34 axe states**, with no JavaScript errors or reported axe violations. It covered browser Back, seven Hub screens at 1440/768/390/320px, horizontal reflow, doubled root text with WCAG text spacing on the medicine page, six public pages at mobile width, preview billing disabled and an authentication-outage state. The earlier flow segment passed 19 assertions (manual medicine, appointment, notes save, briefing/consent/double activation, scanner, supported/unsupported files and switching away from self). Its readiness wait then failed because the test required only one status string; this was a harness issue, not a failing server save. The notes assertion verifies a server save; a full notes reload was not separately asserted.

Readiness now recognizes the existing scoped-record-loaded and session-only storage states. Back navigation now uses the visible sidebar; the obsolete hidden category bar is no longer its target. `--remaining` avoids repeating already executed flow assertions. Previous failed reports remain as history; the current passing report is `/workspace/doctorai-web-evidence/integration-remaining/web-verification.json`. Screenshots in that directory are current UI captures with synthetic records. Axe still has rules requiring human review; this is not a WCAG-conformance claim.

Final affected checks: JavaScript syntax (85 files), static checks (11 pages/201 references/CSP/offline versions), Preview isolation and diff whitespace. Protected PR33 core/cache/health/document handlers remain byte-identical. Published Privacy and Terms remain byte-identical to production. The shell cache is now v111 and the Hub stylesheet v69. No native Android changes. No production merge.

An owner-authorized isolated Preview setup is now permitted, but this workspace cannot provision or bind it through the connected tools: no storage/environment write actions, no Vercel CLI/token/session. No remote credentials/resources were created. See `docs/isolated-preview-owner-handoff.md` for the exact Preview branch bindings, free-tier constraints, test OAuth origin, disabled paid providers and required durable synthetic Pro seed. Signed-in deployed QA and policy approval remain release blockers.
