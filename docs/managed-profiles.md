# Pro family & loved ones profiles

One signed-in account manages private profiles with a required display name and optional relationship. There are no invitations, separate logins or cross-account sharing.

`/api/health/profiles` lists, creates and edits profiles. Creation uses a UUID idempotency key and Redis HSETNX; concurrent retries create one profile. Session revocation and durable Pro entitlement checks run on the server. Owner namespaces and stored owner validation prevent another account from resolving a profile ID. Client account context also rejects stale-tab requests after cookies change accounts.

Self records retain the original `health-state` field and document namespace. Managed profiles use separate encrypted `managed-health:<profileId>` fields, document metadata namespaces and private encrypted Blob paths. Medications, allergy/safety terms, notes, appointments, providers, timeline/symptoms, measurements, tasks and approved memory are all scoped together. Managed data is transient in memory and uses authenticated encrypted server persistence; it is never written to the owner's localStorage or sessionStorage. Legacy self cache behavior is preserved; unknown legacy cache ownership across a full reload remains an existing limitation.

The Profile page has a Family & loved ones section; an active-person selector appears across the hub. Switching loads the selected namespace, closes forms, clears scan/file inputs, medication results, chat and draft briefs, and waits for any originating save/upload/scan/chat/safety operation to finish. An unfinished form can be cancelled or discarded. Failed saves keep changes unless discard is explicitly confirmed.

Archiving keeps records. Archived and downgraded managed profiles are read only, with view/export/download/delete available. Pro is required to create, edit, restore, upload or update managed records. Reading and deletion never require an active subscription. Billing and prices are unchanged.

AI chat, AI briefings, OCR/camera scans, external medication checks and sharing are explicitly unavailable for managed profiles. The same restriction is enforced on server AI/scan routes. Manual records, local medication guidance, visit briefs and document storage are supported. External medical providers keep their existing authorization gates.

## Verification

Run `pnpm run verify:profiles` for synthetic server tests. They use real signing, session validation, encryption and route handlers against an in-memory Redis/Blob transport; every attempted external request is rejected. Coverage includes self/two-person records, other-owner/unknown/crafted IDs, forged fields, atomic repeated clicks, private documents, archive/restore, Free/expired/revoked entitlement, stale cookies, changed-account tabs and deletion isolation. No paid calls or production storage are used.

Run `pnpm run preview:profiles`, then open `http://127.0.0.1:4173/health-hub#profile` for the local synthetic preview. This helper binds to localhost and must not be deployed. Synthetic controls under `/__test/` allow plan/account/latency/failure changes for browser verification. `scripts/` is excluded from Vercel deployment.

Browser verification with Chromium/agent-browser covered profile creation, Cancel, edit, archive/restore, Cedar/River allergy-note isolation, no managed browser cache, disabled AI, pending save, failed save Cancel/discard, unfinished form Cancel/discard, and 390px mobile layout. These are local tests with synthetic storage, not authenticated tests against deployed infrastructure.

Reference-image materialization failed after one allowed retry, so the implementation follows the existing repository Profile style. No reference image or real identity is committed. PROJECT_RULES.md and local .agents guidance were absent in the saved environment and latest main.

Existing full-project checks have baseline failures: the public MCP file has an unescaped apostrophe; static verification rejects existing printable-resource form fields and appointment-checklist links, and finds an existing missing index-page CSP hash. The managed-profile, server, medication scan/safety/database/local UI, NZF and Stripe-pricing focused checks pass. Keep these baseline failures separate from feature verification.

An authenticated deployed end-to-end check still needs existing isolated Preview session/KV/private Blob configuration. Do not test using shared production storage, real health data, or real OCR.
