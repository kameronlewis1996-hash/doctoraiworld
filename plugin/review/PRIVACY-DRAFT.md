# Public plugin privacy addition — owner review draft

Prepared 3 October 2026. This is not a published policy or a compliance certification. Retention questions below must be resolved before adopting the wording. It covers only the public ChatGPT plugin, not Health Hub accounts, website AI chat, scanning, Android, or medical records.

## Proposed wording

The DoctorAIWorld public ChatGPT plugin provides feature guides, website links and public biomedical references. It does not sign in to a DoctorAI account or read, write or check private health records. Do not provide names, contact details, prescriptions, personal symptoms, medical histories or other personal health information to its tools.

The public server receives the selected feature or destination, or the general research topic needed for a literature search. For research, the topic is sent over HTTPS to Europe PMC at EMBL-EBI to retrieve public references. The application sends that topic and public search parameters, with a service user-agent; it does not deliberately forward your ChatGPT history, account identifiers or Health Hub records. The recipient also receives the network information needed to serve the server's request. Input checks reject some obvious identifying patterns but cannot detect every form of personal information.

Vercel hosts the public server. It processes technical request and operational information, such as request times, routes, status codes and network metadata, to deliver, troubleshoot and secure the service. The reviewed public-server code has no database connection or application logging of tool arguments and does not store a Health Hub record or a search-history database. Responses request no caching. These implementation choices do not disable Vercel's infrastructure logs or Europe PMC's processing.

Requests and research results are processed transiently by the application. Vercel's documented runtime-log retention for the currently observed Hobby plan is one hour, with basic metrics available for 12 hours. Pro without Observability Plus has one-day runtime-log and basic-metrics windows. However, Plus is enabled by default on new Pro upgrades and has 30-day windows; the actual configuration must be confirmed before publishing the final retention statement. These limits cover runtime logs, not every category of provider security, account, backup or operational data. Europe PMC API query retention and the applicable retention of other hosting data still require confirmation. We do not claim zero retention or that all copies are deleted when a runtime-log window ends.

You can avoid transmitting research topics by not using the research tool, stop using the connection, or disconnect it in ChatGPT. ChatGPT conversations remain subject to OpenAI's applicable settings and policies. For a privacy request, contact support@doctoraiworld.com without sending health records. Requests involving provider-held information may require coordination with that provider; no deletion outcome is promised here.

## Facts the owner must resolve before publication

1. Confirm Europe PMC's notice/terms for the exact REST search endpoint, what query/technical data it retains, how long, and the available request/deletion process. No service-specific retention period was established in this review.
2. Confirm the actual hosting plan at publication, any log exports/drains, and the scope and retention of other provider security/operational data. The parent observed Hobby, no Drains shown and Observability Plus inactive on the separate public-MCP project. A plan upgrade requires updating this wording and checking the default activation of Observability Plus; project exclusion or team-wide disabling requires the owner's decision.
3. Confirm the support contact and applicable privacy rights/contact procedure. The public website policy must actually incorporate the approved plugin text before claiming this gap closed.

## Source notes and limits

- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime): Hobby one hour, Pro one day, Pro with Observability Plus 30 days. A hosting upgrade changes these limits immediately.
- [Vercel Observability Plus](https://vercel.com/docs/observability/observability-plus): basic metrics: Hobby 12 hours, Pro one day; Plus runtime logs and metrics: 30 days. Plus is enabled by default on Pro teams created or upgraded on or after 3 April 2026. Confirm the saved project inclusion setting after any upgrade.
- [Vercel Privacy Notice](https://vercel.com/legal/privacy-notice): explains purpose-based retention and deletion/anonymisation. It supplies no single fixed maximum covering all customer infrastructure data; confirm the applicable contractual/provider information.
- [EMBL-EBI corporate website notice](https://www.ebi.ac.uk/data-protection/privacy-notice/embl-ebi-public-website/): explicitly concerns its corporate website. Its 30-day removal of recorded IP addresses and 90-day security-log period are **not evidence for Europe PMC API query retention**.
- [OpenAI plugin privacy requirements](https://developers.openai.com/plugins/plugin-guidelines): policy must cover data categories, purposes, recipients, retention and user controls. This draft's unknowns remain submission blockers.
- Implementation evidence: `public-mcp/api/mcp.js` sends `topic` as the Europe PMC `query` parameter. `safeTopic` is heuristic; `Cache-Control: no-store` is not a provider retention policy. This source review does not prove that every deployed configuration is identical.
