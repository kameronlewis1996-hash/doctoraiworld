# Patched development and CI runtime

Use Node **24.22.1** for this project. `.node-version` pins the release that contains the October 21, 2026 Node security fixes. `scripts/verify-node-runtime.cjs` rejects older patches and other major versions. Update this pin through a reviewed dependency/security change when a newer patched release is selected.

On Windows, run project commands through the launcher:

```powershell
./scripts/dev-node.ps1 --version
./scripts/dev-node.ps1 scripts/build-health-alerts.cjs
./scripts/dev-node.ps1 scripts/verify-medication-catalog-search.cjs
```

The launcher first uses `.tools/node-v24.22.1/node.exe` when present, otherwise the Node executable on PATH. It checks the patch floor before executing the requested command. It never changes the machine PATH, replaces Codex's managed runtime, or reads credentials. Other platforms can select `.node-version` with their existing version manager, then run `node scripts/verify-node-runtime.cjs` before project commands.

The installed Windows portable binary came from `https://nodejs.org/dist/v24.22.1/win-x64/node.exe`. Its SHA-256 matches the official release page and `SHASUMS256.txt`:

```
d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5
```

Windows Authenticode verification reported **Valid**, signer **OpenJS Foundation**. The binary lives in ignored `.tools/`, is not committed, and is excluded from Vercel uploads. Install only verified official packages/binaries; do not use an executable from an email attachment or an unverified mirror.

CI reads the same `.node-version` pin and checks the runtime before regression tests. The broad `node-version: '24'` setting previously selected cached Node 24.21.0, so a major-only setting was insufficient for this security fix.

`package.json` retains `engines.node: "24.x"`. That setting controls Vercel's managed runtime separately; the local/CI patch does not prove which production patch is running. Confirm the provider rollout and production runtime independently. Codex's own bundled Node remains application-managed; use the project launcher for this work until the host application's supported update replaces that bundled runtime.

Official references:

- https://nodejs.org/en/blog/release/v24.22.1
- https://vercel.com/kb/bulletin/node-js-security-advisory
- https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md
