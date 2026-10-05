# DoctorAI operational launch runbook

**Status:** Draft for review; this is not yet an approved on-call or support procedure.  
**Updated:** 6 October 2026 (New Zealand time)
**Purpose:** Define the people, checks and stop conditions required before making DoctorAI public or buying ads.

## Current release assessment

| Area | Evidence in the current source | Launch status |
|---|---|---|
| Support | Privacy and Terms list `support@doctoraiworld.com`. The repository does not identify a staffed support owner, backup owner, queue, hours or response target. The email is also on the admin allowlist; that does not prove the mailbox is monitored or that an operational procedure exists. | **Open:** verify access, monitoring, staff and escalation coverage. |
| Account deletion | A staff-only deletion endpoint and panel now block the account, revoke its sessions, remove health and entitlement records, all private blobs under the account prefix (including orphaned files), metadata, free grants and matching account audit entries, and prevent matching Stripe subscription events from recreating entitlements. The endpoint checks customer-scoped subscriptions, account-email metadata search, stored subscriptions and recorded Checkout sessions before deletion, then repeats the billing check. Stripe warns that search indexing can lag; the panel therefore requires an independent staff review of recent and legacy records. A pseudonymous deletion marker is retained and same-email reactivation is blocked. The path is fail-closed unless `ACCOUNT_DELETION_WORKFLOW_ENABLED=true`. Synthetic storage and mocked-route checks cover interruption/retry, account isolation, feature-flag gating, changed-billing-email subscription blocks and owner attestation; real Stripe/Blob, owner verification and support fulfillment have not been rehearsed. A standalone `/account-deletion` request page is now in the local website candidate, linked from Privacy and included in the sitemap. Production still returns 404. | **Open blocker:** owner verification, legal/provider retention, deletion-marker retention/reactivation policy and support procedures are unapproved. Keep the workflow flag off until these exist; then rehearse provider deletion with synthetic records and verify the public request and device-local instructions. |
| Reliability monitoring | `reportError` writes a restricted event and allowlisted technical fields to server logs. No alerting destination or incident rota is configured in the repository. Vercel dashboard alerts and actual log access were not independently verified. | **Open:** name an owner and backup, configure and test alerts, set review frequency and incident thresholds. |
| Backup and recovery | Health records are encrypted before being written to configured account storage; document bytes are encrypted before private Blob storage. No repository backup/restore procedure or restore evidence was found. Provider-level retention, backup and recovery settings remain unverified. | **Open:** document provider retention and backup settings; rehearse restore with synthetic data and set owner-approved recovery targets. |
| Billing | Public Production `/api/auth/config` and `/api/stripe/plans` both returned HTTP 200 on 6 October; auth config reports `ready: true` with all services configured and both live prices available. These are configuration checks only: no Production checkout, renewal, cancellation, refund or webhook journey was run. The last route-verified Preview returns HTTP 200 for `/api/stripe/plans` with USD 9.99/month and USD 79/year test prices. Preview auth config reports authentication, account storage, document storage and AI configured, but subscriptions is false because the signed Preview webhook secret is missing. The Stripe connector exposes only the live account, and the temporary sandbox expires on 11 October 2026 unless claimed. | **Blocker for paid Pro rehearsals:** authorize the durable sandbox, configure the Preview signed webhook, then run synthetic purchase, entitlement, cancellation and renewal checks. Do not copy secret values into this runbook or use live credentials in Preview. |
| Public site | Current Production is `dpl_HNJ3VbJoah7sXJCSfgphDpSwtnrB` on `main` `f182faa`; the homepage still shows the older Health Hub copy and `/account-deletion` returns 404. Robots and sitemap return 200, but that deletion URL is the only 404 among ten sitemap entries. Latest route-verified Preview `dpl_GYqLr9CgaurJws1FwfK43U9bXyPL` is Ready from docs-only commit `ccc0a56`, with application code unchanged from `2e373c4`. Vercel-authenticated checks on 6 October returned 200 for the homepage, checklist, Privacy, Terms, account-deletion, `/api/auth/config` and `/api/stripe/plans`. Subscriptions remains unready, and document, Checkout, signed-webhook and deletion rehearsals remain incomplete. The older staged Production `dpl_CMEh68U3fqRf96jA7RstB3rUqsZh` is based on `c478c7f`, behind current `main`, and must not be promoted. [Current site review](doctorai-site-release-review.md), [Preview setup](doctorai-preview-setup.md). | **Open:** finish rehearsals and approvals, stage a Production build from the reviewed current source, then verify and promote that exact artifact and recheck custom domains. |
| Android / Play | Current candidate: SDK 54.0.37, app/runtime 1.0.8, version code 12, `com.doctoraiworld.healthhub`. Expo/EAS access is restored; [build 1b130dfb](https://expo.dev/accounts/doctoraiworld/projects/doctorai-mobile/builds/1b130dfb-4e5d-408c-b93a-009af1e74017) succeeded with existing signing credentials; its signature/all-entry digests, packaged identity/runtime, API 36, permissions and SecureStore backup exclusions pass review. A historical 1.0.7 (11) store build exists. The current source adds journaled persistence/recovery, bounded account hydration, save-before-restart, private-file export/viewing/cleanup and deletion callback protection. TypeScript, package compatibility, 27 synthetic scenarios and Android/web exports pass; the 23-file EAS archive was inspected. DoctorAI World personal Play Console is accessible but has no app; its create-app form is staged with required policy, signing and export certifications unchecked. No installed-device or Play submission result is claimed. See [Android review](doctorai-android-release-review.md) for exact artifact status and evidence. | **Open:** inspect the completed current AAB, establish canonical backed-up source, run device journeys, complete truthful reviewed Play declarations and obtain testing/review approval. Public deletion and intended-purpose/privacy gates remain. |
| Advertising and measurement | The 90-day plan proposes the NZ appointment checklist as a first route, with privacy-compatible aggregate measurement and no health-derived targeting. Budget, pause thresholds and campaign operator are not approved. | **Blocker for paid ads:** owner approval and operational measurement checks remain open. |

## People and contacts to name

Fill these in before public release. Do not publish a response-time promise until coverage is actually staffed.

| Role | Named owner | Backup | Required access / decision |
|---|---|---|---|
| Legal operator and launch-market decision maker | TBD | TBD | Approve the first market, seller identity, supported audience and final service terms. |
| Clinical/product safety reviewer | TBD | TBD | Review intended purpose, claims, safety boundaries, medical content and incident escalations. |
| Privacy and deletion owner | TBD | TBD | Approve the data map, retention, deletion fulfillment, provider requests and privacy-incident escalation. |
| Customer support owner | TBD | TBD | Monitor the support mailbox, create/track requests, respond and escalate. |
| Technical incident lead | TBD | TBD | Own Vercel, storage, authentication, OpenAI and Stripe monitoring, containment, rollback and recovery. |
| Android publisher | TBD | TBD | Own the canonical source, signing keys, EAS project, Play Console, declarations and review access. |
| Advertising and budget owner | TBD | TBD | Approve the market, channel, total and daily cap, creative, measurement and pause rules. |

## Support intake procedure

1. Monitor `support@doctoraiworld.com` on a named schedule. Create a restricted ticket with category, received time, requester contact and status. Do not put health details, medication names, passwords, Google tokens or card data in the ticket title or routine support notes.
2. Classify the request as account access, data export/deletion, billing, app/site failure, safety concern or privacy/security concern. Route privacy, security and possible harmful health-output reports to the designated privacy/clinical/technical owners.
3. Give the requester a case reference. Set an acknowledgement and completion target only after the owner confirms staff coverage and local-market requirements.
4. Keep a minimal action record: verified requester, systems checked, actions, exceptions/retention, operator, completion time and confirmation sent. Store it only in the approved support system with access limited to people who need it.
5. Review aged, unassigned and incomplete requests on the owner-approved cadence. Pause acquisition if requests exceed the staffed queue or a deletion request cannot be completed within the approved process.

## Account-deletion request procedure — not operational until approved and rehearsed

The app's “Delete my health data” control is separate from full account deletion. Settings now links directly to the standalone `/account-deletion` page and offers a prefilled email request to support; the user must review and send the email. A separate Privacy Notice link is also available. The deletion page exists in the local website candidate and protected Preview, but Production still returns 404 until an approved release is deployed. A gated staff tool provides the server-side account-wide operation, but the workflow is disabled by default and has not been verified against Preview Stripe/Blob storage. Do not turn on `ACCOUNT_DELETION_WORKFLOW_ENABLED` or tell users a request is complete until the owner approves verification and retention procedures, support is staffed, both Android paths are verified on a device, the public resource is deployed, and the end-to-end rehearsal passes.

1. Verify the account owner through the owner-approved deletion process. Email address matching alone is not an approved verification protocol. Ask for the account email only; never ask the user to send health data or payment-card details.
2. Ask the user to remove device-only health data in the signed-in app while online, or explain how to clear local app data after closure. Exported files and offline devices cannot be remotely erased.
3. Inspect Stripe in the staff panel. Resolve every non-canceled subscription with the billing owner, including remaining paid periods, renewal, refunds and payment-record retention. The tool checks customer-scoped subscriptions, subscriptions whose account-email metadata matches, locally stored subscription IDs and recorded Checkout sessions; it expires recorded open Checkout sessions before the final billing check. Stripe search can lag, so independently search Stripe for recent subscriptions, changed billing emails and legacy Checkout links that predate the stored-session record. The endpoint refuses deletion when Stripe is unavailable or any subscription remains unresolved. See [Stripe subscription search](https://docs.stripe.com/api/subscriptions/search) and its [search indexing and pagination notes](https://docs.stripe.com/search#limitations).
4. Review applicable legal, security and provider retention. The operator must document the retention decision outside the account data being deleted; the code does not decide what law requires or delete Stripe customer/payment records.
5. After the owner-approved process is documented and the workflow flag is enabled, type the exact `DELETE <email>` confirmation in the staff panel. The tool blocks account access and writes, expires tracked open Checkout sessions, revokes every matching browser/mobile session, deletes health state, entitlements, all private blobs under the account prefix and metadata, free grants, pending-checkout references and matching account audit entries, records one-way subscription tombstones, and retains a pseudonymous account-deletion marker. If any step fails, the account stays blocked and the staff operator can inspect and retry.
6. Verify the tool reports completion and separately complete provider deletion requests where supported. OpenAI API content may remain in abuse-monitoring logs under OpenAI's default retention; DoctorAI cannot delete those logs directly. Explain provider limits and any approved legal retention to the user.
7. Send a completion response listing what was deleted and any retained category, reason and period. Keep the minimum case evidence needed to prove fulfillment in the approved support system.
8. Rehearse the complete staff, Stripe, Blob, session and device-local path with synthetic records before enabling the workflow or treating the public Play deletion resource as operational.

**Remaining gap:** the code does not verify request ownership, contact service providers, delete Stripe customer/payment records, or clear data held only on an offline device or in an exported file. The same-email reactivation block and duration of the pseudonymous deletion marker need explicit owner/privacy approval. The support mailbox, verification protocol, retention decisions and response owner are unverified. The website candidate now has the standalone route, but Production still returns 404; keep the workflow disabled and Google Play deletion gate open until approvals, a protected Preview rehearsal, public deployment and route verification are complete. Google requires an in-app request route and public deletion resource for apps that enable account creation; see [Google Play account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

## Incident response and service recovery

### First response

1. Assign the incident lead and record the start time, affected feature, current deployment ID and sanitized error/request references. Do not copy user health content into logs, chats or screenshots.
2. Pause ads and new promotion while a privacy/security event, potentially harmful health output, unauthorized account access, payment inconsistency or deletion backlog is being assessed.
3. Contain the affected path using a reviewed control: revert to the last known-good Vercel deployment, disable the affected route/feature in a reviewed deployment, revoke affected sessions, or rotate a confirmed exposed credential. Record each action and verify the public result.
4. For possible personal-data exposure, involve the privacy owner and qualified counsel for the confirmed jurisdiction before deciding on user, regulator or partner notifications. Preserve relevant sanitized evidence and restrict access; do not make a public legal conclusion from an unverified alert.
5. For a safety-output concern, involve the clinical reviewer, preserve the exact public build/version and prompt/configuration evidence without collecting unnecessary health information, and disable the affected feature until reviewed.
6. Restore service only after the incident lead verifies the fix, tests the affected user path with synthetic data, confirms monitoring and obtains required owner sign-off. Record cause, impact, corrective action and the decision to resume ads.

### Monitoring to configure and rehearse

- Vercel: production and preview deployment status, function errors, latency, build failures and deployment rollback access.
- Storage/auth: KV and Blob availability, failed sync/document operations, authentication/session errors, backup/restore status and credential rotation ownership.
- OpenAI and research providers: API error/latency/usage limits, abuse/retention configuration and feature-disable procedure.
- Stripe: checkout completion, signed webhook delivery, entitlement reconciliation, refunds, cancellation and renewal failures.
- Support: mailbox health, unassigned queue, privacy requests, safety concerns and complaints.
- Ads: spend cap, search-term review, landing-page correctness, privacy-approved aggregate outcomes and an immediate pause owner.

Set alert thresholds and destinations with the technical owner. The source's console error events are useful diagnostic records; they are not proof that an on-call person will be notified.

## Deployment and recovery checklist

For each release, record the source revision, build result, deployment ID, reviewer, smoke-test evidence and rollback target.

1. Run static/site/API checks and build both Vercel Preview and Production targets.
2. Deploy a protected Preview; smoke-test the homepage, free checklist, Health Hub, Privacy, Terms, account deletion, research search, authentication, health sync, document handling and billing status using synthetic data.
3. Require the product, clinical, privacy and technical owners to sign off on the exact public copy, data flow, feature set, support path and deployment artifact.
4. Confirm backups and recovery targets before connecting or changing production data. Rehearse a synthetic restore and rollback; retain no test user health data.
5. After isolated Preview rehearsals, build a Production-target candidate and stage it with `vercel deploy --prebuilt --prod --skip-domain`. Verify that protected deployment with Production configuration using read-only routes, headers, authentication boundaries, pricing availability, deletion URL and support contacts. Record its deployment ID and keep custom-domain traffic on the current release.
6. After approvals and evidence are recorded, promote that exact staged Production deployment ID, verify the custom-domain result and monitor with a named owner present. Promoting a Preview instead creates a new Production build with Production variables, so Preview evidence alone cannot verify the final artifact. See [Vercel promotion](https://vercel.com/docs/deployments/promote-preview-to-production) and [skip-domain](https://vercel.com/docs/cli/deploy).
7. If verification fails, pause ads and route traffic to the last known-good deployment. Do not retry production deployment repeatedly without diagnosing the failure.

## Advertising stop / resume rules

**Keep paid ads paused** until the market and operator are approved, health claims and landing copy are reviewed, the public Privacy and deletion path are live, support is staffed, paid checkout and cancellation are verified, measurement is approved, and a campaign owner has written a total and daily cap.

Pause immediately for a privacy/security incident, unresolved deletion request, repeated support failure, misleading clinical interpretation, checkout/entitlement mismatch, broken public landing page, or spend reaching its cap. Resume only after the responsible owner records the corrective evidence and approves restart. Keep health-derived audiences, sensitive-interest targeting and retargeting out of the campaign plan.

## Release sign-off record

Complete one row per release or campaign. A blank row is not approval.

| Gate | Owner | Evidence link / deployment ID | Decision and date |
|---|---|---|---|
| Market, legal operator and intended purpose | TBD | TBD | Open |
| Clinical claims and safety review | TBD | TBD | Open |
| Privacy, provider retention and deletion fulfillment | TBD | TBD | Open |
| Support and incident coverage | TBD | TBD | Open |
| Backups, monitoring and rollback rehearsal | TBD | TBD | Open |
| Pricing, checkout, cancellation and refunds | TBD | TBD | Open |
| Android signed build and Play declarations | TBD | TBD | Open |
| Measurement, ad creative, cap and pause rule | TBD | TBD | Open |
