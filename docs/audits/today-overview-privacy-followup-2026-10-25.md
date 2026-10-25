# Today saved-overview privacy follow-up

Date: 2026-10-25
Scope: the Today “Review saved info” action. Synthetic account identity and health records only.

## Finding

The first release routed this new Today action into an existing AI health briefing. Opening that briefing automatically posted recent symptom notes to `/api/chat`. The label did not make the request clear.

## Change

Today now opens the existing local saved-health overview instead. It displays details already saved by the current owner and does not load an AI response. The separate health-briefing action under My Health remains unchanged. The service-worker cache name was incremented so installed clients refresh the updated Today markup.

## Audit 1: information flow and presentation

**Passed** in local Chromium at 1440, 390, and 320 CSS pixels. Today keeps the user-written focus and record links visible; its secondary action now reads “Review saved info.” The detailed overview stays behind an explicit click. No horizontal overflow was found. Inspected captures are `/tmp/doctorai-today-focus-audit/today-populated-{1440,390,320}.png` and `/tmp/doctorai-today-focus-audit/today-saved-overview-390.png`; all records are synthetic.

## Audit 2: functional and privacy regression

**Passed** with `node scripts/verify-today-records-browser.cjs` (16 browser check groups). In a mocked signed-in account session, the Today action opened “Your personal overview,” showed synthetic saved medicine and condition entries, did not render the AI briefing, and produced zero `/api/chat` requests. Existing Today focus, diary, medicine, auth, owner-isolation, and legacy-storage checks also passed in this suite.

## Audit 3: final code and release checks

The change is limited to the Today action target/copy, its regression assertion, and PWA cache version assertions. No health-record schema, clinical rule, AI vendor, or API behavior changed. JavaScript syntax, relevant regression checks, and GitHub Actions static-site verification must pass on the exact release commit before merge. Public production checks remain subject to direct site access; no protected-preview or network workaround is permitted.
