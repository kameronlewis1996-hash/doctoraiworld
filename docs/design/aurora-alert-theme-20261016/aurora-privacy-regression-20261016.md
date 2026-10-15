# Aurora account, privacy and deletion regression review — 16 October 2026

## Result

**PASS — current local candidate.** Account sign-in, storage choice, account-sync status and profile privacy controls retain their existing behavior. Medicine history now distinguishes automatically generated saved-list events, notes authored in History, and unlinked legacy events. Single-medicine deletion removes only generated events linked to that medicine; authored notes and unrelated events remain. Legacy entries are labelled with unconfirmed origin and can be explicitly deleted. Full-data deletion clears the timeline, including both generated and authored events.

The aurora visual changes are in `aurora-theme.css` and `accessibility.css`; HTML and service-worker changes update stylesheet tags and the shell cache version. The presentation changes do not alter account or storage logic.

**BLOCKED — hosted and production behavior remains unverified.** These checks use local source and synthetic fixtures. They do not prove live Google OAuth, durable cloud/KV storage or cross-device sync, live export/deletion, or behavior under real browser storage refusal/quota conditions. No credentials or real patient data were used.

## Local verification

All commands passed from the repository root:

| Command | Result |
| --- | --- |
| `node scripts/verify-record-preparation.cjs` | Pass — synthetic generated/user-authored/legacy history, single-medicine deletion, Visit Prep labels, and browser serializer/API roundtrip. |
| `node scripts/verify-device-health-storage.cjs` | Pass — full-data deletion clears generated and authored history; session choice, cloud failure, storage refusal, and account-race cases. |
| `node scripts/verify-health-state-contract.cjs` | Pass — browser serializer/API contract, synthetic providers, roundtrips, rejection paths, and account/storage guards. |
| `node scripts/verify-server-core.js` | Pass — health-state validation, durable limits, and isolated preview storage. |
| `node scripts/verify-medication-login.cjs` | Pass — consent/profile isolation and stale or duplicate sign-in responses. |
| `node scripts/verify-five-tabs.cjs` | Pass — privacy status, account/session races and sign-out behavior. |
| `powershell -ExecutionPolicy Bypass -File scripts/verify-static-site.ps1` | Pass — 93 required files and 12 production pages. |

The deletion checks are synthetic source verifiers. They do not call a hosted preview or production provider.

## Deletion behavior and reproduction

New medicine-list history events carry `source: 'medication-list-change'` and the medicine's `medicationId`. Manually written medication-history notes carry `source: 'user'`. Timeline labels distinguish saved-list changes, the user's notes, and older entries whose origin cannot be confirmed. Visit Prep groups dated entries under **Past medicine changes and notes (not current list)** and retains their history-only labels when selected.

To reproduce the local regression coverage, run `node scripts/verify-record-preparation.cjs`. Its fictional flow saves a medicine, writes a separate user-authored history note, confirms that generated and authored provenance survive the state/API roundtrip, then deletes the medicine. The linked generated event disappears; the authored note, an unlinked legacy event, and another medicine's event remain. The legacy event is visibly labelled as origin-unconfirmed and can be deleted with its own history-entry action. The same verifier checks that the deleted medicine and its generated event do not reappear as Visit Prep choices.

Run `node scripts/verify-device-health-storage.cjs` to reproduce full-data deletion with both generated and user-authored medicine history seeded; it asserts that the timeline is emptied. If remote deletion fails, the local copy is retained for retry/export and sync is paused. The live remote path was not exercised.

For a manual local presentation check, open `/health-hub` in a clean browser profile, stay signed out, choose **Use this session only**, then inspect **Profile** and **Account & settings**. This consent-flow check was not run in a live or hosted browser during this review.

Remaining limits include hosted/production sign-in and sync, cross-device persistence, real export/deletion, browser quota/security denial, screen-reader and real-device acceptance.
