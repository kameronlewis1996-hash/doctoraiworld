# Public copy preview review — 21 October 2026

The research page now describes automated selections rather than “best” papers. The selection explanation matches the existing bounded algorithm: up to 30 returned records per window, a metadata score, publication-date tie breaking, and a seven-day recent window with a 30-day fallback. Each populated highlight and search card explicitly says that study-specific limitations have not been assessed. No study limitation or clinical conclusion was generated.

The medication-list template now describes the separately consented, limited DoctorAI-hosted curated-rules check consistently with the privacy notice. The person's list-update date is blank. The 1 October 2026 date is identified as the medicine-name catalogue source date, separately from the person's own list and appointment dates. Printing, blank CSV download and browser-only name lookup are preserved.

## Pricing diagnosis

A read-only request to production `/api/stripe/plans` on 21 October 2026 returned HTTP 200:

```json
{"plans":{"monthly":{"available":false,"interval":"month"},"annual":{"available":true,"amount":7900,"currency":"USD","interval":"year"}}}
```

In `server-src/stripe/public-plans.js`, this response means the request passed the initial key/environment-mode guard. The annual retrieval passed the existing validation. Monthly `available:false` can mean a missing monthly Price ID, a failed Stripe lookup, or a retrieved price that failed validation. The public response deliberately does not disclose which configuration failed, so it cannot establish the exact account-level cause.

Monthly validation requires an active recurring NZD price of 2,900 cents, interval `month`, interval count 1, and a live/test mode matching the environment. `subscription.js` deliberately disables all Pro checkout until that monthly price is verified, even when annual pricing is available. Server-side checkout independently enforces that gate. This behavior was retained.

The read-only Stripe account-discovery action returned `UNAUTHORIZED` / “This app connection requires reauthentication.” No alternate account/credential route was used, and no live Stripe setting, checkout session, account, secret or security setting was changed. An authorized operator must inspect `STRIPE_PRO_MONTHLY_PRICE_ID` and the existing `stripe_public_plan_invalid` / `stripe_public_plan_unavailable` diagnostics to distinguish the three causes. Do not bypass validation or substitute an unverified price.

## Validation

- `node scripts/verify-public-copy-consistency.cjs`: passes fictional highlight/search renderer checks, source/date and visible limitation wording, actual selection method, blank list date, catalogue date, curated-rule consent wording and unchanged price gates.
- `node scripts/verify-stripe-pricing.js`: passes price amount/currency/cadence/mode rejection and fail-closed checkout checks with offline fixtures.
- JavaScript syntax: 105 files passed.
- Static verification: 118 required files and 13 pages passed, including CSP checks.
- Existing fictional staff pair-review and staff medication-review checks passed.
- Headless browser checks at 320, 390 and 1440 pixels passed with fictional research and pricing fixtures: no document overflow, unclipped notices, visible blank list date, disabled checkout for unverified monthly pricing, no page exceptions and no mutation requests. Print mode retained the blank list-update field.

The branch retains the completed fictional staff demo in its ancestry. It introduces no real medication research, clinical rules, credentials or billing activation. This is a preview-only change.
