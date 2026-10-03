# DoctorAIWorld public plugin checkpoint — 3 October 2026

## Existing submission

- App: `asdk_app_6abad626f21081918f3a49e848c0e3cc`, draft version `1.3.0`.
- Required package name: `app-6abad626f21081918f3a49e848c0e3cc`.
- [Existing portal draft](https://platform.openai.com/plugins/manage/plugin_asdk_app_6abad626f21081918f3a49e848c0e3cc?version=appsub_6abf31a639b481918a49884f42ff26a3). Do not duplicate it.
- Parent verified publisher/domain and three public tools. Five installed positive tool calls already passed. Three negative conversations and a genuine walkthrough remain unverified.

## Completed in draft PR #35

[Review the public-plugin-only changes](https://github.com/kameronlewis1996-hash/doctoraiworld/pull/35).

- Repaired two unescaped apostrophes that prevented the repository public-MCP handler from loading. This is a source repair, not a live-service deployment.
- Local `npm test`: 8/8 passed, including rejection of an unsupported research `limit` argument. The only research argument is `topic`. Research HTTP responses are mocked locally.
- Renamed allowlist tests to distinguish server rejection from genuine ChatGPT negative-conversation evidence.
- Prepared [privacy wording](review/PRIVACY-DRAFT.md), [hosting decision](review/HOSTING-DECISION.md) and [real recording run sheet](review/DEMO-RUN-SHEET.md).
- `git diff --check` passed. Website/Android files, existing PRs and production settings were not changed.

## Canonical package handoff

Parent holds `doctoraiworld-portal-draft-1.3.0-20261003.zip`, 208,055 bytes, SHA-256 `bef77e6452dcb430b1ff8f9406db37eebec6624572abaa0c41534974a5de50da`.

Library reference: `libfile_ef29e4f059a48191a741d1fb7f6568cb`, version 0, file `file_000000003fdc81f683d3f9170cca34c7`. Supported local materialisation failed, including the single authorised network retry. Bytes were not verified in this workspace. Do not bypass that failed transfer or build from a stale repository archive. Exact manifest/server configuration text and ZIP entry names have been requested from the parent for reconciliation; the parent retains the complete canonical archive.

The verified canonical archive has the correct package name (`app-6abad626f21081918f3a49e848c0e3cc`), version (`1.3.0`) and dedicated MCP URL (`https://doctoraiworld-public-mcp.vercel.app/api/mcp`). The repository copies of `plugin.json` and `mcp.json` were synced to those values in PR #35. The canonical archive itself needs no identity/endpoint edits. No recording URL is available yet; add the actual accessible URL under `extensions.com.openai.review.demo_recording_url` after recording. No ready-to-upload archive was produced here.

## Exact remaining steps

1. Parent: use the existing ChatGPT connection to record the walkthrough in the run sheet, including three fresh negative conversations. Preserve actual outcomes/tool traces; check reviewer playback without sign-in. This worker has no supported ChatGPT browser/recording tool. Do not invent a successful result or use a promotional/synthetic clip.
2. Parent: reconcile the canonical manifest/server file, add actual recording URL and complete five positive/three negative review cases, then prepare a complete ZIP for the existing app/version-update flow. No reviewer credentials or custom-UI screenshots are needed for the current public tools.
3. Resolve Europe PMC REST-query retention/terms and other provider-held hosting data retention. Corporate EMBL-EBI website retention is not proof of API retention. Owner reviews the final plugin privacy addition and authorises its public publication separately.
4. Owner: choose compliant hosting. Existing Hobby is personal/noncommercial. Proposed Pro is a team-level subscription: confirm seats, checkout total, usage-overage budget and applicable agreements. New Pro upgrades enable Observability Plus by default; explicitly decide public-project exclusion versus team-wide disabling, or approve its extra usage cost and 30-day logs. One-day Pro logs require the actual Plus exclusion/disabled configuration. No spending or settings change has occurred.
5. Owner: personally review the six unchecked declarations: terms/policy; industry-law compliance; no money/crypto/investment transactions; necessary IP/API rights; suitability for under-18s; no under-13 targeting/personal-information collection. Submit only after the evidence and privacy gaps are closed and explicit submission approval is given.

No declaration was checked, no public policy published, no production deployment made, and no store submission performed. Store review outcome cannot be guaranteed.
