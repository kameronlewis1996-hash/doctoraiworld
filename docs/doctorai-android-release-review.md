# DoctorAI Android 1.0.8 release review

**Updated:** 6 October 2026, New Zealand time (store-asset inventory only; build and device evidence below remains dated as shown). **Status:** signed AAB built and inspected; no Play app entry, submission or installed-device review yet.

## Play copy review — 6 October 2026

The working listing was checked against the Android source. The Documents screen labels uploads “Pro,” and `uploadDocumentJob()` requires an active entitlement before opening the picker. The listing draft now identifies document saving as a Pro feature and makes account-sync availability conditional on the DoctorAI storage service. This is a source-level copy check only: the draft is not approved or submitted, and no current-version device screenshot or end-to-end Play review has been completed.

## Backend dependency

The Android health-sync payload includes `providers`, which the earlier public server validator rejects. That server defect is now fixed and reviewed in the protected Preview and staged Production candidates; it has not reached the public backend yet. Release the reviewed backend before claiming the installed app cloud-sync path passes. See [site release review](doctorai-site-release-review.md).

## Candidate and access

- Source: `C:\Users\KamLewis\OneDrive\DoctorAI-source-20260926\mobile-app` (separate snapshot, not in the website Git repository).
- App/package: DoctorAI World / `com.doctoraiworld.healthhub`.
- Expo SDK 54.0.37; React Native 0.81.5; app/runtime 1.0.8; EAS version code 12.
- [Current EAS build](https://expo.dev/accounts/doctoraiworld/projects/doctorai-mobile/builds/1b130dfb-4e5d-408c-b93a-009af1e74017): production profile, store AAB, production update channel, existing remote signing key. Started 10:44 pm NZDT and finished successfully at 10:52 pm. Cloud Expo Doctor passed 18/18 checks.
- Downloaded artifact: `C:\doctorai-launch-checkpoints\DoctorAI-World-1.0.8-12.aab` (46,870,337 bytes). SHA-256: `ACA6E6F9FB4DE65F9E50C8A70A756CFBFE6ADB640DD353E555B09B84E70C5608`. The [Expo AAB download](https://expo.dev/artifacts/eas/KeI4rX4zUdzYKogYK1KVEOAPPIocUYDWFze9JTRu00Y.aab) has limited hosting availability; the local copy preserves this exact reviewed artifact.
- Expo/EAS CLI authenticated as `doctoraiworld`. Historical successful store build 1.0.7 (11), `0b657c03-a78f-48fc-9fb9-bf9356b10c8b`, is an earlier artifact.
- DoctorAI World personal Play developer account `5716339622630217878` is accessible. No app entry was created. The open create-app form is filled with “DoctorAI World,” English (US), App, Free and the package above; Play confirms “Package name available.” Clicking Create app returned three requirements: accept the Developer Program Policies, Play App Signing Terms of Service, and US export laws. All remain unchecked. Google Play's current account guidance directs health-app developers to an Organization account, while this account is Personal. The owner must confirm the legal operator and complete the official conversion before app creation/submission; no Play submission or installed-device review occurred.

## New Play account and submission gates — checked 5 October 2026

- **Account type:** Google Play's current [Play Console Requirements](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en) and [account type guidance](https://support.google.com/googleplay/android-developer/answer/13634885) direct health-app developers to an Organization account. The existing DoctorAI account is Personal. Google documents an owner-led conversion through Developer account → About you: the existing personal account must be fully verified with no pending warnings; the owner must verify the organization's official website, provide an organization payments profile and D‑U‑N‑S number, enter organization/contact information, and finalize the profile link. Google says to wait at least 72 hours after conversion before submitting apps. This needs owner-provided business information and has not been started. See [conversion steps](https://support.google.com/googleplay/android-developer/answer/16260648).
- **Testing eligibility:** Personal developer accounts created after 13 November 2023 must run a closed test with at least 12 opted-in testers continuously for 14 days before applying for production access. The current account creation date is not established, and eligibility after conversion must be checked in Play Console. New personal accounts also require the account owner to verify access to a physical, non-rooted Android 10+ device using the Play Console mobile app. See [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) and [device verification](https://support.google.com/googleplay/android-developer/answer/14316361).
- **Listing assets:** Google currently requires a 512×512 32-bit PNG icon with alpha (max 1 MiB), a 1024×500 JPEG or 24-bit PNG feature graphic without alpha, and at least two screenshots across device types. On 6 October, the current app icon was exported to a 512×512 RGBA PNG (95,978 bytes) and a 1024×500 RGB feature-graphic draft was prepared (41,800 bytes); both meet the file-format, dimensions and size limits and are pending owner approval. Rebuild them with `scripts/build-google-play-assets.ps1`; sources and outputs are in `assets/google-play/`. Add Console alt text after approval. Current-version installed screenshots are still missing; screenshots must be JPEG or 24-bit PNG, 320–3840 px, with the longest dimension no more than twice the shortest, and show the actual current app. Older browser previews must not be submitted as screenshots. See [Play preview-asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151).
- **Review access and declarations:** Before submission, Play requires a privacy-policy URL, a completed Data safety form, required health-app declarations, and reusable English review access for any gated functionality. The public deletion route currently returns 404; the app's account-dependent features need an owner-approved synthetic reviewer account after Preview isolation is complete. See [Play sign-in details](https://support.google.com/googleplay/android-developer/answer/15748846) and [Play Console requirements](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en).
- **Account-deletion pathway:** Android Settings links to `/account-deletion` and also offers a prefilled support email. The website candidate gives visitors a public email request path without sign-in. Google Play's [account-deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) allows a support email or form when the external page clearly and prominently lets users request deletion, names the app, and does not send them back to the app. This source-level pathway matches that request pattern, but does not prove that DoctorAI receives, fulfills, and completes deletion requests. Production still returns 404 for the page; support ownership, response handling, retention decisions, provider deletion, and a full account-deletion rehearsal remain open.

## Fixes in this candidate

- Journaled, serialized SecureStore writes with UTF-8 byte limits and legacy-record migration. Failed staging writes preserve the committed record; interrupted cleanup/deletion retries on launch. Saved record/load errors have explicit recovery UI.
- User-controlled health JSON export excludes account/session credentials. Private document downloads use authorization headers and verified MIME types before a device viewer opens them. App-owned temporary files are removed after use, including error/cancellation paths.
- Installed Expo Sharing and Intent Launcher native modules. Bumped app/runtime version to prevent compatibility with the previous native runtime. See [Expo runtime guidance](https://docs.expo.dev/eas-update/runtime-versions/).
- Camera and document-picker cache copies are cleaned up after use and during startup/health deletion. Cleanup is limited to the SDK's app-cache directories, with no deletion of source documents or external URIs.
- Account hydration has bounded requests. Confirmed sign-in expiry is distinguished from outages; local entries remain available. Sign-out reports incomplete device/server cleanup.
- Updates offer “Save and restart” rather than automatically reloading. Data deletion blocks edits, invalidates old callbacks, waits for pending upload/sync work and fetches the account's document list before removing cloud records. It resets forms and cached briefing UI after success.

## Review evidence

| Check | Result / limit |
|---|---|
| Strict TypeScript | Re-run 5 October with `npx --no-install tsc --noEmit`; passed. |
| Expo SDK dependency compatibility | `expo install --check`: up to date. |
| SecureStore synthetic scenarios | Re-run 5 October; all 12 passed: migration, Unicode byte limits, failed commit preservation, ordering, interruption/retry, deletion, auxiliary marker and capacity/corruption failures. |
| Private file synthetic scenarios | Re-run 5 October; all 8 passed: token header handling, MIME checks, viewer/share failure cleanup, export allowlist and cleanup retry. |
| Account/deletion/cache synthetic scenarios | Re-run 5 October; all 7 passed: expiry vs outage, optional-resource failure, network/body deadlines, callback invalidation, pending upload deadline, failed job settlement and cache boundaries. |
| Android JavaScript export | 708 modules; 2.43 MB Hermes bundle; `C:\doctorai-launch-checkpoints\android-export-20261004-2222`. |
| Web JavaScript export | 435 modules; 1.21 MB bundle; `C:\doctorai-launch-checkpoints\android-web-review-20261004-2222`. |
| EAS archive inspection | 23 files; required source/assets have matching SHA-256 hashes; `.env*`, dependencies and generated native folders excluded. Archive: `C:\doctorai-launch-checkpoints\android-eas-source-20261004-2220`. |
| Latest browser layout review | Browser blocked local preview with `ERR_BLOCKED_BY_CLIENT`. Earlier phone-width checks are historical, not verification of all new controls. |
| Cloud Expo Doctor | 18/18 passed. Signed build finished successfully. |
| Packaged identity/runtime | `com.doctoraiworld.healthhub`, 1.0.8 (12), launcher “DoctorAI World”; embedded string runtime 1.0.8; production update channel. |
| Packaged SDK/permissions | min SDK 24 / target SDK 36. CAMERA, INTERNET, WRITE_EXTERNAL_STORAGE, ACCESS_NETWORK_STATE, USE_BIOMETRIC, USE_FINGERPRINT and the app's signature-protected dynamic-receiver permission. No READ_EXTERNAL_STORAGE, READ_MEDIA_IMAGES/VIDEO, RECORD_AUDIO, SYSTEM_ALERT_WINDOW or VIBRATE. Biometrics permissions come from the SecureStore dependency; current source does not request biometric authentication. |
| Packaged release/backup settings | No enabled debug or cleartext flags. SecureStore excluded in the actual legacy backup, cloud backup and device-transfer XML rules. |
| Packaged signature/integrity | CMS signature verified using .NET; signed manifest digest and SHA-256 digests for all 791 entries match. Signer certificate SHA-256 `6498F61F158B4974615176332E13B9CBD158815BDA8D34CF73E7E947F391D2E5`. This verifies artifact integrity, not installation or Play approval. |
| Installed-device journeys | Not run; `adb` is absent from PATH and the standard SDK locations, and Android Studio is not installed. Required before submission. |

Source checkpoint before these edits: `C:\doctorai-launch-checkpoints\android-storage-runtime-20261004-215211`. Tests used isolated memory/filesystem adapters and fictional values; no real account or device health data was deleted.

Packaged review JSON and extracted manifest/backup/resource evidence: `C:\doctorai-launch-checkpoints\android-aab-review-1.0.8-12`. Read-only protobuf inspection follows Android's published [AAPT2 resource schema](https://android.googlesource.com/platform/frameworks/base/+/HEAD/tools/aapt2/Resources.proto); it does not replace bundletool validation or a device run. An installable internal-distribution APK built successfully from this source for device review; it is a separate artifact with the preview update channel.

## Installable candidate for device review

- [Internal-distribution APK build](https://expo.dev/accounts/doctoraiworld/projects/doctorai-mobile/builds/be5fd9a2-5ec1-4f19-9ab6-2577167b82bf) succeeded at 11:04 pm NZDT: version 1.0.8 (12), runtime 1.0.8, preview profile/channel and existing signing credentials.
- [APK download](https://expo.dev/artifacts/eas/XEyLyJkMfhBHRU98Ras8pv6zgpiesbc20vpWhr49618.apk). Local copy: `C:\doctorai-launch-checkpoints\DoctorAI-World-1.0.8-12-test.apk` (65,052,015 bytes). SHA-256 `0DD24F948E56C0EEF2CE2C917CFF6CE55F03413CA0C8EE48AC62A0471E32A844`.
- Its embedded JavaScript bundle SHA-256 matches the reviewed production AAB exactly. Build metadata and file hash are recorded in `android-preview-be5fd9a2-status.json` and `android-preview-apk-review.json` under the checkpoint folder. APK signing is evidenced by the successful EAS signing build; an independent APK v2/v3 signature check or installation has not been run. The CMS/all-entry verification above applies to the AAB.
- This APK is for device review. It is not a Play Store listing or a Google-reviewed release. It uses the existing Production API; use fictional entries and a dedicated test account, and rehearse destructive account/billing flows only in a configured non-production environment.
- Production deletion resource rechecked at 11:04 pm NZDT: HTTP 404. The approved protected website candidate must still be released and the support workflow rehearsed before app submission.

### Device review checklist

- Launch, background/reopen and offline launch; empty-start behavior; medicine/appointment/profile/measurement edits and persistence after restart.
- Google sign-in success/cancel/expired session; temporary network outage; account sync without replacing newer edits; entitlement unavailable/active states.
- Chat signed-out/failure behavior; review the disclosure and use fictional questions only.
- Camera permission denial, cancellation and affirmative scan consent; verify every extracted field against a fictional label; verify temporary photo cleanup.
- Fictional document upload, open in a compatible viewer, viewer failure and retry, deletion and app-cache cleanup. User-exported copies remain outside DoctorAI.
- Export fictional local entries; confirm credentials are excluded and the selected destination is clear.
- Health-data deletion during a pending request; cloud outage preserves device entries for retry; old callbacks/forms/briefings cannot restore deleted details. This is distinct from full account deletion.
- Update prompt saves before restart; save failure keeps the app open. Check screen-reader navigation, large text, 320/390 px equivalent device widths, keyboard, status/navigation bars and briefing modal safe areas.

Record device model, Android version, build ID, observed result and any failure for each check. No device checklist item is marked passed yet.

## Remaining release work

1. Preserve the reviewed AAB and source snapshot above; use that exact artifact for Play upload after the remaining gates clear.
2. Install the signed candidate and check Google sign-in, offline loading, sync, chat, camera consent/cancel, scan, upload/view/delete, export, health/account deletion, restart/update, text scaling and screen-reader flows with fictional data.
3. Publish and verify approved Privacy/account-deletion pages; Production currently returns 404 for the deletion page. Rehearse support and configured billing/storage deletion in Preview.
4. Approve the draft icon and feature graphic, capture current-app screenshots on the required device types, and complete truthful Health Apps, Data safety and reviewer access after intended-purpose and privacy review. Owner must review binding signing/export declarations before app creation.
5. Follow Play internal/closed testing and production-access requirements. No public availability or advertising readiness is claimed.
