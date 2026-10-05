# DoctorAI website release review

Updated 6 October 2026, New Zealand time. **Status: public release remains open; the older staged candidate must not be promoted.**

## Current live release — rechecked 5 October 2026

| Check | Current result |
|---|---|
| Production deployment | `dpl_HNJ3VbJoah7sXJCSfgphDpSwtnrB`, Ready, GitHub `main` commit `f182faa` (“Prepare DoctorAIWorld public app submission fixes”). The custom domains are assigned to the Production project. |
| Public homepage | `https://doctoraiworld.com/` returns 200, but still shows the older Health Hub title and headline (“Organise your health details. Keep them together.”), not the checklist-led campaign entry in the older protected candidate. |
| Public account-deletion URL | `/account-deletion` returns 404 on both `doctoraiworld.com` and `www.doctoraiworld.com`. |
| Older staged candidate | `dpl_CMEh68U3fqRf96jA7RstB3rUqsZh` is Ready and its homepage/deletion route return 200, but it was built from `c478c7f`, before current `main` advanced to `f182faa`. The intervening mainline change retires several medication-provider handlers and changes Health Hub behavior. **Do not promote this older artifact.** |
| Current release changes | Code commit `4c4c028` is based on `f182faa`, preserving the current medication-provider retirement. Documentation/evidence head `0d24205` is the current draft [PR 48](https://github.com/kameronlewis1996-hash/doctoraiworld/pull/48) head. Its protected Preview `dpl_7dRvHaEDDXJAwvuZagrx2d8vzyoe` is Ready from that head. JavaScript syntax, account-deletion, staff deletion-route, Preview-isolation and static-site checks passed after the latest deletion-race hardening. No Production promotion has occurred. |

The current Preview routes and plan configuration have been read-checked. The subscriptions service remains unready because its Preview webhook secret is missing; shared Redis/Blob credentials also still need separate physical Preview resources. Checkout, webhook, document and deletion rehearsals, plus owner/privacy/clinical copy review, remain open. The existing candidates below document earlier releases and are not evidence for this commit.

## Current and earlier protected candidates

| Environment | Deployment | Result |
|---|---|---|
| Current protected Preview | `dpl_7dRvHaEDDXJAwvuZagrx2d8vzyoe` — [open Preview](https://doctorai-health-ix0xnd2v5-kameronlewis1996-3703s-projects.vercel.app) | Ready from `0d24205` (release source code unchanged from `4c4c028`; later commits record review evidence). Homepage, checklist, Privacy, Terms and account-deletion routes return 200. `/api/stripe/plans` reports the sandbox monthly and annual prices available. Auth config reports authentication/account/document storage and AI ready, but subscriptions false because the Preview webhook secret is absent. No checkout, signed webhook, account-storage isolation or deletion rehearsal occurred. |
| Protected Preview | `dpl_2xaA3pJH2YJE8mXFeWqBkEU2UBre` — [open Preview](https://doctorai-health-rfhyiph37-kameronlewis1996-3703s-projects.vercel.app) | Ready. The Preview plans endpoint returns both sandbox prices as available. The account-deletion page and the homepage, Privacy, Terms and checklist routes return 200. Auth config is intentionally not ready because a test webhook secret is not configured. |
| Staged Production | `dpl_CMEh68U3fqRf96jA7RstB3rUqsZh` — [open staged candidate](https://doctorai-health-3jk2knusl-kameronlewis1996-3703s-projects.vercel.app) | Ready; built with `--prod --skip-domain`. Read-only checks report auth ready, subscriptions ready, both live prices available, and the account-deletion page returns 200. |
| Public custom domains | `doctoraiworld.com`, `www.doctoraiworld.com` | The existing release remains live. The homepage still has the earlier Health Hub headline. `/account-deletion` still returns 404 on both public domains. |

Vercel assigned the staged candidate the project alias `doctorai-health-hub-kameronlewis1996-3703s-projects.vercel.app`; it did not move either custom domain. Project authentication protects deployment URLs. No custom-domain promotion, purchase, real-account deletion or Play submission occurred.

## Fixes reviewed

- Preview and Development now have separate KV keys, including rate-limit pipeline keys, account deletion markers, subscription tombstones, sessions, grants and audit entries. Custom deployment environments have their own namespace too.
- Non-production signatures and encryption derivation are separated. Production signatures, encryption salt, KV names and Blob prefixes preserve compatibility with existing records.
- Private document upload, retrieval and deletion use the current environment/account Blob prefix. Foreign, traversal and malformed metadata paths are rejected before Blob access.
- Every Stripe handler guards the configured live/test mode, including the billing portal, checkout verification, webhook and staff deletion inspection. Webhook event mode must also match the key. Preview checkout/portal returns use that deployment's origin.
- A deployed check exposed a Stripe restricted test-key prefix (`rkcs_test_`) that the server mode guard did not recognize. The guard and regression fixture now accept this format; the Preview plan endpoint confirms the sandbox key and both Price IDs work together. The Production key and monthly price are Production-only, and the Production webhook secret is no longer shared with Preview.
- The server now accepts the `providers` array that the Android client always includes in its health-sync payload. The earlier validator rejected that payload, including an empty providers array. The fix is in these protected candidates; the public backend still needs the reviewed release.
- Account health state, private-document metadata, pending Checkout sessions and entitlements now check the deletion marker before and after writes. If a deletion overlaps a write, the write is removed and reported as unsuccessful. Re-running a completed deletion now repeats the scoped cleanup to remove any data left by an interrupted or racing operation.

Environment namespacing is extra protection. Preview now has Stripe sandbox key and price configuration, but still needs a durable claimed sandbox, separate physical Redis/Blob resources and a signed test webhook before a provider rehearsal. The Vercel connection denied Blob-store and automation-bypass creation. [Owner setup checklist](doctorai-preview-setup.md).

## Evidence and limits

| Review | Evidence / result |
|---|---|
| Synthetic environment review | Passed with intentionally shared fake credentials: Production signature/encryption compatibility, rejection across environments, separated KV/pipeline keys, foreign document paths, the actual health API's provider payload, live-key rejection, webhook event mode, and Preview deletion leaving all Production records unchanged. All providers were mocked. |
| Regression scripts | Re-run in the reconciled review worktree: JavaScript syntax (59 files), account deletion, staff deletion route and Preview isolation passed after the deletion-race hardening. Earlier review evidence also records passing medication scan, NZF/FHIR, server-core, medication database and Stripe-pricing checks; they were not re-run in this review. |
| Static site | Re-run in the reconciled review worktree: 74 required files and 12 production pages passed. Current public requests independently confirmed the homepage returns 200 and `/account-deletion` returns 404 on both custom domains. |
| Builds and packaging | Current Preview and staged Production Vercel builds both completed successfully after the Stripe key-format fix. The 19-copy/eight-source package hash comparison belongs to the earlier package review and was not repeated for this small source change. |
| Current Preview routes | Read through the protected-deployment fetch on `dpl_7dRvHaEDDXJAwvuZagrx2d8vzyoe` on 6 October NZ time: homepage, Privacy, Terms, checklist and account-deletion pages return 200. `/api/auth/config` reports authentication, account storage, document storage and AI configured; subscriptions remains false because no Preview signing secret is set. `/api/stripe/plans` returns USD 9.99/month and USD 79/year as available. This is a configuration check, not a checkout, webhook or entitlement rehearsal. |
| Staged Production | Read-only Vercel CLI checks return 200 for plans, auth config and the deletion page. Auth config reports all services ready; both live prices are available. This is not a purchase rehearsal or approval of pricing. |
| Browser / public domain | Earlier review opened the staged homepage and checklist in Chrome. Requested phone widths 390 and 320 produced content/client widths 375 and 305 respectively, with no horizontal overflow. A synthetic clinic entry and a checked box were cleared; all fields were empty and all four boxes unchecked afterwards. Viewport override was reset. Individual checkbox coverage is incomplete because an initial automation action targeted the support checkbox instead of the requested first checkbox. These visual results predate the current Preview/Production deployment IDs. On 5 October the public homepage returned 200 with title “Free Health Hub for Appointments and Medicines \| DoctorAI”; `/account-deletion` returned 404 on both custom domains. |

Source checkpoint and machine-readable evidence: `C:\doctorai-launch-checkpoints\preview-isolation-20261004-2342` (`local-review-results.json`, `packaged-source-review.json`, `production-packaged-source-review.json`, `deployment-review.json`). Phone screenshot: `C:\doctorai-launch-checkpoints\doctorai-staged-release-20261004.jpg`.

## Remaining release requirements

1. Claim or replace the temporary Stripe sandbox before **11 October 2026**. Vercel's current connection returned 403 when creating a private Blob store or Protection Bypass for Automation. A project administrator must connect a separate Preview Blob/Redis resource and arrange the protected test webhook, then rehearse checkout, cancellation, signed webhooks, entitlements, cloud document operations and staff deletion using synthetic accounts.
2. Record the market/operator, exact public copy and clinical/privacy/legal decisions, support ownership, retention procedure, monitoring, recovery and rollback evidence. The deletion workflow remains disabled.
3. Complete installed-device review of the signed Android candidate and owner-approved Play declarations, testing and submission. The current app contacts the public backend, so its cloud-sync fix must be released before that path can pass on the current API.
4. Promote the exact reviewed **staged Production** artifact only after its release requirements are met, verify the custom domains and deletion resource, and record advertising measurement, creative and spend approvals.

Promoting a Preview creates a new Production build with Production variables. Final release verification must therefore refer to the staged Production deployment that is promoted. [Vercel promotion behavior](https://vercel.com/docs/deployments/promote-preview-to-production).
