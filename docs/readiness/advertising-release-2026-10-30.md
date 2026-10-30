# Advertising readiness: review packet, 30 October 2026

Status: **draft for review; not approval to advertise or a clinical or legal certification.** This packet accompanies the proposed branch and must be reconciled against the exact release commit and its CI before promotion. No production deployment or real purchase was performed as part of this draft.

## Twelve-item completion matrix

| Area | Status and evidence | Remaining action |
| --- | --- | --- |
| Product message | Proposed fix: homepage names medicines, symptoms, questions and a visit brief; subscription exclusions are explicitly labelled. | Review the final rendered release and approved advertising copy. |
| Brand | Existing blue/cyan assets and styles documented below. Proposed reduced hero mark keeps primary actions in the short desktop viewport. | Independent visual review at actual device sizes. |
| Free and Pro | Proposed exclusion uses a neutral mark; existing plan review displays renewal and requires consent. `verify-subscription-plans.cjs` uses synthetic prices. | Verify actual availability and displayed prices on the deployed release; annual NZD amount remains undecided. |
| Onboarding and storage | Existing `setDeviceStorage` confirms removal across profiles; `verify-device-health-storage.cjs` checks cancellation and fictional account isolation. | Real authenticated and physical-device journeys remain unverified. |
| Medication identification | Proposed Pharmac co-trimoxazole spelling alias and partial-combination coverage display; synthetic tests only. OCR requires consent and user review. | Confirm source rights and independent clinical review of mappings and warnings. |
| Medication rules | Current documented scope is two pairwise, one multi-medicine, two internal allergy prompts, zero medicine-condition rules; 1,269 source-derived candidates excluded. See clinical packet below. | Review retained sources, intended use and severity. Unassessed is not safe. |
| Documents and export | Synthetic upload, retry, owner-switch, deletion failure and visit-prep tests exercise code paths; see `docs/operations/document-upload-cleanup.md`. | Isolated real authenticated upload, retrieval, deletion and export still need authorised testing. |
| Billing and entitlements | Offline Stripe and subscription regression suites exercise selected prices, entitlement and webhook paths. Seven events were previously verified on the live endpoint. | Live delivery and real customer fulfilment remain unverified; do not create a real charge for testing. Secure Stripe access is needed for further account inspection. |
| Privacy and data flow | Draft inventory below follows repository code and notice; the storage cancellation test uses fictional profiles. | Verify actual provider settings, retention, hosting regions and overseas transfers; obtain privacy review. |
| Security | Synthetic auth and ownership checks cover selected paths; uploads fail closed on missing secure storage. | Independent security review and real isolated account testing are not established. |
| Operations | Cleanup procedure exists for incomplete document deletion. Draft incident, support and refund handoff below. | Assign owners, verify actual provider procedures and response capacity. |
| Advertising and regulatory | Draft copy below avoids diagnosis and comprehensive safety claims. | Qualified review of intended use, NZ advertising, privacy and product categorisation; confirm country, substantiation and platform policies before advertising. |

## Clinical and provenance review

- Snapshot: `docs/medication-provenance-release-audit.md`, `docs/medication-provenance-exclusions.json`, `docs/pharmac-incomplete-mapping-audit-2026-10.md`, and the dated NSAID scenario in `docs/medication-review/nsaid-pair-review-2026-10-18.md` are the current in-repository evidence. The Pharmac snapshot is dated 2026-10-01; it is an ingredient/formulation catalogue, not evidence that a medicine combination is safe.
- Retained source-derived rules require record-level attribution and verified reuse conditions under the repository policy. Data-sheet references and an SPS-linked rule require source-by-source rights and context review; public availability and paraphrasing do not settle reuse rights. The 1,269 excluded candidates must stay inactive.
- Expected output: a supported match can produce a possible concern and retain its severity and urgent guidance; unsupported or incompletely mapped pairs remain **not assessed**. For a combination medicine, a matched ingredient must not conceal other unchecked ingredient pairs. Duplicate-ingredient, allergy and interaction notices have distinct meanings. No alert is not an all-clear.
- Review fictional cases: supported pair, supported multi-medicine rule, high severity, unmatched medicine, no medicines, combination with one supported and one unchecked pair, confirmed versus unconfirmed label ingredient, ambiguous synonym, duplicate and stale result. Check false positives and false negatives, source currency, dose/route applicability and patient-facing action. Scanner output needs user confirmation; it is not clinical validation.
- Independent reviewer and qualifications: __________________; source/rights reviewer: __________________; rule and catalogue version/hash: __________________; review date: __________________; next review date and update owner: __________________; decision and unresolved limitations: __________________. **Blank fields mean no sign-off.**
- Rollback: identify the last verified production commit and deployment before promotion; restore that deployment through the normal release process if a regression is confirmed. Preserve account data and investigate before deleting or changing records.

## Data-flow inventory and assessment draft

The current notice describes device/session storage; optional signed-in encrypted account state; encrypted Pro document storage; Google sign-in; Stripe billing; OpenAI processing of user-requested AI and separately consented label images; Vercel hosting; Europe PMC research; and Resend for authorised account mail. Local alert evaluation uses loaded hub details in the browser. A failed upload cleanup may leave an encrypted blob requiring operator investigation. The optional, consented public-resource page counts described in the notice do not establish that any particular analytics deployment is active. Do not put health content in advertising trackers.

Inventory to confirm with provider settings and contracts: each purpose and data category, current subprocessors, access, regions and transfers, retention and backup periods, deletion propagation, encryption/key ownership, logging, incident contacts and lawful basis. The notice says scan requests set `store: false` but does not establish an OpenAI zero-retention exception. Record privacy-review owner, date and decisions before launch.

## Brand kit and draft copy

- Existing assets: `doctorai-public-logo-transparent.png`, `doctorai-head-logo-transparent.png`, `doctorai-app-icon.png`, `doctorai-app-icon-192.png`, `doctorai-app-icon-512.png`, and existing social preview assets. These are existing raster/SVG files, not newly certified master artwork.
- Existing homepage colours include blue `#0759b6`, navy `#071b36`, and aurora cyan `#95dffbc4`; see `welcome.css` and `aurora-theme.css` for context and responsive styles. Existing typography uses DM Sans with system fallbacks and Newsreader for selected accents. Retain visible focus, readable contrast, reduced-motion support and compact layouts; assess contrast in each actual use.
- Draft: “Keep medicines, symptoms and questions together. Choose details to prepare a visit brief.” The Free hub supports manual organisation and a chosen visit brief; Pro adds supported file/photo uploads and consented label text extraction for user review. The local rules are limited and do not assess every interaction. DoctorAI provides organisation and education, not diagnosis or medical care. Substantiate each claim in the final landing page and jurisdiction.

## Operational handoff

- Incident: preserve evidence without health content or secrets in public channels; identify affected service and owner, contain using authorised access, record impact and recovery, and verify the rollback or fix. Do not promise an unstaffed response time.
- Support and deletion: use the privacy controls and the incomplete-upload cleanup runbook; report partial failures accurately and do not claim deletion from external provider logs or backups without evidence.
- Billing and refunds: route the customer to existing billing management or support. An authorised operator must consult the actual Stripe account and current policy before deciding or issuing a refund; no refund is implied by this packet.
- Advertising review references: [ASA Therapeutic and Health Advertising Code](https://asa.co.nz/codes/codes/therapeutic-and-health-advertising-code-new/), [Health Information Privacy Code](https://www.privacy.org.nz/privacy-principles/codes-of-practice/hipc2020/), [Privacy Commissioner guidance on generative AI](https://www.privacy.org.nz/resources-and-learning/a-z-topics/ai/generative-artificial-intelligence/), [Medsafe product categorisation](https://medsafe.govt.nz/regulatory/categorisation-of-products.asp), and [Google healthcare advertising policy](https://support.google.com/adspolicy/answer/143465?hl=en). These are review references, not conclusions about DoctorAI's classification or compliance.
