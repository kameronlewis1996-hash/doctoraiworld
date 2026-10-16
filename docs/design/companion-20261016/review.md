# DoctorAI companion preview — 16 October 2026

This is a separate, reviewable prototype stacked on the navigation work at `35f879ff9051b2ef0dec4251e064f1b98609a45c` (PR #80). It does not alter the Aurora homepage, the orange/red alert presentation, medication rules, or the three primary Health Hub destinations. A nested link under **Diary & Appointments** and a Visit prep link open `/next-steps-demo`.

## What can be tried

- **My Next Steps:** Write a draft, keep the source in the person's own words, optionally choose a check-back date, review it into a plan, mark progress or "still waiting," and prepare a printable visit brief. A fictional example is clearly labelled and can be reset.
- **Help me say it:** Turn the person's own concern, context, and question into an editable writing template. The wording is deterministic; the user can edit, copy, or explicitly add the final text to the visit brief. It does not diagnose, infer urgency, or send a message.
- **Family Care preview:** Select only fictional `.test` contacts and read-only sample categories, choose an expiry date, review an identity-check reminder, and simulate approval or revocation. No person receives an invitation and no real Health Hub data becomes available to anyone else.

The page is `noindex`. Prototype notes use this tab's `sessionStorage`, separately from the account and existing Hub records. There is a visible **Clear this demo** control. Successful Hub sign-out or deletion clears local notes and signals other open tabs; an account change in the same tab clears the previous owner's notes. If browser cleanup cannot be confirmed, the Hub warns rather than claiming success. The demo does not call an API or use payment, real contact, upload, or AI services. The browser may clear tab storage on close, but visitors should use the explicit clear control on a shared device.

## Screenshots

- [Next steps — desktop](plan-1440.png)
- [Next steps — mobile 390 px](plan-390.png)
- [Next steps — mobile 320 px](plan-320.png)
- [Editable wording — mobile](say-390.png)
- [Family Care simulation — desktop](family-1440.png)
- [Nested Health Hub entry — mobile](hub-entry-390.png)

## Verification

Local Chromium/Edge browser QA passed 22 functional/responsive checks at 1440, 390, and 320 px, with no horizontal overflow or console errors. Axe found no WCAG 2/2.1 A/AA violations in nine tested states. A separate account-boundary run confirmed another-tab clearing on successful sign-out, same-owner retention, and same-tab clearing on account change. The existing navigation browser suite passed 60 route/viewport cases and 13 interaction groups. Core, static-site, JavaScript syntax, Health Hub storage/navigation/visit-prep, alert, medication, and date/diary checks passed. [Machine-readable companion QA](companion-qa.json).

Reproduce locally with `node scripts/verify-companion-core.cjs`, `node scripts/verify-companion-browser.cjs`, and `node scripts/verify-companion-account-boundary.cjs`. The browser commands require `PLAYWRIGHT_MODULE` and a local server that serves the repository with the site's CSP; `COMPANION_BASE_URL` defaults to `http://127.0.0.1:4196`.

## Before considering real use

The prototype is **not** a clinical task system, messaging channel, reminder service, or sharing feature. Real follow-up workflow needs product and clinical review of status language, account-backed storage, consent and deletion design, reliable reminders if offered, and usability testing with patients and care teams. Real Family Care needs verified recipient identity, scoped authorization enforced by the server, expiry and revocation enforcement, access logs, notification design, and security/privacy review before any real health data or invitation is used. The earlier NZ$29/month idea is a hypothesis, not validated willingness-to-pay; access to a person's own information and important safety alerts should not depend on this preview or a new subscription. No paid flow is implemented here.

The branch is a draft for review and is not a production release. Merge sequencing must keep the PR #80 navigation/alert work and medication work owned by the other release thread intact.
