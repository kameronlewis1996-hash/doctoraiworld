# DoctorAI World buyer handover notes

**Evidence snapshot:** 16 October 2026. This is a repository-level inventory for due diligence, not a valuation, legal opinion, clinical review, or confirmation of control over external accounts. It makes no claims about usage, customers, traction, or clinical performance.

## Snapshot and transfer status

The repository remote is `kameronlewis1996-hash/doctoraiworld.git`. The local branch is `codex/aurora-alert-theme-20261016`; PR #76 is a draft. It includes the selected aurora presentation and merges PR #75 head `6f5fc90ebcf609c241c3023bf4b43525a22e5b36` for a combined preview. This working branch is review material, not a clean, immutable transfer snapshot. Agree on a tagged commit and export it separately before any transfer.

The deployed service, domain registrar, DNS, provider accounts, production configuration, and production data stores were not inspected for this note. Repository references are evidence of configuration and source content only; they do not prove account access, ownership, legal title, or transferability.

## Inventory and evidence

| Asset | Repository evidence | Ownership or transfer status |
| --- | --- | --- |
| Main website and application code | Root HTML/CSS/JS pages; Vercel API handlers under [`api/`](../../api/); shared logic under [`server-src/`](../../server-src/); static checks and build helpers under [`scripts/`](../../scripts/). The root README identifies the project as `doctorai-health-hub`. | Source is present in the GitHub repository. No root `LICENSE` or chain-of-title record was found in the reviewed materials. Repository access does not establish the right to transfer every contribution. |
| Public MCP service | Separate [`public-mcp/`](../../public-mcp/) package and deployment notes. Its README names Vercel project `doctoraiworld-public-mcp` and canonical host `mcp.doctoraiworld.com`; root [`vercel.json`](../../vercel.json) rewrites the main site's MCP routes to that host. | Source and deployment references are present. Vercel project access, custom-domain control, challenge-token custody, and rights to transfer the service are unverified. The MCP README says it is separate from private Health Hub storage. |
| Domains and email identity | Site metadata and README use `doctoraiworld.com` / `www.doctoraiworld.com`; the public MCP README and Vercel rewrites use `mcp.doctoraiworld.com`. Pages use `support@doctoraiworld.com`. | These are configured names, not registrar or mailbox proof. Registrar account, renewal date/cost, DNS control, email-provider access, and transfer authorization were not found in the repository. |
| Brand and visual assets | Root contains `doctorai-public-logo-transparent.png`, `doctorai-head-logo-transparent.png`, `doctorai-app-icon.png`, `doctorai-social-preview.svg`, homepage/research/medication/checklist social previews, `doctorai-medicine-illustration.png`, two Health Hub QR SVGs, and `google-g-logo.svg`. HTML and [`manifest.webmanifest`](../../manifest.webmanifest) reference several of these. | Files are included in source control. Editable originals, creator contracts, trademark registrations, logo assignments, and permission for each asset were not found. The Google “G” mark and Google-hosted fonts are third-party assets; their use and transfer remain subject to their applicable terms. Do not represent repository presence as proof of exclusive brand ownership. |
| Medication data and prompts | Bundled files are under [`data/medication/`](../../data/medication/). The repository includes an October 2026 Pharmac product terminology catalogue and a filtered safety seed; details and attribution are recorded in [`docs/nz-medication-database.md`](../nz-medication-database.md), [`docs/medication-provenance-release-audit.md`](../medication-provenance-release-audit.md), and the [provenance ledger](../medication-provenance-exclusions.json). | The Pharmac source is documented as CC BY 4.0 with attribution and non-endorsement text. This does not establish rights to unrelated clinical databases or every historical rule in the repository. See the rights section below. |
| Deployment and provider configuration | [`vercel.json`](../../vercel.json), [`.vercelignore`](../../.vercelignore), [`package.json`](../../package.json), [`.env.example`](../../.env.example), and `public-mcp/README.md` describe project names, routes, dependency preparation, environment-variable names, and service integrations. | The reviewed environment template has blank values. Provider settings, accounts, invoices, and contracts were not inspected and must be independently located and reviewed. |

The combined main-site shell identifies cache `doctorai-shell-v153`, `health-hub.js?v=94`, `hub-category-themes.css?v=2`, `accessibility.css?v=13`, and `aurora-theme.css?v=3`. These are source-tree cache tags, not deployment or release evidence.

## Local setup and deployment handover

The root [README](../../README.md) specifies Node.js 24 and the pnpm version in `package.json` (11.19.0). It documents this local setup:

```sh
pnpm install
pnpm run check:js
pnpm run verify:static
```

The static verifier uses PowerShell. Focused commands are listed in [`package.json`](../../package.json), including `verify:medication-database`, `verify:medication-safety`, `verify:medication-pipeline`, `verify:medication-evidence`, `verify:health-state`, `verify:record-preparation`, `verify:alerts`, `verify:alerts-presentation`, and `verify:stripe`.

The [environment template](../../.env.example) contains names and blank placeholders, not working credentials. It covers the app URL, Google OAuth, auth secret, Vercel Blob, KV, OpenAI, Resend, Stripe product/prices/secrets/webhook, and the complimentary Pro code. The root README directs operators to keep production and preview credentials separate. Do not copy secrets into a handover document or commit them.

The main site is configured for Vercel clean URLs and API routes in [`vercel.json`](../../vercel.json); the root README names the Vercel project `doctorai-health-hub`. `pnpm run prepare:vercel` is a helper for an already-created `.vercel/output`: it installs dependencies into the document and Stripe function artifacts and verifies their packages are present. The repository does not document the account-linking, build invocation, domain assignment, environment promotion, or production approval sequence. Obtain the current Vercel runbook and account access before attempting deployment.

The MCP service has its own instructions in [`public-mcp/README.md`](../../public-mcp/README.md): run `npm test` from that package, deploy it to the separate `doctoraiworld-public-mcp` Vercel project, verify the preview, then promote the same artifact. It requires an `OPENAI_APPS_CHALLENGE_TOKEN` in that project's environment; the value is intentionally not in the repository. The README says to preserve the configured production token, but does not prove who controls it.

## Recurring costs and commercial configuration

No vendor invoice or schedule of operating costs was found in the reviewed repository materials. Actual operating costs are therefore **unknown** and need confirmation in provider billing accounts.

| Cost area | What the source shows | Amount / status |
| --- | --- | --- |
| Domain registration and email | Domain and support email are configured in site content. | Renewal and mailbox costs unknown; registrar and mail account not evidenced. |
| Vercel hosting and functions | Two Vercel project names are documented; function routes are configured. | Plan, usage charges, and invoices unknown. |
| Blob and KV storage | `.env.example` lists Vercel Blob and KV environment-variable names. | Provider, plan, volume, and charges unknown. |
| OpenAI API | Chat and consented label-text extraction are named in the privacy notice; API keys/model variables are in `.env.example`. | Model configuration, volume, and charges unknown. |
| Stripe | Subscription checkout, billing portal, and webhook code are present. | Processing fees and account terms unknown. |
| Resend, Google, Europe PMC | Resend, Google sign-in, and Europe PMC research search are named in the privacy notice or source configuration. | Account plans and charges unknown. |

The monthly Pro catalog constant is NZD 2,900 cents (NZ$29) per month in [`server-src/stripe/plan-catalog.cjs`](../../server-src/stripe/plan-catalog.cjs). It is a customer-facing plan price, **not** an operating cost or evidence of sales. The annual interval is selected from the live Stripe price record, so its amount is not fixed in source. The repository does not establish whether either live price is currently configured or available.

## Third-party rights, datasets, and exclusions

- **Pharmac terminology:** The repository documents the October 2026 community and hospital schedule as CC BY 4.0. The database note reports 3,419 product/formulation records, of which 113 have incomplete ingredient lists. It includes attribution and states that Pharmac does not endorse DoctorAI. The accompanying disclaimer says a schedule listing does not establish Medsafe approval, current supply, suitability, funding eligibility, or complete interaction coverage. Preserve the attribution and disclaimer if the data are reused; confirm the exact source version and licence in any transfer package.
- **Safety rules:** The release audit retains only records with record-level CC BY 4.0 evidence, canonical licence URLs, and attribution, or explicitly internally attributed DoctorAI prompts with no external source. The documented active set is two pairwise prompts, one multi-medicine prompt, no medicine-condition prompts, and two internally authored allergy prompts. It excludes 1,269 source-derived rules while rights or attribution are unclear. The unmatched and partial pairs remain unassessed; no alert does not mean safe. This dataset is not clinically validated and no NZF production authorization is claimed.
- **Health New Zealand Top 100:** The ranked table and derived counts were removed because a dataset-specific reuse licence was not confirmed. The rights-filtered audit is [`docs/top-100-common-prescriptions-coverage-audit.md`](../top-100-common-prescriptions-coverage-audit.md). Do not restore those counts without verifying the licence for that exact dataset and release.
- **NZMF test access:** A separate working note says NZMF test access is not a transferable production licence, but no underlying NZMF agreement, terms, expiry, fee, or permission appears in the repository. Treat this as an **unverified diligence flag**; obtain written confirmation directly from the rights holder. Do not include test access or claim production rights in a transfer unless the licence says so.
- **Retired medication providers:** The privacy notice says NZF/NZULM product and interaction requests and DrugBank ingredient-check requests are retired. The current limited rules check uses local DoctorAI data. Historical match details may remain in private records and are not used by the current check; production storage was not inspected here.
- **Other services and assets:** The privacy notice lists Vercel, Google, Stripe, OpenAI, Europe PMC, and Resend. Their account terms, data-processing terms, transfer rights, and applicable fees are outside this repository. Package dependencies include `@vercel/blob` and `stripe`; verify their licence notices and any transitive dependency obligations for a commercial transfer. No broad third-party rights clearance is implied by this inventory.
- **User information and credentials:** The `.env.example` contains placeholders and `.gitignore` excludes `.env*`. This does not establish that remote provider accounts, production stores, or backups contain no credentials or health information. Do not include secrets, user accounts, payment accounts, or health data in a source transfer; separately establish lawful handling with the relevant account and data owners.

## Test evidence and remaining gaps

The integration lead ran the combined worktree locally on 16 October 2026: JavaScript syntax (82 files), static verification (93 required files / 12 production pages), alert status (15 checks), alert presentation (12 checks), medication evidence, four-main-route flows, local medication UI, record preparation, health-state contract, open catalogues, Today diary, device storage and the remaining package verifiers all passed. This is local test evidence, not a GitHub Actions result or production acceptance. The review notes [`aurora-medication-provenance-20261016.md`](../design/aurora-medication-provenance-20261016.md) and [`aurora-privacy-regression-20261016.md`](../design/aurora-alert-theme-20261016/aurora-privacy-regression-20261016.md) provide scope and limitations.

An earlier medication-review snapshot caught a stale assertion expecting shell cache v145 after the source had advanced. The combined verifier now expects v153 and Health Hub JS v94; the fresh local rerun reported above passed after reconciliation. Confirm the final committed source and the corresponding remote workflow result before treating checks as release gates.

The repository's dated readiness and review notes leave live or clinical checks open. In particular, the source does not provide evidence of live Google OAuth, cross-device durable storage, production Stripe checkout/webhooks, real-label OCR, real export/deletion, storage-quota/security denial behavior, screen-reader acceptance, or real-device acceptance. No clinical validation or NZF production authorization is established. The separate MCP `npm test` script exists, but a current result was not reported in the local rerun.

A [combined-build fictional journey](../design/aurora-fictional-journey-20261016.md) completed entry, Today/My Health navigation and an explicitly selected Visit Prep review. Deleting its synthetic active medicine and diary entry left the medicine's automatically generated history event available in the Timeline and as a Visit Prep option; the review found no per-item removal control for that event. The broad device-data purge was not used. This is a concrete cleanup/expectation gap to resolve before claiming complete record deletion from the ordinary medicine flow.

## Handover items to resolve

1. Establish the legal seller/entity, contributor assignments, source/artwork provenance, and rights to the DoctorAI name and marks. Repository control alone is not chain-of-title.
2. Identify the registrar and transfer authority for both domain hosts; confirm renewal status and associated email account control.
3. Identify administrators of both Vercel projects, production and preview environments, DNS records, secrets, storage, billing, and the MCP challenge token. Rotate secrets into buyer-controlled accounts; do not pass credentials in this document.
4. Obtain source agreements for NZMF test access and any other non-CC-BY dataset; record allowed use, transfer, attribution, term, and production status. Keep excluded Health New Zealand Top 100 figures out until rights are confirmed.
5. Agree explicitly whether any existing hosted data or accounts are excluded. This repository review did not inspect their contents or establish a transferable data basis.
6. Take a clean, tagged source snapshot; run the documented checks on that snapshot and retain the workflow result. Review Terms and Privacy notices for the intended operator and jurisdiction before transfer or continued service.
