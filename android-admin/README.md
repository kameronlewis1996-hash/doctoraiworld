# DoctorAIWorld Admin (Android)

Private admin console for DoctorAIWorld — view usage stats, manage users,
and create/revoke Pro upgrade codes from your phone. This is a completely
separate app from the public DoctorAIWorld product: different package
(`com.doctoraiworld.admin`), not distributed on the Play Store, and gated
behind an admin login against the [`backend/`](../backend) API.

## Stack

- Kotlin + Jetpack Compose (Material 3)
- Retrofit + OkHttp + kotlinx.serialization for networking
- `androidx.security` `EncryptedSharedPreferences` for the session token
- Manual, hand-rolled DI (`ServiceLocator`) — no framework needed for an
  app this size
- No Play Services / analytics / crash reporting SDKs — nothing phones
  home except your own backend

## Building

1. Install [Android Studio](https://developer.android.com/studio) (this
   pulls in the Android SDK, which this project needs to build — it isn't
   bundled here).
2. Open the `android-admin/` folder as a project.
3. Let Gradle sync (first sync downloads dependencies).
4. Run the `app` configuration on an emulator or a device connected over
   USB with developer mode + USB debugging enabled.

From the command line, once you have an Android SDK installed and
`ANDROID_HOME`/`local.properties` set up:

```bash
cd android-admin
./gradlew assembleDebug
# APK lands in app/build/outputs/apk/debug/app-debug.apk
```

> This project was built and code-reviewed in a sandboxed environment
> without access to Google's Maven repository (`dl.google.com`), so the
> Gradle build itself could not be executed end-to-end here — only the
> backend API was live-tested. The Kotlin/Compose/Gradle code was written
> and manually reviewed carefully, but **build it once in Android Studio
> before you rely on it**, the normal way you'd verify any new project.

## First run

1. Start the backend (see [`../backend/README.md`](../backend/README.md))
   and seed your admin account.
2. Launch the app. On the login screen:
   - **API server URL** — where your backend is reachable. For an emulator
     talking to a backend on your own machine, the default
     `http://10.0.2.2:4000/` already works. For a real device, use your
     machine's LAN IP (`http://192.168.x.x:4000/`) or your deployed HTTPS
     URL.
   - **Admin email / password** — from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. You land on the Dashboard, with tabs for Pro Codes, Users, and Settings.

## Keeping this private

- **Not on the Play Store.** Distribute the APK yourself (direct file
  transfer, a private download link, or Android Studio's "Run" over USB).
  Anyone without the APK file has no way to find or install this app.
- **Login required.** Every screen past login requires a valid admin
  session token issued by your backend; there's no offline/guest mode.
- **Encrypted local storage.** The session token is stored in
  `EncryptedSharedPreferences` (AES-256), and backups are disabled
  (`android:allowBackup="false"`, plus explicit data-extraction-rules
  exclusions) so the token can never leave the device via cloud backup or
  device-transfer.
- **Generic app identity.** The launcher label is "DAW Console" with a
  plain icon — it doesn't announce "DoctorAIWorld Admin" on your home
  screen. Change `strings.xml` (`app_name`) and the launcher drawables in
  `app/src/main/res/` if you want a different name/icon, or something that
  blends in even more.
- **HTTPS enforced** for anything other than local dev — see
  `network_security_config.xml`.

If you want an extra layer, add a device-level app lock (many Android
launchers/phones support per-app biometric lock natively) on top of this.

## Project layout

```
app/src/main/java/com/doctoraiworld/admin/
├── data/
│   ├── model/        Kotlin data classes mirroring the backend's JSON
│   ├── remote/        Retrofit ApiService, OkHttp client, auth interceptor
│   ├── local/          EncryptedSharedPreferences-backed token/URL storage
│   └── repository/  One repository per resource (auth/stats/users/proCodes/settings)
├── di/                       ServiceLocator (manual DI)
├── ui/
│   ├── login/            Login screen + ViewModel
│   ├── dashboard/     Stats overview
│   ├── procodes/        Pro code list + create dialog
│   ├── users/             User list, search, and per-user edit screen
│   ├── settings/        Editable app settings (pro price, banner, etc.) + logout
│   ├── navigation/    NavHost + bottom navigation
│   ├── components/  Shared loading/error/stat-card composables
│   └── theme/            Color/type/theme
└── util/                       ApiResult + UiState sealed classes
```

## Extending it

Things intentionally left simple/out of scope for this first version —
straightforward to add on top of the existing repository/ViewModel
pattern:

- A date picker for setting a user's Pro expiry or a code's expiry
  (the backend API already accepts `proExpiresAt` / `expiresAt`; the UI
  just doesn't expose a picker yet).
- Charts for the `/api/stats/timeseries` endpoint (already implemented on
  the backend, not yet visualized in the app).
- Push notifications for admin alerts.
