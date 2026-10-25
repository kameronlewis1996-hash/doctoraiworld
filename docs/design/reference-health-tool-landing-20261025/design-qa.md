# DoctorAI reference-layout review

final result: blocked

## Grounding and scope
- Exact supplied image: Library `libfile_34009c2799608191b4bca93a3b56cb97`; SHA-256 `3f90c2ae94c9c8b326e0c62d7b9ba5fe72186a085b71cbf4ee0a7df5d3dbf7a1`. Actual pixels inspected.
- Base: `e6521fcecd9d43741e960a5d4d14ddbc1df1a2bf`.
- Applied reference hierarchy to My Health's existing landing, not Today: official brand, short tagline, account controls, two-column six-tool grid. The source's burgundy branding, phone bezel, hand and video-player chrome were deliberately excluded.
- Retained DoctorAI logo assets and existing outline icons, white/icy-blue/pastel palette, all six existing panel routes, and Today/My Health/Visit Prep/Profile navigation. No Reports invented.
- Checking/unavailable states never show signup/account identity; confirmed signed-in state replaces signup prompts with Today/account actions. Both signed-out actions use the existing Google account flow. No new authentication provider.
- Expanded tiles appear on the My Health landing only; nested tools retain the compact existing section selector. Today remains personal focus, next appointment and check-in.
- Clinical rules, alert semantics, privacy/ownership/session gates, storage choices and pricing were not altered.

## Passed checks (local code, synthetic data only)
- JavaScript syntax, shared four-tab navigation, actual alert renderer (14 checks).
- Device-health storage, browser-serializer/API health-state contract, record preparation, diary validation, subscription UI.
- New `node scripts/verify-health-tool-landing.cjs`: actual presentation block tested for checking/unavailable/signed-in/signed-out states; all six panel mappings and icons, four bottom tabs, focus/touch CSS and PWA cache inclusion.
- Exact current-code checkout and official logo blob hashes verified against base.

## Blockers / not verified
- Browser automation tests could not launch Chromium: sandbox `socket() failed: Operation not permitted`.
- Cloud preview server was not reachable outside the sandbox. The supported escalation attempt failed in its wrapper with `bwrap: Can't create file at /home/agent/.codex/sessions: Read-only file system`. That path was not read or modified; no permission workaround was attempted.
- Therefore **320px/390px/desktop visual comparison, real rendered touch/focus/overflow, all tile-click/back flows, actual sign-in dialog dismissal, loading/error visual states and screenshots remain unverified**. Build/source success is not visual success.
- PowerShell aggregate check not run: PowerShell is not installed in this workspace.
- No production credentials, health data, payment, production deployment, or real OAuth login used.

## Completion gate
Keep this PR draft. Inspect an authorized hosted preview on mobile and desktop; capture comparison screenshots, exercise all six tools and keyboard/auth transitions, resolve visual issues, run required CI on final head. Do not merge or describe as shipped until that gate is satisfied.
