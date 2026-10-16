# Combined checker propagation review (draft)

Frozen baseline: `7bec9131662b72d74e45efbf1aaaea0eda220dbe`; rules `2026.10.15-r149` (2 pair rules, 1 multi-medicine rule, 2 allergy class rules, 0 condition rules). Synthetic expectations are clinician-unadjudicated. This is software conformance evidence, not clinical validation or real-world sensitivity/specificity.

## Defect and change

The retained `ras-inhibitor-diuretic-nsaid-aki` rule fired in the medicine engine for saved Losartan, Furosemide and Ibuprofen, but the combined wrapper re-evaluated only pairs and dropped the whole-list notice. The real Alerts renderer therefore never received it.

The medicine engine now adds the already-selected medicine indexes to that existing result. The wrapper forwards that result once with exact saved-record triggers. Multi-medicine output is excluded from the pair forwarding loop and from pairwise coverage counts, including when three components occur in two products. Predicates, ingredient/class mappings, severity, advice, evidence text and retained rules are unchanged. The browser bundle is regenerated from those sources.

The wrapper also preserves attribution/licence metadata and the three exact r149 retained literature URLs, following the rights lane's recommendation. Arbitrary pages on those hosts remain blocked. The exact CC BY 4.0 licence URL is preserved only for an accepted retained literature source. Existing official-host treatment is unchanged. The coverage explanation now accurately mentions multi-medicine output and the unassessed dose/route/timing scope.

## Failing before

Test-first commit: `542acdd` (`test: reproduce dropped retained multi-medicine combined alert`). Run `node scripts/verify-checker-combined-e2e.cjs` at that commit. The actual storage-owner loader, generated engine and actual renderer execute; the medicine engine assertion passes, then the combined-output assertion fails:

```text
denominator: 1; passed: 0; failed: 1
saved-triple-to-engine-to-combined-to-renderer:
Combined wrapper must forward retained multi-medicine alert
```

## Passing after and denominators

- `synthetic-results.json`: 37/37 named checks pass. Of these, 27 exercise actual saved-state load/owner transitions -> real browser medicine/combined engine -> actual renderer with in-memory storage and DOM sinks. Four are explicitly lower-level `reviewResolved` route seams. Six are isolated source sanitization seams using real evaluations with only source metadata replaced.
- `browser-results.json`: 4/4 named full-page scenarios pass in headless Edge at 390 px with the repository CSP: retained triple, stopped third medicine, zero medicines with stale cache, unknown third medicine. The retained-triple scenario includes reload, actual UI deletion, second reload, exact three trigger rows, source link, red status, no horizontal overflow and no page exceptions. Browser localStorage is real and isolated; API auth is a signed-out fixture and all external network requests are blocked.
- `regression-results.json`: all 11 existing suites exited 0: health alerts (76 checks), alert presentation (12), medication safety, zero-medicine lifecycle, medication-check controller, medication login, health-state contract, device-health storage, medication pipeline, medication evidence, and JS syntax.
- `combined-triple-mobile.png`: inspected full-page browser capture. The multi-medicine notice and all three triggers render. Source attribution remains a known pending integration gap below.

Named cases cover missing identity/data; zero medicines; duplicate ingredients within and across records; unrelated/duplicate candidate attribution; 61-entry overflow; stopped, inactive, deleted, past, future and current-boundary medicines; saved edit/reload; stale controller result; current/old symptoms; negation, historical, conditional and family symptom wording; anonymous/account A/account B/unverified transitions; exact retained source metadata and disallowed URL variants. The JSON reports contain each individual case name. Account boundaries use the actual local owner-switch implementation with synthetic identities; this does not establish production authentication security.

## Remaining gaps and integration gate

1. `health-hub.js` embeds the source renderer and currently displays neither rule attribution nor licence. This lane does not edit that shared file. `node scripts/verify-checker-combined-e2e.cjs --require-visible-attribution` is the parent integration gate: currently 34/38 pass, with three retained-source display failures and one attribution-escaping display failure. `attribution-integration-gap.json` deliberately preserves those failures. The parent must add escaped attribution/licence text to `renderHealthAlerts()` source details and an exact allowlisted CC BY licence link, then rerun this gate. Metadata-only propagation is not a completed attribution UI fix.
2. The frozen catalogue has no exact topical NSAID product for an end-to-end topical negative. Four route seam checks record existing engine behavior: systemic matches; known topical does not; unknown and mixed oral/topical candidate routes match. Two saved-input cases show arbitrary `route: 'topical'`/`'oral'` fields are not assessed. This is a coverage gap, not a clinical approval of either route or a new matching rule.
3. NHS/SPS and other wrapper-specific evidence rights/currentness remain unresolved for the rights/clinical review lanes. Exact retained literature URL preservation does not grant new approval to any excluded rule or source.
4. No real health records/accounts, paid calls, deployed environment, live clinical validation or clinician adjudication were used. No production rollout, merge, service or security setting change is included.

## Reproduce locally

```powershell
node scripts/build-health-alerts.cjs --check
node scripts/verify-checker-combined-e2e.cjs
# After the shared renderer integration:
node scripts/verify-checker-combined-e2e.cjs --require-visible-attribution
# Set PLAYWRIGHT_MODULE to an installed Playwright module if needed.
$env:PLAYWRIGHT_MODULE = 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/verify-checker-combined-browser.cjs
```

The browser script starts and closes its own loopback preview and browser. Optional `CHECKER_EVIDENCE_DIR` writes a synthetic screenshot. There is no persistent preview service.
