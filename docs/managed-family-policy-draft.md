# DRAFT — managed family profiles policy wording

For owner and qualified privacy/legal review only. This document is excluded from deployment. It does not change the published Privacy Notice or Terms and makes no claim of legal compliance.

## Current conflict and approved product direction

`privacy.html` (Children and emergencies) and `terms.html` (Founding-member beta) currently prohibit managing another person's health information. Approved policy alignment is required before production release. The owner explicitly included children. Adult account holders can assert adult permission/authority or parent/legal-guardian authority for a child. No child login, exact age, DOB, diagnosis or evidence field is introduced.

## Minimal proposed replacement wording

Replace the Privacy Notice's **Children and emergencies** paragraph with:

> Paid account holders must be adults aged 18 or older. A signed-in Pro account holder may manage a separate profile for another adult with their permission or other valid authority, or for a child or young person where the holder is their parent or legal guardian and has authority for the intended use. Children have their own privacy rights. Explain uses in a way they can understand and consider their wishes and ability to take part. Parent or guardian status does not authorize every use, and disability does not by itself establish inability to consent. DoctorAI is not an emergency service or a substitute for a qualified clinician. If you may be in immediate danger, contact your local emergency service.

Replace the Terms' **Founding-member beta** paragraph with:

> Paid founding-member subscriptions are offered to adults aged 18 or older. Pro account holders may manage separate profiles for other adults with their permission or valid authority, and for children where they are a parent or legal guardian with authority for the intended use. You are responsible for checking that authority, considering a child's wishes and ability to take part, keeping each person's information separate, and reviewing information before sending it to AI. A family profile does not create a separate login or establish a legal right to every use or disclosure.

Add a short **Family & loved ones** paragraph to the Privacy Notice:

> Managed profiles belong to the signed-in account holder and have no separate logins or invitations. We store a name, optional relationship, and the account holder's authority basis and confirmation timestamp. Each profile's saved health information and documents are kept separate from the account holder's and other profiles. Managed health information uses encrypted account storage and is not saved in the browser's persistent health cache. Archiving or a subscription ending keeps saved information available to view, export and delete. Use the selected profile's Privacy controls to export or delete its saved health information and documents. Deletion can be incomplete if a step fails; retry while signed in and connected.

Update the Privacy Notice's **AI processing** wording to cover chat and managed-person per-action consent:

> When you select Send, your message is sent to the configured AI provider. For a managed profile, only that person's approved Health Memory is added when enabled. Child AI and medication-label scans are unavailable pending child-focused privacy/provider assessment and approval of action notices. Each supported managed adult chat message, briefing and label scan presents a disclosure of the information and provider, and asks for authority and consent for that individual request. For a child, explain the action in a way they can understand and consider their wishes and ability to take part. Medication-label photos also require separate scan consent. DoctorAI sets the OpenAI Responses API `store` option to `false` for chat and scans. This does not eliminate all provider retention: OpenAI may still retain abuse-monitoring logs under its applicable data controls. No special retention exception is assumed.

The lifetime complimentary Pro program needs separately approved eligibility, proof-review and retention wording before opening. Do not publish an available application route or claim proof can be submitted until those controls exist. Existing paid subscriptions are not automatically cancelled or changed by a complimentary grant.

## Exact review and owner decisions still required

1. Approve final wording and expressly authorize publication to the Privacy Notice and Terms. Neither legal page was edited in this task. Confirm jurisdiction-specific child notices, authority changes/disputes, handling of wishes/capacity and access/deletion requests, and transition to adulthood. No exact-age/DOB field should be added without a defined need.
2. Keep child AI/OCR gated off until a child-focused privacy/provider assessment and action-specific notices are approved. Review that intended use and disclosure, including provider retention and how the child's understanding and wishes are considered. The confirmation records an assertion; it does not verify authority or establish legal compliance.
3. The owner approved Kam as intended human reviewer and a short, redacted letter from a registered health professional confirming disability, with no diagnosis/full history. Establish the remaining eligibility/authority/registration details, secure access/review channel, short proof retention/deletion deadline and minimal permanent verification decision record, appeals/revocation and already-paying applicant handling. See [the bounded program draft](caregiver-lifetime-pro-draft.md). No household cap, narrower disability category, annual renewal or age-18 expiry is assumed. Policy approval does not enable uploads, create privileged access or grant Pro.
4. Verify an existing physically separate Preview KV/private Blob allocation and test signing secret, then authorize binding the four `PREVIEW_*` variables for this feature branch. No credentials, resources or persistent access were created or expanded.
5. Review the implemented self-cache boundary and recovery wording before release: existing unowned bytes remain quarantined, verified account-bound self caches prevent reload mixing, and recovery requires named-account review plus an explicit save. New anonymous health entries stay in the session and can be exported. Browser storage remains plaintext; managed profiles never use persistent health cache. See [cache ownership and recovery](self-cache-ownership-proposal.md). The implementation does not publish legal pages.

## Review references and limits

The [NZ Privacy Commissioner's guidance on children's information requests](https://www.privacy.org.nz/responsibilities/responding-to-requests-for-personal-information-about-children-and-young-people/) describes children's own privacy rights and case-specific representation, including wishes and maturity. Its HIPC under-16 representative provision addresses access requests; this draft does not treat it as blanket permission for storage, AI use or every disclosure. That guidance informs the proposed product review, not a compliance determination.

The provider retention caveat is based on [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data). Publication and production promotion require separate approval.

Additional review references: [NZ Privacy Commissioner AI guidance](https://www.privacy.org.nz/resources-and-learning/a-z-topics/ai/) and [Health Information Privacy Code 2020, version as at 1 May 2026](https://www.privacy.org.nz/assets/Codes-of-Practice-2020/Health-Information-Privacy-Code-2020-website-version.pdf). The collection/use/disclosure review is separate from representative access requests. These are reviewer references, not a conclusion about the service’s compliance.
