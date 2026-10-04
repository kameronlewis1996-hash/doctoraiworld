# Medication provider retirement — 4 October 2026

This change is an isolated web/preview candidate. It removes NZF/NZULM and DrugBank product, interaction and ingredient-check execution paths. It does not merge to production, configure secrets, or claim a replacement for those services.

## User-facing behavior

- Medicine name suggestions continue to use the checked-in Pharmac-derived terminology locally. A suggestion is not exact product matching.
- The Pro check keeps its sign-in, entitlement, secure-storage, explicit one-time consent and whole-list validation gates. It uses the local engine only; no medication name, allergy or condition request is sent to a medication database provider.
- The result states how many names resolved, preserves unmatched/incomplete/unknown states, and shows source attribution, catalogue counts and the small rule counts. A result with no matching alert still says it does not mean safe.
- The known local data contains 3,419 product/formulation rows, 1,444 brands, 1,224 chemical headings and 1,136 ingredient terms. Ingredient mapping is complete for 3,288 rows and incomplete for 131. The engine has 13 curated interaction rules, 2 allergy classes and 0 condition-specific rules. These counts do not establish clinical validation or complete New Zealand coverage.
- Existing saved records retain legacy provider-match fields untouched when edited. The current UI does not execute, suggest or treat those fields as verified matches.
- Label-photo OCR remains a separate explicitly consented path. Barcode search has been removed. The checker does not use scan images.

## API and provider boundary

The four obsolete catch-all action aliases (`ingredient-search`, `nzf-interactions`, `nzf-product-search`, `safety-check`) now return `410 Gone` with `Cache-Control: no-store`; the previous provider handlers and libraries were removed. The separate `/api/medication/safety` endpoint continues to use only `server-src/medication/safety-engine.cjs`. Preview provider guards remain in place for the unrelated AI and billing handlers.

## Verification

The following are synthetic/local checks. They do not use real medication records, cloud health storage, a licensed provider, OCR service or production deployment:

- `node scripts/verify-medication-database.cjs`
- `node scripts/verify-local-medication-ui.cjs`
- `node scripts/verify-retired-medication-providers.cjs`
- `node scripts/verify-managed-profiles.cjs`
- `node scripts/verify-person-switch.cjs`
- `node scripts/verify-preview-providers.cjs`
- `node scripts/verify-static-site.cjs`
- `node scripts/check-js.js`
- `node scripts/verify-medication-review.cjs`
- `node scripts/verify-managed-client-guards.cjs`
- `node scripts/verify-health-concurrency.cjs`
- `DOCTORAI_CHROMIUM=/usr/bin/chromium node scripts/verify-web-accessibility.cjs`
- `DOCTORAI_CHROMIUM=/usr/bin/chromium node scripts/verify-shared-dialogs.cjs`

The latest browser run passed 65 assertions across 36 WCAG-tagged axe states with no reported violations or JavaScript errors. The shared-dialog run passed 22 assertions across 6 axe states. Both reported zero paid calls; the web run reported zero external health-storage calls. These automated checks do not establish full WCAG conformance, deployed OAuth behavior, 400% zoom or assistive-technology support.

Synthetic UI captures: [before home](screenshots/web-2026-10-04/before-home-health-hub.png), [after home](screenshots/web-2026-10-04/after-home-1440.png), [after medications](screenshots/web-2026-10-04/after-medications-1440.png), [after documents desktop](screenshots/web-2026-10-04/after-documents-1440.png), [after documents mobile](screenshots/web-2026-10-04/after-documents-390.png). The home “before” capture is from the pre-change UI; “after” captures use only the browser test’s synthetic fixture.

The exact PR #34 Preview reports `ready:false`, with authentication, account storage, document storage, subscriptions and AI all disabled. The production config endpoint reports those flags enabled, but no signed-in account or private image was accessed, so account-specific upload/download was not verified. Vercel’s grouped production endpoint error summary found no matching runtime errors in the last 24 hours and no grouped production 5xx logs; that does not prove a successful private-file transaction. Public logo PNGs return HTTP 200, which does not prove private picture upload/download works. No production change was made.
