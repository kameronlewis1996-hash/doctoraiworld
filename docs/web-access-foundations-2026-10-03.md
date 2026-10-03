# Web release candidate: access and supported Pro foundations

This extends the user’s accepted accessibility brief. It is reviewable code and synthetic verification, not production activation, a new legal notice, a proof intake service or a public funding promise. Published Privacy and Terms content is unchanged. No Android files, live Stripe prices, subscriptions, billing settings, accounts, invitations, evidence or grants were changed.

## Implemented behaviour

- `release-design.css` and shared modal styles provide readable 16px inputs, 48px controls, aligned medication essentials, optional reminder/provider groups, inline associated errors, focus after visit review and back/cancel handling. Medication submission commits once per dialog. Privacy controls group storage, export and deletion; cancellation preserves records. Storage copy distinguishes session, browser and encrypted account copies. Daily overview uses opaque white on solid dark blue. Additional dashboard tools remain available under a native keyboard disclosure.
- Manual appointment summary stays Free. Daily AI overview enhancements require Pro on the client and server, record selection and fresh consent. Existing general health-education chat remains Free. Child AI/OCR guards, adult managed-action disclosure, `store:false`, scoped state/document deletion, account-bound browser consent, unknown legacy quarantine/recovery and health CAS checks remain in place.
- Preview rejects AI/OCR, licensed medicine providers, Stripe and outbound grant email before authentication/provider work. Auth config reports AI and subscriptions unavailable. The local medicine catalogue and deterministic checks retain their existing independent paths. A populated inherited secret never authorises a provider request.
- A separate NZ monthly Price ID must be active, recurring monthly, exactly 699 minor units in NZD and in the correct Stripe mode. International configuration remains USD and keeps its existing Price IDs/amount source. NZ annual has no default amount: it remains unavailable until its explicit approved amount and separate Price ID are configured. No existing price or subscription is migrated. Checkout has client double-activation protection and a server Stripe idempotency key. Preview shows the intended NZ$6.99 with checkout disabled.
- `care-access.cjs` implements adult self-account invitations behind approval flags. Invitations use a random one-use token, store only its hash and are bound to the recipient’s authenticated email. Recipient acceptance atomically updates permission and inbox references. Owner-only revocation remains available when new invitations close. The UI handles both initial and same-page fragment navigation, reviews exact permissions and removes the token from history. No email is sent.
- Caregiver read/export and manual medication, appointment and note edits use a separate shared-state endpoint. Existing owned-person APIs do not accept foreign accounts or IDs. Every operation resolves an account-bound grant. Viewer edits, out-of-scope edits, full deletion and forged matching confirmations are rejected. Edits check permissions, entitlement and health revision together in one Redis transaction, so a revocation can win against an in-flight save. Unshared allergies/documents/other groups are preserved. Shared records are held in memory, cleared on close/account change/page exit and never written to a persistent browser health cache. Changed medicine identity/strength clears prior ingredient confirmations.
- Disabled adults’ own accounts and eligible families have a gated minimal supported-access application and an accessible review UI. Server-authorised review uses only the existing Kam administrator; clients cannot supply an account key, reviewer role, grant or sensitive proof fields. Atomic review plus independent lifetime entitlement prevents two concurrent decisions consuming one funded place. Lifetime grants have no scheduled expiry and coexist with paid records. Stripe cancellation cannot erase them; closing new intake does not revoke them. Repeated decisions are idempotent.
- Supported grants carry explicit monthly AI/scan, storage and review allowances. Actual provider attempts, reported token counts, unreported attempts, encrypted document reservations and manual review minutes are separate counts, without prompts, labels or health histories in usage records. Retries and fallbacks reserve separately. Storage reservations use CAS and include existing self/managed documents. Deletion releases a reservation; uncertain failed uploads conservatively retain accounting. No provider rates, invoices, cash savings or actual costs are invented.
- Staff-signed short-term Pro tokens work even with no public promotion code. Redemption and its audit commit atomically into a separate `complimentary-pro` record; revocation is atomic and does not downgrade a separate paid or lifetime grant. Legacy grants remain readable.
- Contribution planning keeps 5% as a future cash-profit goal. Year, accounting basis, payout timing, recipient and currency remain undecided. Private gated recording separates cash committed, cash distributed and administration costs from complimentary account counts; waived retail value is rejected as cash. Public planning claims no cash total or charity affiliation.

## Gates and remaining implementation limits

All new invitations, supported intake/review and cash recording default closed. Preview also disables their activation even if production approval flags are inherited. Funding capacity is zero in the example configuration; eligibility, approved private review, retention, allowances, policy version and signed-in QA are unresolved decisions. No remote environment approval flags were activated by this work.

Child and adult-managed delegation, shared documents, shared AI/OCR and completing an adulthood/control transfer remain disabled. The server accepts an owner-bound child-authority review request that freezes shared access, but does not infer an age threshold, transfer control or authorise continued guardian access to an adult’s account. Existing manually managed child profiles remain separate. Completing this process requires a reviewed policy, verified adult consent, migration/deletion rules and further signed-in tests.

Evidence upload is deliberately absent. If a minimal referral cannot establish eligibility, a short redacted professional confirmation needs a separately approved private reviewer/channel and deletion deadline. Ordinary health documents, AI and email are not proof intake. Pending/declined applications have a configured expiry and are purged on programme access; there is no scheduled purge job yet. Approved records remove referral/kind fields and retain only minimal decision information. Uncertain document upload reservations require reconciliation; provider usage without a usage report remains marked unreported. Historical usage/accounting reconciliation, exception/appeal and grant revocation policy need further decisions before activation.

## Verification

All tests use synthetic accounts/data and strict fake provider/storage transports. Browser traffic to non-local origins is blocked.

| Check | Command | Result |
|---|---|---|
| Source/static | `node scripts/check-js.js`; `node scripts/verify-static-site.cjs` | 100 JS files; 13 pages, 228 references and exact CSP/offline invariants |
| Provider guard | `node scripts/verify-preview-providers.cjs` | 12 real handlers block inherited keys; zero outbound calls |
| NZ/legacy pricing | `node scripts/verify-stripe-pricing.js` | Currency/amount/mode/interval checks, annual pending, existing configuration and checkout idempotency |
| Access/grants/usage/cash | `node scripts/verify-access-programmes.cjs` | 78 assertions, actual handlers/signing/encryption, synthetic CAS |
| Actual local Redis | `node scripts/verify-health-concurrency-redis.cjs --access-programmes` | Same 78 assertions with real Lua; network-none, no host mounts/ports/persistence; container removed |
| Shared dialogs | `DOCTORAI_CHROMIUM=/usr/bin/chromium node scripts/verify-shared-dialogs.cjs` | 22 assertions, six axe states; keyboard, errors/focus, rapid save, Free summary, privacy export/cancel and expanded tools |
| New access screens | `DOCTORAI_CHROMIUM=/usr/bin/chromium node scripts/verify-access-pages.cjs` | 25 assertions, 11 axe states; applicant/reviewer/caregiver medication/appointment/note UI and export, native table, lifetime display, 320/390px and checkout-disabled checks |
| Existing screen sample | `DOCTORAI_CHROMIUM=/usr/bin/chromium node scripts/verify-web-accessibility.cjs --remaining` | 41 assertions, 34 axe states, no JS errors; seven Hub views and public screens |
| Affected aggregate | Package `verify:*` non-browser suites | 24 suites passed; individual commands/results in local evidence JSON |

Automated axe results and sampled flows do not establish full WCAG conformance. No installed screen reader, real camera/hardware, native Android device, live OAuth/KV/Blob or actual Stripe/OpenAI/licensed provider flow was verified. Actual 400% browser zoom could not be established in managed headless Chromium; preferences did not apply and the temporary zoom helper worker was unavailable. No browser policy was changed. The 320 CSS-pixel and sampled text-spacing checks are valid but are not a claim of actual 400% zoom.

## Migration and rollback

Existing paid `entitlement`, health `health-state`/`managed-health:*`, profiles, documents, self-cache owner binding and recovery schemas stay readable. New records are lazy: `care-access-v1`, `care-inbox-v1`, `complimentary-pro`, `complimentary-redemption`, `lifetime-pro`, supported usage/storage counters, `doctorai:supported-access:v1`, and `doctorai:contribution-planning:v1`. No live data migration or token creation was run. Staff redemption moves new short grants to the independent field; existing legacy short grants are still resolved and revoked safely.

PWA shell is v113 with current versioned assets. API responses are no-store and excluded from service-worker caches. New functions use existing catch-all routes; no additional top-level Vercel function or paid resource was added.

The guard-only rollback anchor is `1326d6ded8b064376dc56e83585ec3c146696176`. Before any real new grant or invitation exists, roll back the UI/foundations to this anchor, preserving the Preview provider guard. Rolling Preview back to unguarded `658e012` would restore the inherited-provider risk. After future grant activation, retain the independent entitlement resolver and durable grants during any UI rollback; deploying an older resolver would hide lifetime access. Do not delete grants or repricing existing subscribers as rollback steps. Policy/funding flags can close future intake without revoking existing grants.

## Android coordination

No Android files were edited. The Android worker should carry over 16px form text, 48px targets, concise storage/consent groups, inline failure/focus handling, one-save activation, scope/person context and unknown-medicine language. It must handle `lifetime:true` with `expiresAt:null` without a false Free/expired countdown, preserve account/profile headers and accept explicit NZ market selection where checkout is eventually approved. Preview provider failures should offer manual/local alternatives. New sharing/child transfer/evidence remain unavailable until the same server gates and policy reviews are complete. Native build/device/store QA stays with that worker.


## Screenshot provenance

Library's required batch uploader failed before preparation with `hosted apps tools/list request failed: network`; no confirmed Library IDs exist. The requested synthetic screenshots are included here for draft-PR review, and `docs/` is excluded from deployment. The before medication dialog is the local `658e012` candidate; before Today is the original family branch `53a597e`. After images use this integrated source and synthetic in-memory records. These are local browser screenshots, not deployed signed-in QA or actual health records.

- [Medication before](screenshots/web-2026-10-03/before-medication.png) / [after](screenshots/web-2026-10-03/after-medication.png)
- [Today before](screenshots/web-2026-10-03/before-today-mobile.png) / [after](screenshots/web-2026-10-03/after-today-mobile.png)
- [Privacy controls after](screenshots/web-2026-10-03/after-privacy-mobile.png)
