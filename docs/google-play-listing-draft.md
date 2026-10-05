# DoctorAI Google Play listing draft

**Status:** Working copy for review; not ready to paste into Play Console.  
**App version:** 1.0.8 (12) (`com.doctoraiworld.healthhub`)  
**Release track configured in EAS:** Internal testing.

**Publisher access:** Expo/EAS restored as `doctoraiworld`; DoctorAI World personal Play developer account is accessible but has no app yet. The non-binding create-app form is populated, but Google's current account guidance directs health-app developers to use an Organization developer account. Owner-led account conversion and verification must happen before app creation/submission. The form also requires policy, Play App Signing and export declarations, none of which have been accepted. See the [Android release review](doctorai-android-release-review.md) for details.

## Listing text

**App name**  
DoctorAI World (14 characters; Play limit is 30.)

**Short description**  
Organise health details, appointments and questions for your next care visit. (77 characters; Play limit is 80.)

**Full description**

DoctorAI World helps you organise health details you choose to record and prepare for conversations with your healthcare professional.

• Keep notes about symptoms, medicines, measurements and appointments.
• Prepare questions and review selected details before a visit.
• Pro accounts can save selected documents and open them from the Health Hub.
• Use optional AI tools to organise information and get general health education.

Your record starts empty. Health entries stay on your device unless you sign in; account sync depends on the DoctorAI storage service being available. Document uploads require an active DoctorAI Pro entitlement. Review AI-generated content and medicine label details against the original information. Results may be incomplete or incorrect.

DoctorAI is for health organisation and general education. It does not diagnose or prescribe, and it is not for emergency care or decisions about starting, stopping or changing treatment. For medical advice, speak with a healthcare professional. For an emergency, contact your local emergency service.

**Required regulatory wording — choose only after clinical and regulatory review**

- If confirmed not to be a medical device, Google requires the description to state that the app is not a medical device and does not diagnose, treat, cure or prevent any medical condition, and to remind users to consult a healthcare professional. Add this exact statement after review: “DoctorAI is not a medical device and does not diagnose, treat, cure or prevent any medical condition. Consult a healthcare professional for medical advice.”
- If the intended purpose or features make it a regulated medical device in any launch market, do not use the non-device statement. Resolve the classification and required regulatory information before completing the listing.

## Console fields and assets still needed

- Confirm developer account owner, legal operator, target country, language, category, content rating and public support contact.
- Resolve the Personal-to-Organization account conversion with the account owner before creating the app. Google requires an organization payments profile, D‑U‑N‑S number, verified organization website/details and a 72-hour processing wait before submitting new apps. Confirm whether this account needs closed testing or device verification after conversion.
- Confirm the consumption-only billing model for Android. The current app does not link to the website checkout; preserve that unless a market-specific Play billing route is reviewed and implemented.
- Prepare the 512×512, 32-bit PNG app icon with alpha (max 1 MiB), a 1024×500 JPEG or 24-bit PNG feature graphic, and at least two current-version screenshots across device types. Screenshots must be JPEG/24-bit PNG, 320–3840 px, aspect ratio no wider/taller than 2:1, and captured from the actual app with synthetic information only. Do not use the old website mockups as app screenshots.
- Draft listing assets now exist in [`assets/google-play`](../assets/google-play/): `app-icon-512.png` is 512×512, 32-bit RGBA, 95,978 bytes; `feature-graphic-1024x500.png` is 1024×500, 24-bit RGB, 41,800 bytes. The originals are retained beside them, and [`scripts/build-google-play-assets.ps1`](../scripts/build-google-play-assets.ps1) rebuilds the two outputs. The feature graphic uses existing listing language and describes only appointment, question and health-note organization. Both are review drafts pending owner brand approval. Suggested Console alt text, pending approval: icon — “DoctorAI World logo with a blue digital profile symbol on a white background”; feature graphic — “DoctorAI World helps organise health details, appointments and questions before a care visit.” The official asset rules require a 32-bit PNG with alpha for the icon and JPEG or 24-bit PNG without alpha for the feature graphic.
- The current folder's `preview.png` (390 × 844) and `mobile-preview.png` (412 × 915) show an older Home screen. Recapture from the signed 1.0.8 release candidate; do not upload these older previews as current listing screenshots.
- Write reviewer access instructions and provide a dedicated demo account with synthetic data if Play review requires sign-in.
- Complete the Health Apps declaration and Data safety form from the actual production API, SDK, storage, analytics, document and AI data flows. Do not infer the form answers from this listing copy.
- Planned public URLs: [Privacy Notice](https://www.doctoraiworld.com/privacy) and [Account deletion request](https://www.doctoraiworld.com/account-deletion). The local website candidate now defines the standalone route, but Production still returns 404 there; do not enter this URL in Play Console until the reviewed page is live and the request process is staffed.
- Build and install the signed Android release candidate, test the listed flows on a device, then follow the Play Console testing and approval path for this developer account.
- If the Play developer account is a new personal account, its owner must also complete device verification using the Play Console mobile app on a non-rooted Android 10+ phone before public distribution.

Google Play policy references: [Play Console requirements and account type](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en), [Personal-to-Organization account conversion](https://support.google.com/googleplay/android-developer/answer/16260648), [listing fields and character limits](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en), [preview assets and screenshots](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en), [Health Apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en), [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), [device verification](https://support.google.com/googleplay/android-developer/answer/14316361?hl=en), and [review sign-in details](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en).
