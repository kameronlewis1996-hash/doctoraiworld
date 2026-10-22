# Apple App Store readiness — 22 October 2026

**Status: not upload-ready.** This packet prepares truthful metadata and a release checklist. It does not create an iOS app, signed archive, IPA, App Store Connect record, or submission. Do not describe the current PWA as an approved or upload-ready iPhone app.

## Verified repository state

- Checked public repository `kameronlewis1996-hash/doctoraiworld` on `main` at `f614b3f31bdba8577377d8fbff919f20b6eaccf4` (the supplied baseline; latest commit author date 22 October 2026).
- The product is a static HTML/CSS/JavaScript site with Vercel serverless routes. [package.json](../../package.json) has Node.js 24 / pnpm scripts and web/server dependencies; the root has no Swift sources, `.xcodeproj`, `.xcworkspace`, `Info.plist`, or iOS entitlements. No `.agents/skills` or `AGENTS.md` is present in the repository tree.
- [manifest.webmanifest](../../manifest.webmanifest), [service-worker.js](../../service-worker.js), [pwa.js](../../pwa.js), and [verify-pwa-install.cjs](../../scripts/verify-pwa-install.cjs) describe the browser-installable PWA. [download.html](../../download.html) offers web installation and says native iPhone/Android store links will appear only after official approval.
- [privacy.html](../../privacy.html) provides the existing policy at `https://www.doctoraiworld.com/privacy` (last updated 5 October 2026); [terms.html](../../terms.html) describes an organiser and education service, not medical care. [about.html](../../about.html) links support at `support@doctoraiworld.com`.
- The manifest references `doctorai-app-icon.png`. Its PNG header is 1024×1024 RGBA (alpha channel present). Treat it as a candidate only; inspect the artwork and prepare an opaque, visually verified App Store export before adding it to an Xcode asset catalog.
- The published privacy notice describes user-entered health notes, medications, appointments, measurements, symptoms and documents; Google sign-in; optional encrypted account sync; Vercel, Google, Stripe, OpenAI, Europe PMC and Resend processing; and optional AI/label features. The web subscription page uses Stripe. The iOS build and its SDKs do not exist yet, so this is an evidence inventory, **not** a completed App Store privacy-label answer.
- The paid web beta is described in the Terms as adults 18+. The shipped app’s age-rating questionnaire still needs to reflect the final iOS content and features; do not call the app “for all ages” or select Kids based on this packet.

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
3. **Resolve sign-in and deletion.** The current web login uses Google. If the iOS app uses Google as the primary account sign-in, Apple Guideline 4.8 requires an equivalent privacy-preserving login option (normally Sign in with Apple, unless an exception applies). Keep meaningful core use available without sign-in where possible. If users can create an account, implement and test in-app account deletion across the account’s saved health data and private documents. The web repository has separate health-state deletion and session-revocation routes; signing out alone is not proof of account deletion.
4. **Settle Pro purchase handling before showing paid unlocks.** The existing web Pro page uses Stripe for digital features such as file uploads and label-text extraction. Apple’s default rule is in-app purchase for digital features unlocked in an app; its multiplatform rule requires the same features to be available as in-app purchases in the app. Link-out purchase exceptions and entitlements vary by storefront. Do not add Stripe checkout links, web purchase prompts, or access-code unlocks to an iOS build until the owner has checked current storefront rules and selected an allowed model. No billing configuration was changed.
5. **Complete privacy and third-party review.** Update the privacy policy if the native SDKs, account features, storage, AI flows, analytics, or billing differ. Inventory the exact iOS binary and every SDK before answering App Store privacy questions; include all data handled by third-party partners. Verify clear in-app disclosures and explicit permission before sending personal health data to third-party AI. Keep separate opt-in for any label-image processing and disclose the provider and purpose at the point of use. The existing web notice is evidence for review, not an attestation for an unbuilt iOS app.
6. **Bound health claims and regulated status.** Preserve the organiser/education positioning and clinician/emergency caveats. Describe measurements as user-entered records, not device measurements or medically validated results. If the final app is treated as a regulated medical device in any territory, the owner must resolve registration/authorization and provide Apple’s required status and documentation. This packet does not make a regulatory determination.
7. **Prepare truthful assets and review access.** Produce screenshots from the actual iOS build in use, with synthetic sample data; do not reuse browser/PWA screenshots as iPhone captures or include real health data. Verify icon rights and an opaque, final 1024px app icon. Complete the age-rating and content-rights responses. Provide an active review account or a fully featured demo mode for account-only functions, keep required backend services available, and explain non-obvious behavior and purchases in Review Notes.
8. **Run release verification on Apple tooling.** Build and archive with Xcode; test crash-free launch, account creation/deletion, privacy controls, Google/Apple sign-in, IAP restore and renewal states if applicable, network failure states, VoiceOver, larger text, iPhone/iPad layouts, and any required privacy prompts. Verify the final app, metadata, URLs, screenshots, icon, app privacy answers and review notes in App Store Connect. Keep submission and release approval with the owner.

## Evidence and checks

- **Confirmed:** main points to the supplied baseline commit; the repository is a PWA/web service and has no native iOS project or build pipeline; the download page distinguishes web installation from future official native releases; privacy, terms, support contact and a 1024×1024 icon candidate exist.
- **Confirmed:** the app icon PNG is RGBA with an alpha channel; the PWA verifier only checks the 192px and 512px install icons and PWA routes.
- **Reviewed:** Apple’s current App Review Guidelines (minimum functionality, medical apps, sign-in/deletion, third-party AI/privacy, content rights and payments), App Store Connect privacy requirements, and metadata requirements as of 22 October 2026.
- **Not run / unavailable:** Xcode build/archive, code signing, iOS Simulator/device checks, TestFlight, actual iOS screenshots, Apple privacy questionnaire, regulated-device declaration and App Store review. No Apple credentials, developer team, app record or signing material were available.
- **Outcome:** no binary is upload-ready. The draft copy and checklist are ready for owner review; the native app, signing, payment model, account deletion/login compliance, privacy-label answers, screenshots and Apple account inputs remain release gates.

## Apple primary sources

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — sections 1.4.1, 2.3, 3.1.1/3.1.3(b), 4.2, 4.8 and 5.1.
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/) — privacy-policy URL and complete app/partner data disclosures are required.
- [App Store Connect app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/) — app-name/subtitle length, Bundle ID, age rating, and content rights.
- [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/) — promotional text, description and keyword limits; support URL and review-information requirements.
- [App icons Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons) — Apple’s current icon design guidance.
