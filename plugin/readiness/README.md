# DoctorAI ChatGPT integration readiness (2026-10-17)

The repository already implements the small public integration needed for a
ChatGPT plugin. `public-mcp/api/mcp.js` advertises three read-only MCP tools:
website feature guidance, direct website section links, and public research
searches restricted in this checkout to eleven preset general topics.
`plugin/plugin.json` and `plugin/mcp.json` package that endpoint for ChatGPT and
Codex. This folder does not add a duplicate server or connect private Health Hub
accounts.
This `readiness/` directory is local development material; omit it when making
the plugin submission ZIP.

Current official OpenAI documentation calls this a **plugin** with an MCP
server. Earlier Apps SDK URLs redirect to the current plugin documentation.
The documented route is a portable `plugin.json` and `mcp.json` package, a
streamable HTTP MCP endpoint, direct tool testing, then a saved draft, scan,
review, and publication. A public submission requires an accessible HTTPS
endpoint, verified developer identity, domain verification, and portal review.
The server's tool annotations are scanned and must match real behavior.

Official references:

- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission)
- [Remote MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review)

## Local verification

Run from the repository root with Node 24:

```text
node plugin/readiness/verify.cjs
node plugin/readiness/verify.cjs --live
node --test public-mcp/test/mcp.test.cjs
```

The first command uses only the checked-out handler and fictional test fixtures;
it intercepts the research HTTP call. The `--live` option sends **only**
`initialize` and `tools/list` to the public endpoint and fails if its version
or advertised schema differs from this checkout. It sends no account details,
health facts, or research queries. The existing MCP suite is a separate server
unit test.

## Findings and remaining gates

As observed on 2026-10-17, the checkout is version 1.3.1 while the public
endpoint reports version 1.3.0. The live `search_health_research` tool still
advertises a free-text topic (`minLength: 2`, `maxLength: 180`), whereas this
checkout restricts it to an eleven-value enum. The public endpoint therefore
does not yet have the checked-out restriction. The existing unit suite passed
7 of 8 cases at baseline; its only failure expected version 1.3.0 even though
the handler and package are 1.3.1. The test now checks the package version, so
local tests pass. Deploy and verify the exact approved source separately; this
readiness work does not alter the handler or production endpoint.

For ChatGPT readiness, the next checks are:

1. Have the MCP owner deploy the approved fixed-topic source to the existing
   endpoint. Run the local and read-only live verification commands above and
   inspect each tool with MCP Inspector, including rejected unsupported inputs.
2. In the existing saved draft, confirm the verified publisher identity and
   domain challenge, current privacy/support/terms pages, and that its
   discovered tool metadata matches the approved endpoint. Resolve portal
   findings before review.
3. Test direct, indirect, follow-up, and unsupported prompts in ChatGPT on the
   installed draft. Record selected tools, arguments, responses, and refusal
   behavior. Local MCP tests cannot establish model tool selection or
   conversation-level clinical boundaries.
4. The publisher supplies the required demonstration, legal/policy
   attestations, and review submission in the portal. Approval and public
   listing cannot be inferred from a working local MCP server.

No OAuth, account-linked tools, credentials, paid services, public publishing,
or production changes are part of this readiness check.
