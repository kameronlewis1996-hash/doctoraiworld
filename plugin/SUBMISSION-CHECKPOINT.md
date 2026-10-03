# DoctorAIWorld public plugin checkpoint — 3 October 2026

## Existing submission and canonical archive

- Keep existing app `asdk_app_6abad626f21081918f3a49e848c0e3cc`, draft version `1.3.0`; do not create a duplicate.
- Required package name: `app-6abad626f21081918f3a49e848c0e3cc`.
- [Existing portal draft](https://platform.openai.com/plugins/manage/plugin_asdk_app_6abad626f21081918f3a49e848c0e3cc?version=appsub_6abf31a639b481918a49884f42ff26a3).
- Parent verified the canonical ZIP: 208,055 bytes, SHA-256 `bef77e6452dcb430b1ff8f9406db37eebec6624572abaa0c41534974a5de50da`. Library ref `libfile_ef29e4f059a48191a741d1fb7f6568cb`, version 0, file `file_000000003fdc81f683d3f9170cca34c7`.
- Parent supplied its exact manifest, MCP and README entries. The package name, version and dedicated endpoint `https://doctoraiworld-public-mcp.vercel.app/api/mcp` are correct. PR #35 syncs the repository metadata to those values. The canonical ZIP bytes were not materialized here; don't retry the failed transfer or reconstruct it from repository files. Keep icon bytes unchanged.
- Do not invent `demo_recording_url`. The actual accessible recording must be added to the complete package after capture.

## Completed in draft PR #35

[Public-plugin-only PR #35](https://github.com/kameronlewis1996-hash/doctoraiworld/pull/35) contains:

- Repair of two unescaped apostrophes in the public MCP handler.
- Research schema rejection test for the unsupported `limit` parameter (`topic` only).
- Repository package-name and MCP endpoint reconciliation.
- Reviewer recording run sheet, privacy wording and hosting decision.
- Prior local result: `npm test` passed 8/8; research response is mocked. This was not rerun.
- Five installed positive tool calls were already verified in the parent task. This worker did not repeat them.

A read-only GET to the live MCP URL returned HTTP 405 with `Allow: POST, OPTIONS`, which confirms the route is reachable and POST-only; it does not verify MCP tool-call results. The server's POST response could not be queried from this restricted executor. No deployment was made.

## Remaining ChatGPT evidence

This executor has no supported signed-in ChatGPT browser or screen-recording control. A specific capture request is pending: in the parent's existing signed-in ChatGPT browser, add the existing DoctorAIWorld connection from the tools menu, run the five public prompts and each of the three boundary prompts in a fresh chat, and record the genuine interactions without PHI. Return the reviewer-accessible video URL. Preserve observed tool calls/refusals; no scripted outcomes may be presented as actual results.

When available, add the actual URL under `extensions.com.openai.review.demo_recording_url` in the full canonical ZIP, preserving all other entries and icon bytes. No upload-ready ZIP is present here.

## Privacy and current hosting facts

- Vercel Pro was purchased independently by the owner. Upcoming invoice: US$20; New Zealand billing details are correct.
- Observability Plus is active, metered at US$1.20 per million events, with 30-day runtime-log and metrics windows.
- Requested cap: US$20 total, US$0 overage. Current settings have no usage cap, the default US$200 alert and automatic pause off. This is not a hard spend cap. No further paid model calls or extra resources are authorized.
- The [privacy draft](review/PRIVACY-DRAFT.md) distinguishes Vercel's verified 30-day windows from Europe PMC retention, which remains unknown. Europe PMC's [REST API docs](https://europepmc.org/RestfulWebService) refer to its [Privacy Notice](https://europepmc.org/PrivacyNotice) for web logs and analytics; no distinct API query/log retention period was verified. Owner review and publication remain required.

## Exact owner declarations before submission

The owner must personally review these six unchecked declarations in the existing portal: terms/policy; industry-law compliance; no money/crypto/investment transactions; necessary IP/API rights; suitability for under-18s; and no under-13 targeting or personal-information collection. Present the complete package, disclosure, video and these exact declarations to the owner before final submission. Do not check unsupported declarations or promise approval.

No declaration was checked, no public policy published, no production deployment made, and no store submission performed. Store review outcome cannot be guaranteed.
