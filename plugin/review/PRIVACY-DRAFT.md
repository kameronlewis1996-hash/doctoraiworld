# Public plugin privacy addition — owner review draft

Prepared 3 October 2026. This is not a published policy or a compliance certification. It covers only the public ChatGPT plugin, not Health Hub accounts, website AI chat, scanning, Android, or medical records.

## Proposed wording

The DoctorAIWorld public ChatGPT plugin provides feature guides, website links and public biomedical references. It does not sign in to a DoctorAI account or read, write or check private health records. Do not provide names, contact details, prescriptions, personal symptoms, medical histories or other personal health information to its tools.

The public server receives the selected feature or destination, or the general research topic needed for a literature search. For research, the topic is sent over HTTPS to Europe PMC at EMBL-EBI to retrieve public references. The application sends that topic and public search parameters, with a service user-agent; it does not deliberately forward your ChatGPT history, account identifiers or Health Hub records. The recipient also receives network information needed to serve the server's request. Input checks reject some obvious identifying patterns but cannot detect every form of personal information.

Vercel hosts the public server. It processes technical request and operational information, such as request times, routes, status codes and network metadata, to deliver, troubleshoot and secure the service. The reviewed public-server code has no database connection or application logging of tool arguments and does not store a Health Hub record or a search-history database. Responses request no caching. These implementation choices do not disable Vercel's infrastructure logs or Europe PMC's processing.

As of 3 October 2026, the public-MCP project is on Vercel Pro with Observability Plus active. Vercel documents 30-day runtime-log and metrics windows for Plus. Those are observability windows, not deletion guarantees for every provider-held data category. Europe PMC's REST API documentation refers users to its Europe PMC Privacy Notice, which describes anonymous browsing and personal data collected through web logs and analytics. I could not verify a distinct retention period for Europe PMC search queries or API logs; that period is **unknown**. Retention for other Vercel security, account, backup or operational data also remains unverified. We do not claim zero retention or that copies are deleted when a dashboard window ends.

You can avoid transmitting research topics by not using the research tool, stop using the connection, or disconnect it in ChatGPT. ChatGPT conversations remain subject to OpenAI's applicable settings and policies. For a privacy request, contact support@doctoraiworld.com without sending health records. Requests involving provider-held information may require coordination with that provider; no deletion outcome is promised here.

## Facts the owner must resolve before publication

1. Contact Europe PMC to confirm how its notice applies to this REST search endpoint, what query and technical data are retained, the retention period and available rights/request process. The public API docs point to its Privacy Notice, but a service-specific duration for API queries/logs could not be verified here.
2. Verify the actual Plus billing scope and saved Vercel spending/pause settings. The current user-stated settings have no usage cap and automatic pausing is off; the default US$200 alert is not a US$20 hard cap. Confirm any log exports or drains and the scope/retention of other provider-held operational data.
3. Confirm the support contact and applicable privacy rights/contact procedure. The public website policy must actually incorporate the approved plugin text before claiming this gap closed.

## Source notes and limits

- [Europe PMC REST API documentation](https://europepmc.org/RestfulWebService) directs public API users to its privacy notice.
- [Europe PMC Privacy Notice](https://europepmc.org/PrivacyNotice) is described as covering anonymous browsing and personal data collected through web logs and analytics. The API query/log retention duration was not verified; do not substitute a different EMBL-EBI site's retention figures.
- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime): Plus runtime logs are retained for 30 days.
- [Vercel Observability Plus](https://vercel.com/docs/observability/observability-plus): Plus metrics and runtime-log windows are 30 days; Plus is metered at US$1.20 per million events.
- [Vercel Privacy Notice](https://vercel.com/legal/privacy-notice): purpose-based retention and deletion/anonymisation; no single fixed maximum for all customer infrastructure data is stated here.
- [OpenAI plugin privacy requirements](https://developers.openai.com/plugins/plugin-guidelines): disclose categories, purposes, recipients, retention and user controls. This draft requires owner review and publication.
- Implementation evidence: `public-mcp/api/mcp.js` sends `topic` as the Europe PMC `query` parameter. `safeTopic` is heuristic; `Cache-Control: no-store` is not a provider retention policy. This source review does not prove every deployed configuration is identical.
