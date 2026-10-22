# Apple App Store readiness — 22 October 2026

**Status: not upload-ready.** This packet prepares truthful metadata and a release checklist. It does not create an iOS app, signed archive, IPA, App Store Connect record, or submission. Do not describe the current PWA as an approved or upload-ready iPhone app.

## Verified repository state

- Checked public repository `kameronlewis1996-hash/doctoraiworld` on `main` at `f614b3f31bdba8577377d8fbff919f20b6eaccf4` (the supplied baseline; latest commit author date 22 October 2026).
- The product is a static HTML/CSS/JavaScript site with Vercel serverless routes. [package.json](../../package.json) has Node.js 24 / pnpm scripts and web/server dependencies; the root has no Swift sources, `.xcodeproj`, `.xcworkspace`, `Info.plist`, or iOS entitlements. No `.agents/skills` or `AGENTS.md` is present in the repository tree.
- [manifest.webmanifest](../../manifest.webmanifest), [service-worker.js](../../service-worker.js), [pwa.js](../../pwa.js), and [verify-pwa-install.cjs](../../scripts/verify-pwa-install.cjs) describe the browser-installable PWA. [download.html](../../download.html) offers web installation and says native iPhone/Android store links will appear only after official approval.
- [privacy.html](../../privacy.html) provides the existing policy at `https://www.doctoraiworld.com/privacy` (last updated 5 October 2026); [terms.html](../../terms.html) describes an organiser and education service, not medical care. [about.html](../../about.html) links support at `support@doctoraiworld.com`.
- The manifest references `doctorai-app-icon.png`. Its PNG header is 1024×1024 RGBA (an alpha channel is present), but a full pixel scan confirms all 1,048,576 pixels are already fully opaque. The reproducible export at [doctorai-app-icon-1024-opaque.png](../../store-assets/apple/doctorai-app-icon-1024-opaque.png) keeps the existing artwork and removes the unused alpha channel.
- The published privacy notice describes user-entered health notes, medications, appointments, measurements, symptoms and documents; Google sign-in; optional encrypted account sync; Vercel, Google, Stripe, OpenAI, Europe PMC and Resend processing; and optional AI/label features. The web subscription page uses Stripe. The iOS build and its SDKs do not exist yet, so this is an evidence inventory, **not** a completed App Store privacy-label answer.
- The paid web beta is described in the Terms as adults 18+. The shipped app’s age-rating questionnaire still needs to reflect the final iOS content and features; do not call the app “for all ages” or select Kids based on this packet.


## Prepared icon export

The existing 1024×1024 RGBA source is already fully opaque: the script decoded and checked every pixel, finding 1,048,576 opaque, zero transparent, and zero partially transparent pixels. It creates a separate 1024×1024, 8-bit RGB PNG with no alpha while preserving the original logo and white background. Visual inspection confirms the blue artwork remains intact.

- Source: `doctorai-app-icon.png` (unchanged).
- Export: `store-assets/apple/doctorai-app-icon-1024-opaque.png` (266,438 bytes; SHA-256 `bd4ec234fd50f6418d297e0cd5d617b16573d4f9456df98de106ec97938895bb`).
- Reproducible tool: `scripts/prepare-app-store-icon.mjs`, Node.js built-ins only; validates source PNG chunk CRCs, dimensions, full alpha distribution, and every output pixel.
- Regenerate: `node scripts/prepare-app-store-icon.mjs`.
- Verify without writing: `node scripts/prepare-app-store-icon.mjs --check`.

The flat export is ready to be added as the 1024px image in the eventual Xcode asset catalog. No AppIcon asset catalog or Xcode project exists yet, so it has not been installed into a native target or checked with Apple’s tooling. Check the icon treatment against the HIG/Xcode version chosen by the owner when the native project is created.

## Draft product-page metadata

Use only after the native app’s shipped feature set and privacy flow match these statements. These are drafts, not App Store Connect entries.

| Field | Draft |
| --- | --- |
| Name | **DoctorAI Health Hub** (19/30 characters) |
| Subtitle | **Organise health notes & visits** (30/30 characters) |
| Promotional text | Keep appointments, medicines, symptoms and notes together. Prepare questions before a care conversation. (104/170 characters) |
| Description | See draft below. |
| Keywords (75/100 bytes) | `appointments,medications,symptoms,measurements,visit preparation,care notes` |
| Privacy policy URL | `https://www.doctoraiworld.com/privacy` |
| Support URL candidate | `https://www.doctoraiworld.com/about` (the repository page links the support email; verify that the published page provides working contact information) |
| Marketing URL | `https://www.doctoraiworld.com` |
| Category | Provisional: Health & Fitness. Owner to confirm the best fit against the final app. |
| App age rating | Owner to answer Apple’s current questionnaire from the final build; not determined here. |
| Copyright / developer display name | Owner/legal entity input required. |
| Bundle ID / SKU / App Store Connect app record | Not supplied or created. Select and verify these in the owner’s Apple account before building; the Bundle ID must match Xcode and cannot be changed after the first build upload. |

### Description draft (1,087/4,000 characters)

```text
Keep your health information organised and prepare for care conversations.

DoctorAI Health Hub lets you keep your own medication list, appointments, symptoms, measurements and notes together. Before a visit, select the details and questions you want in a brief, then review, copy or print it for a conversation with your care team.

You choose what to record and whether to keep it on this device or sign in to sync it. You can review, export and delete saved Health Hub information through Privacy controls.

DoctorAI also offers general health education and research references. When you choose Send, your question is sent to the configured AI provider; optional Health Memory may add details you approved. AI responses may be incomplete or wrong. DoctorAI does not diagnose or treat, provide treatment recommendations, or replace a qualified healthcare professional or emergency service. Any limited medication information does not establish safety or suitability; no alert does not mean your medicines are safe to take. Do not start, stop or change a medicine based only on the app.
```

The description deliberately makes no claims that DoctorAI diagnoses, treats, verifies medicines, or detects every interaction. Do not promote a medication-safety checker, clinical validity, or any research-pair dataset until rights and independent clinical review are resolved. No new clinical behavior or dataset activation is proposed.

## Required decisions and work before submission

1. **Build a real iOS product.** There is no iOS target or native build in this repository, and this Windows environment cannot run Xcode or an iOS simulator. A wrapper that only repackages the website carries a material App Review 4.2 minimum-functionality risk. Decide whether to keep the PWA as a Safari/Home Screen web app or fund a native iOS experience with useful platform-specific value. Do not claim a build exists until an owner creates and verifies it on macOS.
2. **Set up signing and app ownership.** The owner must supply the Apple Developer team/account, legal developer identity and contact, an available Bundle ID, internal SKU, version/build numbering, deployment target, and any justified capabilities. None is known here; no certificates, provisioning profiles, entitlements, Apple agreements, or store account were created.
3. **Resolve sign-in and deletion.** The current mobile-auth route [api/auth/mobile.js](../../api/auth/mobile.js) verifies Google credentials; if that is the iOS primary account login, Apple Guideline 4.8 requires an equivalent login option with limited data collection and private-email support unless an exception applies. No Sign in with Apple implementation was found in the inspected repository tree. Keep significant core use available without sign-in where possible. If users can create an account, Apple requires in-app account deletion. The current [Google auth route](../../api/auth/google.js) handles `DELETE` as best-effort session revocation plus cookie clearing; it does not delete an account. The [health-state route](../../api/health/state.js) `DELETE` removes only saved health state. The [documents route](../../api/documents.js) deletes one identified document; it is not an account-wide deletion path. These operations do not prove complete deletion of profile, all documents, account-linked data, sessions or processor-held data.
4. **Settle Pro purchase handling before showing paid unlocks.** The existing web Pro page uses Stripe for digital features such as file uploads and label-text extraction. Apple’s default rule is in-app purchase for digital features unlocked in an app; its multiplatform rule requires the same features to be available as in-app purchases in the app. Link-out purchase exceptions and entitlements vary by storefront. Do not add Stripe checkout links, web purchase prompts, or access-code unlocks to an iOS build until the owner has checked current storefront rules and selected an allowed model. No billing configuration was changed.
5. **Complete privacy and third-party review.** Update the privacy policy if the native SDKs, account features, storage, AI flows, analytics, or billing differ. Inventory the exact iOS binary and every SDK before answering App Store privacy questions; include all data handled by third-party partners. Verify clear in-app disclosures and explicit permission before sending personal health data to third-party AI. Keep separate opt-in for any label-image processing and disclose the provider and purpose at the point of use. The existing web notice is evidence for review, not an attestation for an unbuilt iOS app.
6. **Bound health claims and regulated status.** Preserve the organiser/education positioning and clinician/emergency caveats. Describe measurements as user-entered records, not device measurements or medically validated results. If the final app is treated as a regulated medical device in any territory, the owner must resolve registration/authorization and provide Apple’s required status and documentation. This packet does not make a regulatory determination.
7. **Prepare truthful assets and review access.** Produce screenshots from the actual iOS build in use, with synthetic sample data; do not reuse browser/PWA screenshots as iPhone captures or include real health data. Verify icon rights and an opaque, final 1024px app icon. Complete the age-rating and content-rights responses. Provide an active review account or a fully featured demo mode for account-only functions, keep required backend services available, and explain non-obvious behavior and purchases in Review Notes.
8. **Run release verification on Apple tooling.** Build and archive with Xcode; test crash-free launch, account creation/deletion, privacy controls, Google/Apple sign-in, IAP restore and renewal states if applicable, network failure states, VoiceOver, larger text, iPhone/iPad layouts, and any required privacy prompts. Verify the final app, metadata, URLs, screenshots, icon, app privacy answers and review notes in App Store Connect. Keep submission and release approval with the owner.


## Reproducible native packaging handoff

A native scaffold is not justified by the current architecture: the repo is a web/PWA service, with no iOS source, native feature specification, or Xcode project. A blank SwiftUI target would not create a meaningful app; a website-only WKWebView shell would carry App Review 4.2 minimum-functionality risk. No wrapper or placeholder target has been added.

On an owner-controlled Mac, after selecting platform-specific value and providing the real Bundle ID, SKU, deployment target and app ownership:

1. Create a native SwiftUI iOS target with useful device-native capability; do not represent a browser-only wrapper as an upload-ready product.
2. Add the opaque PNG above to Xcode’s generated AppIcon asset catalog. Keep the web/PWA icon untouched. Check the icon in the chosen current Xcode and on the actual iOS target.
3. Record the exact project/scheme, Xcode version, source commit, version/build number, configuration and test results. From the repo root, the unsigned simulator compile pattern is:
   ```sh
   xcodebuild -project <owner-created-project>.xcodeproj -scheme <owner-created-scheme> -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
   ```
4. Only after the owner configures their Apple team and signing assets, create an archive using the real project/scheme:
   ```sh
   xcodebuild -project <owner-created-project>.xcodeproj -scheme <owner-created-scheme> -destination 'generic/platform=iOS' -archivePath <private-build-path>/DoctorAI.xcarchive archive
   ```
5. Validate installation, account deletion, privacy prompts, accessibility, network failures and any IAP purchase/restore flows on supported simulator/device versions. Export or upload only through the owner’s configured Xcode/App Store Connect workflow after all gates pass.

These command patterns are not verified against a project because no project, scheme, signing identity, Apple team or Mac/Xcode environment is available here. There is no archive or IPA, and no upload or submission has occurred. No signing updates, certificates, provisioning profiles or credentials are requested or generated.

## Account deletion, authentication and privacy test plan

Use synthetic accounts, fake identity-provider sessions and synthetic health/document content only. Run these tests against a staging backend and actual iOS client before entering App Review. Record endpoint, build, OS, result and evidence for each case.

| Area | Reproducible check | Pass condition |
| --- | --- | --- |
| Signed-out use | Fresh install; open core organiser and visit-prep flows before login; attempt account-only sync separately. | Core functions not requiring an account remain available; any sign-in boundary explains why it is needed. |
| Authentication | Sign in and out; cancel provider flow; expire/revoke a provider session; verify sign-in again. If Google is primary, test the equivalent private-email-capable login option and account-linking behavior. | No stale session access; provider revocation/data access controls are reachable from the app; errors don’t leave a false signed-in state. |
| Account deletion | Create a synthetic account, save health state and a private document, invoke deletion from in-app settings, then retry after simulated timeout or partial backend failure. | User can initiate deletion in-app; success appears only after all required deletion actions complete; retry is safe/idempotent; the same identity cannot recover deleted active health records or documents. |
| Deletion scope/retention | Verify profile/account record, health state, private document metadata and blobs, provider/refresh sessions, account-to-entitlement mapping, and AI memory; inspect documented backup and legally required billing retention separately. | All active account data covered by the product’s published deletion promise is removed; residual legal/backup/processor retention is accurately described, not silently claimed deleted. |
| AI data sharing | With synthetic health data, capture outbound requests for a normal question, explicit Send, optional Health Memory on/off, and consent decline. | No question or health detail leaves before the disclosed user action and consent; Health Memory is included only when selected; payload matches what the user approved. |
| Label-image processing | Choose a synthetic medication label image, accept and decline the separate processing prompt, and inspect network/log traffic. | No image is transmitted after decline; provider, purpose and shared data are clear before opt-in; payload is limited to the intended task. |
| Data inventory/privacy label | Enumerate every native dependency/SDK, API endpoint, local store, analytics/crash tool and third-party partner; map data type, purpose, linkage, retention, deletion and consent to the final build. | Store privacy answers and in-app policy match the actual binary and partner practices on each platform; no health data appears in analytics, crash output, URLs or logs without an explicitly reviewed need. |
| Privacy controls | Open the policy and privacy/data controls from the app; export and delete synthetic records; revoke consent and sign out. | Policy/support links work; export, consent withdrawal, sign-out and account deletion are distinct and have truthful completion/error states. |

Current code establishes only a partial baseline: `api/auth/google.js` DELETE attempts session revocation, ignores revoke failures, and clears cookies; `api/health/state.js` DELETE deletes one health-state record; `api/documents.js` DELETE requires a document ID, ignores private-blob delete failures, then deletes that document’s metadata. No account-wide deletion route was found in the inspected API tree, and there is no verified end-to-end account-deletion workflow or native privacy/consent implementation. The app, SDK inventory, account-deletion cascade, and all test cases above are **not run** because no native client or Xcode target exists; do not treat this plan as an implementation or an attestation.

## Evidence and checks

- **Confirmed:** main points to the supplied baseline commit; the repository is a PWA/web service and has no native iOS project or build pipeline; the download page distinguishes web installation from future official native releases; privacy, terms, support contact and a 1024×1024 icon candidate exist.
- **Confirmed:** a full scan found all 1,048,576 source icon pixels have alpha 255; the export is a deterministic 1024×1024 8-bit RGB PNG with no alpha. The source and output were visually compared; the existing blue logo artwork is preserved. The PWA verifier only checks the 192px and 512px install icons and PWA routes.
- **Reviewed:** Apple’s current App Review Guidelines (minimum functionality, medical apps, sign-in/deletion, third-party AI/privacy, content rights and payments), App Store Connect privacy requirements, and metadata requirements as of 22 October 2026.
- **Not run / unavailable:** Xcode build/archive, code signing, iOS Simulator/device checks, TestFlight, actual iOS screenshots, Apple privacy questionnaire, regulated-device declaration and App Store review. No Apple credentials, developer team, app record or signing material were available.
- **Outcome:** no binary is upload-ready. The draft copy and checklist are ready for owner review; the native app, signing, payment model, account deletion/login compliance, privacy-label answers, screenshots and Apple account inputs remain release gates.

## Apple primary sources

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — sections 1.4.1, 2.3, 3.1.1/3.1.3(b), 4.2, 4.8 and 5.1.
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/) — privacy-policy URL and complete app/partner data disclosures are required.
- [App Store Connect app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/) — app-name/subtitle length, Bundle ID, age rating, and content rights.
- [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/) — promotional text, description and keyword limits; support URL and review-information requirements.
- [App icons Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons) and [Configuring your app icon using an asset catalog](https://developer.apple.com/documentation/xcode/configuring-your-app-icon) — current design and Xcode asset-catalog guidance.
