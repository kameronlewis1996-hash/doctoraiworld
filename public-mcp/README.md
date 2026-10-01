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

Public URLs:
- `https://www.doctoraiworld.com/api/mcp`
- `https://doctoraiworld-public-mcp.vercel.app/api/mcp`

Both use stateless Streamable HTTP POST with JSON responses. GET returns 405
because this server does not provide a separate SSE stream. Supported protocol
versions: 2025-03-26, 2025-06-18, 2025-11-25, 2026-01-26.

Only general non-identifying research topics may be sent. Argument validation
rejects unsupported fields and obvious identifying text; it cannot establish
whether every arbitrary phrase contains private information. The caller must
respect the tool schema and privacy instructions. The public plugin does not
access accounts, scan labels, assess personal medicine safety, or diagnose.
