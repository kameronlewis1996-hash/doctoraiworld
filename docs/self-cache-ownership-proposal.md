# Self-profile cache ownership and explicit recovery

Implemented after the owner approved the scoped cache fix. No production promotion or legal-page publication is included.

## Boundary

Health state starts blank until `/api/auth/google` confirms the session-derived opaque `user.accountId`. Email, names, timestamps, URL parameters and parsed cookies never establish ownership. New optional self caches use an atomic version-2 envelope keyed and validated against that account ID and `profileId: self`. Managed profiles still use no persistent health cache. Browser storage remains plaintext; this prevents accidental account mixing, not access by someone with device or DevTools access.

All eleven existing unscoped health keys remain byte-for-byte in quarantine. Startup, chat, scan and cloud sync never read them as current health records. No old key is deleted, rewritten, auto-assigned or auto-uploaded. Device preferences remain separate. Anonymous new health data stays in memory for the session, with explicit health export available; signing in preserves a nonempty guest session only as a separate in-memory recovery source, never as the account record.

Sign-out/account replacement stops queued sync, clears forms/scans/chat/current display, advances request/person epochs, and preserves the prior account cache. Late auth GET/POST and cloud JSON callbacks recheck their account/request before committing. Re-authentication can load only that owner's envelope with device-storage consent. The server record is fetched before saves are allowed. Unsynced owner-bound copies are preserved separately for manual review/export; startup never chooses a cache by a newer timestamp or uploads it automatically. A failed backup blocks cache overwrite. Malformed prior backup bytes are retained.

## Recovery

Privacy offers local export and explicit review for legacy, guest, preserved owner copies and prior recovery drafts. Legacy entries are labelled unlinked; their contents do not appear in the ordinary health display. A signed-in user must select Myself, wait for their account record, review all fields under the named account, and affirm the records are their own. Cancel/Back does not apply anything. Invalid copies remain exportable and cannot be opened as records.

A confirmed review creates a separate paused draft. It does not merge people, replace the canonical cache, upload automatically, or enable AI/label scans. The original account snapshot remains in the recovery envelope. Manual edits stay in the draft. Returning to saved account records restores the server view while retaining the draft; reloading requires another explicit review to continue. Replacing an earlier recovery preserves it as an account-bound backup first. Export contains exact legacy strings where present and the prior account snapshot; document files are not included.

Only **Save reviewed recovery to this account**, with a separate named-account confirmation, writes the draft to self storage using the current server compare-and-set revision. A changed revision fails safely and keeps the draft for export/review. Completed recovery and its prior snapshot remain exportable. Free accounts can export and recover their own self records. Subscription, managed namespaces and server record schemas are unchanged.

## Verification and limits

`node scripts/verify-self-cache.cjs` exercises real cache helpers and actual extracted auth/load/recovery functions with synthetic VM dependencies: blank pre-auth health, A/B ownership, preserved legacy bytes, invalid owners/copies, quota/corrupt-backup handling, delayed auth GET/POST/health JSON, unsynced-cache preservation with no boot upload, and explicit paused recovery.

`DOCTORAI_BROWSER_BIN=<installed agent-browser> PROFILE_PREVIEW_PORT=4181 node scripts/verify-self-cache-browser.cjs` runs 27 checks against an already-running localhost synthetic fixture on the same port. It covers full A→B→A reloads, B-only saves, signed-out/failed auth, unowned quarantine, Cancel/unchecked submissions, exact-string local export, AI pause, recovery across account reloads, Return, and one explicit final save. The fixture uses real sessions/route handlers with in-memory Redis/Blob and synthetic AI. It cannot contact real providers/storage. These are not authenticated deployed end-to-end tests; those remain blocked by unavailable verified isolated Preview credentials.

The service-worker shell is version 108 and pre-caches `self-cache.js?v=1`, `health-hub.js?v=66` and `managed-profiles.css?v=3`. All listed shell resources exist. Five actual Chromium offline-reload checks passed: required module loads, unresolved identity stays signed out, no legacy/prior account health renders, legacy bytes remain unchanged, and quarantine export stays available while unauthenticated review stays disabled. API responses are never cached by the worker. These are localhost synthetic checks.
