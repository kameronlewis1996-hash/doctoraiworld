# DoctorAIWorld public MCP

This separately deployed Vercel service exposes three public read-only tools.
It has no dependency on private Health Hub storage, account sessions, or API keys.
The main website rewrites `/api/mcp` to this service to keep existing installed
plugin connections working. Keep the service separate from the health website's
serverless function inventory. The website deployment excludes this directory.

Run `npm test` here. Deploy this directory to the existing
`doctoraiworld-public-mcp` project, verify the preview, then promote that exact
artifact. Preserve its production `OPENAI_APPS_CHALLENGE_TOKEN` environment
variable; never commit the token. The challenge route supports the saved public
submission's domain verification.

Canonical public URL:
- `https://mcp.doctoraiworld.com/api/mcp`

The main website keeps `https://www.doctoraiworld.com/api/mcp` as a compatible
rewrite to the canonical endpoint. The OpenAI plugin package should use the
canonical custom domain so its MCP server and domain challenge share one public
origin. The Vercel-generated deployment hostname remains protected by project
SSO and should not be submitted as the plugin endpoint.

Both use stateless Streamable HTTP POST with JSON responses. GET returns 405
because this server does not provide a separate SSE stream. Supported protocol
versions: 2025-03-26, 2025-06-18, 2025-11-25, 2026-01-26.

Research search accepts only the preset general topics declared in the tool
schema. The server maps each accepted topic to a fixed Europe PMC query, so it
never forwards user-entered search text. The public plugin does not access
accounts, private Health Hub data, or documents; it does not scan labels,
assess personal medicine safety, or diagnose.
