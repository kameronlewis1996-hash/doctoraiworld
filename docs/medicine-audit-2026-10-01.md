# Medicine audit — 1 October 2026

Review base: `993f593642db8657a3d27cb834d323e534df871c`, `kameronlewis1996-hash/doctoraiworld`. This is an engineering audit with synthetic fixtures, not clinical sign-off. No production changes, deployment, provider purchase, or outreach were made.

## Findings and scoped repairs

- The local checker UI requires sign-in and Pro, but `/api/medication/safety` accepted anonymous requests. The endpoint now uses the existing durable identity, storage, entitlement, and account rate-limit checks (8 requests/minute), retaining no-store responses and complete-list validation. Tests cover 401, 503, 403, 429 and a successful synthetic Pro request. This adds the existing account-storage dependency to the local checker; storage or entitlement failure must not return a successful check.
- Concurrent calls to the local-check function could send duplicate requests. An in-flight button guard now prevents a second call; a concurrent-submission test verifies one request. Network failure releases the guard and resets consent.
- Two unescaped apostrophes prevented `public-mcp/api/mcp.js` from parsing (original lines 82 and 146). Only string delimiters changed. Public directory submission and endpoint configuration were not touched.
- The static verifier could not inspect hidden `.env.example` under Linux PowerShell. `Get-Item -Force` fixes that portability defect. An independent, pre-existing assertion still rejects the medicine-name search form in `medication-list-template.html`; that page was left unchanged.
- Existing limited-coverage and no-alert-does-not-mean-safe language is retained and exercised in the UI regression test.

## Existing work and scope

[Draft PR #7](https://github.com/kameronlewis1996-hash/doctoraiworld/pull/7), head `c151ae111c15a134c2192c191a5b0ccaf1465d06`, was inspected, not merged. It targets an older 24-ingredient/four-rule engine. Current main already includes strict request validation, incomplete/ambiguous combination handling, catalogue attribution and better limited-coverage messaging. PR #7 also contains severity/source presentation and matching changes that require selective review against today's catalogue; they were not copied wholesale. No other open medicine-checker PR appeared in the repository's open-PR list. That does not establish whether other private background tasks exist.

No `PROJECT_RULES.md`, applicable `AGENTS.md`, or repository `.agents/skills` were found. Workspace `.agents` and `.codex` directories were empty. README and the DoctorAI credit-saver skill were reviewed. A timestamped pre-edit checkpoint is in `/tmp/doctorai-audit/checkpoint-20261001.txt`.

## Coverage measured from the checked-out data

| Measure | Count |
| --- | ---: |
| Product/formulation records | 3,419 |
| Distinct brands | 1,444 |
| Chemical/generic headings | 1,224 |
| Combined ingredient terminology entries | 1,136 |
| Complete imported ingredient mappings | 3,288 |
| Incomplete imported mappings | 131 |
| Ingredients with any recorded class | 74 |
| Curated interaction rules | 13 |
| Allergy class rules | 2 |
| Medicine-condition rules | 0 |

The catalogue declares October 2026 Pharmac community and hospital sources and stores their SHA-256 checksums. Fresh download/checksum verification was attempted but blocked by the execution proxy (`Tunnel connection failed: 403 Forbidden`). Therefore source currency and checksum equality were not independently confirmed in this audit.

Pharmac's [source notes](https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html) confirm CC BY 4.0 attribution requirements and source limitations. NZULM's [data-access page](https://info.nzulm.org.nz/data-access) describes separate monthly raw-data access. The imported Pharmac catalogue is not a full NZULM/Medsafe/OTC catalogue, and a complete ingredient mapping does not establish complete interaction knowledge. Salt/class mappings and the 13 rules still need professional review; no clinical rule or source was upgraded to “validated” by this audit.

The local engine deliberately returns `completeForRequest: false`, including when every name resolves. Dose, route, timing, pregnancy, broad allergy cross-sensitivity, conditions and unlisted interactions remain outside comprehensive coverage. NZF and DrugBank integrations retain their access/licence gates; runtime readiness and production provider configuration were not verified.

## Verification

Passed locally with Node 24.19.0 and pnpm 11.19.0:

- `pnpm run check:js`: 58 JavaScript files parse after the two repairs.
- `node scripts/verify-medication-database.cjs`: catalogue integrity, 3,288 mapped product/formulations, curated rules, combinations, ambiguous names, aliases, duplicate ingredients, unknown coverage, endpoint input boundaries, and new server access/rate-limit checks.
- `node scripts/verify-local-medication-ui.cjs`: synthetic VM UI→handler flow, sign-in/Pro/consent gates, minimal payload, concurrent request suppression, network recovery, and no-alert uncertainty text. This uses mocked identity/entitlement and is not browser E2E.
- `node scripts/verify-medication-safety.js`: mocked provider use/NZ-scope gates, completeness, exact-product duplicates, interactions, allergies, conditions, symptoms and outages.
- `node scripts/verify-medication-scan.js`: mocked OCR provider, consent, image bounds, structured output and incomplete-response recovery.
- `node scripts/verify-nzf-fhir.js`: mocked provider/configuration gates, identifier/checksum handling, exact matches and partial results.
- `node scripts/verify-server-core.js`: durable-limit and health-state regression checks.
- `node --test public-mcp/test/mcp.test.cjs`: 8 passed.
- `git diff --check`.

Failed: static verification, after enabling Linux-compatible PowerShell paths, reports “The printable medication-list resource must remain static and must not collect health information.” The assertion currently rejects the existing search form. This remains a release-check blocker; it is not evidence that the form transmits personal data.

Not run: authenticated browser scan→confirm→add→check→warning, phone camera/upload, durable save/reload, cross-device account state, real OCR/provider calls, deployment build and production tests. There is no general build or typecheck script in package.json. The Vercel preparation helper expects prebuilt output and Windows command names; no deployment/build was attempted.

## Efficiency and access needed

OCR uses the server-selected `OPENAI_VISION_MODEL`/`OPENAI_MODEL`, falling back to `gpt-5-mini`, a 1,600-output-token cap, one provider request without automatic retries, and a 45-second upstream timeout. The browser has an existing scan in-flight guard and a 50-second timeout. This audit did not change model/provider selection. It made zero real model/provider calls. No task usage meter is available, so compliance with a percentage-of-available-usage ceiling cannot be measured or claimed. The chat runtime does not expose a verifiable applied model/thinking/speed setting.

To finish authenticated validation, provide an authorized synthetic Pro test account/session through the supported sign-in flow, an approved reachable test/preview URL, and working test account storage. Do not paste passwords, tokens or patient data into chat. OCR needs the test environment's server-side OpenAI configuration and permission for a bounded synthetic scan. Live NZF/DrugBank tests additionally need their existing authorized credentials and applicable consumer/display/NZ-scope approvals configured server-side. These keys/approval flags are absent from this shell; absence here does not prove absence in production. No provider gates should be bypassed to obtain a passing test.

## Questions for pharmacist review

1. Which NZ prescription, OTC and combination-product gaps make the current catalogue unsuitable for the proposed beta audience?
2. Are the explicit ingredient/salt equivalences and class memberships appropriate, and which ambiguous names must remain unmatched?
3. For each of the 13 interaction and two allergy-class rules, do the source, scope, severity and wording accurately support the displayed warning?
4. Does the distinction between label extraction, identity confirmation and a limited check remain clear, especially with incomplete ingredients or no returned warning?
5. What review, escalation wording and incident process are needed before exposing this limited checker to beta users?

These are proposed review questions, not a claim that a pharmacist has reviewed or approved the software. No outreach was sent.

## Proposed ten-person beta checklist — for user review

Use synthetic medicine lists and clearly marked fictional labels. Suggested device mix: four iPhone Safari, four Android Chrome, two desktop users, including a keyboard/screen-reader participant. All ten first run the same consent→scan/upload→review every field→confirm→save→deliberate check→read warnings journey. Record device/browser, task outcome, redacted errors and usability notes, never identifiable health data.

| Participant focus | Required observation |
| --- | --- |
| 1. Clear fictional label | Extracted text needs confirmation; no invented fields or automatic check |
| 2. Blurry/cropped label | Unclear fields remain empty; usable manual recovery |
| 3. Combination product | Every ingredient is reviewed; incomplete mapping stays incomplete |
| 4. Unknown/ambiguous product | No convenient single-ingredient substitution or safety claim |
| 5. Seeded interaction fixture | Expected sourced warning and limited-coverage notice both visible |
| 6. Duplicate ingredient fixture | Duplicate warning understandable across different brand names |
| 7. No-rule fixture | User understands “no warning” does not establish safety |
| 8. Expired/free account | Server rejects scan/check appropriately; saved list remains intact |
| 9. Slow/offline/double click | One request, recoverable failure, no stale successful result |
| 10. Reload/accessibility/device switch | Test entries persist as intended; controls/warnings usable with keyboard/screen reader |

Before inviting participants, resolve the static-verifier blocker and complete an authorized authenticated rehearsal. Stop a test on incorrect ingredient substitution, lost saved data, leaked synthetic records between accounts, or wording interpreted as clinical clearance. Beta feedback measures usability and defects; ten users cannot establish clinical safety. Invitations and rollout remain unperformed.
