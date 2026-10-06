# DoctorAI World native app

This is a native React Native/Expo app for DoctorAI World. It uses native screens and controls rather than embedding the website in a WebView.

The current app shell mirrors the website's Health Hub areas: Today, Ask DoctorAI, My Health, Medications, Appointments, Results, Timeline and Documents. It stores health data in encrypted device storage and syncs to the DoctorAI account API after sign-in when durable account storage is available; if not, data stays on the device. It also includes duplicate-name prompts, dose tracking, appointment preparation, measurements, profile editing and accessibility settings.

Accessibility choices include a scrollable top navigation instead of a crowded bottom bar, a height-limited scrollable Settings panel on short screens, 48px-plus controls, explicit screen-reader labels, scalable text, stronger contrast, simple single-purpose cards, clear warning text in addition to colour, and reduced-motion defaults. These patterns follow current Apple and Android accessibility guidance without copying another product's visual identity.

## Try it on a phone

Install Node.js LTS, then from this folder run:

```bash
npm install
npx expo start
```

Install Expo Go on the phone and scan the QR code. This starter uses Expo SDK 54 so it can be tested in Expo Go during the current SDK transition.

## Google Play release status

Current candidate: **1.0.8 / Android version code 12 / runtime 1.0.8**. Expo/EAS access is restored as `doctoraiworld`; the signed [current build](https://expo.dev/accounts/doctoraiworld/projects/doctorai-mobile/builds/1b130dfb-4e5d-408c-b93a-009af1e74017) succeeded with the existing remote keystore. Cloud Expo Doctor passed 18/18 checks. Its downloaded AAB passed CMS signature/all 791 entry digests, packaged version/runtime, API 36, permission and SecureStore backup-exclusion review. The DoctorAI World personal Play developer account is accessible but has no app yet. The app-creation form confirms package availability; policy, signing-terms and export certifications remain unchecked.

The new candidate includes journaled SecureStore writes, retry controls, bounded account hydration, user-controlled JSON export, authenticated document viewing and app-cache cleanup. Data deletion invalidates old callbacks and waits for pending upload/sync work before fetching and deleting the current cloud document list. A downloaded update waits for “Save and restart.” These changes preserve the existing visual design.

Current local account-isolation source review: strict TypeScript passed; 28 synthetic mobile scenarios passed, including the Account A → sign-out → Account B/cloud-404 regression; Android Expo export passed with 709 modules / 2.44 MB. The earlier Expo compatibility, web export (435 modules / 1.21 MB), EAS archive inspection and signed AAB package review are dated evidence. The signed 1.0.8 (12) AAB and the [installable preview APK](https://expo.dev/artifacts/eas/XEyLyJkMfhBHRU98Ras8pv6zgpiesbc20vpWhr49618.apk) predate the account-isolation fix and must not be submitted. The new source still needs a signed build and physical-device review; the latest browser layout attempt was blocked, so no new layout pass is claimed. See the website repository's `docs/doctorai-android-release-review.md` for the current review and remaining gates.

Local checks:

```bash
pnpm exec tsc --noEmit
pnpm exec expo install --check
pnpm run verify:storage
pnpm run verify:files
pnpm run verify:account-deletion
```

This is an unpublished candidate, not a store-ready release. Expo SDK 54 configures Android `compileSdkVersion` and `targetSdkVersion` 36, which meets Google's current API-level minimum for new submissions. EAS build profiles exist; the Android submit profile currently targets the internal testing track.

SDK 54 enables Android edge-to-edge layouts by default. The app now uses `react-native-safe-area-context` for the main screen and briefing modal, and includes `expo-system-ui` so the configured light interface style is applied. TypeScript and Android/web JavaScript exports pass; test the status bar, navigation bar, modal and keyboard on a physical Android 16 device before release. See [Expo's SDK 54 notes](https://expo.dev/changelog/sdk-54), [safe-area setup](https://docs.expo.dev/develop/user-interface/safe-areas/) and [System UI configuration](https://docs.expo.dev/versions/v54.0.0/sdk/system-ui/).

The generated Android config requests camera access for the medicine-label photo flow, removes broad photo-library read, microphone, overlay and vibration permissions, and retains legacy `WRITE_EXTERNAL_STORAGE` only because Expo's camera flow requests it on Android versions earlier than 10. The document chooser uses Android's single-file system picker. The current `android/app/src/main/AndroidManifest.xml` is prebuild evidence only; inspect the merged manifest in the signed AAB and confirm older-Android camera capture on a device before filing Play declarations.

The app is being prepared as a consumption-only Android app: users can sign in and use entitlements already active on their DoctorAI account, but the Android app does not sell Pro or send people to the website to buy it. If in-app Pro sales are wanted later, choose and implement the Google Play Billing path for each market before showing an upgrade flow.

Before a Google Play release, finish and review the native app's account-deletion flow (separate from clearing health data). Settings now links to the external `/account-deletion` request page and also offers a prefilled email request; the user chooses when to send it. The website page must be deployed and verified before this app source is submitted. Complete Play Console's Health Apps and Data safety declarations, confirm the app-store health disclaimer and intended purpose, and resolve legal, privacy and clinical review gates. Complete real-account and physical-device journeys before applying for public distribution. If this is a personal Play Console account created after 13 November 2023, Google requires a closed test with at least 12 testers continuously opted in for 14 days before production access.

Chat and medication scanning call the existing website API after sign-in. Verify the production storage and provider configuration before submitting; the app's local fallback does not prove that secure account sync is available. Apple signing and App Store submission are separate work and are not covered by the Android release.

References: [Expo SDK 54 Android target levels](https://docs.expo.dev/versions/v54.0.0/), [Google Play Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511), [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818), [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111), [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).
