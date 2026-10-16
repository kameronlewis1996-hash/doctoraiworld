# Today record-first release — 16 October 2026

Today now shows the person's current medicines directly, with a prominent **Medication & Prescriptions** heading, adjacent labelled Add action, Edit actions, Scan medication (Pro), and **View all / manage medicines**. The list displays up to five active records without truncating medicine identity, and explicitly reports when more records exist. Dose and timing are labelled as saved details; no instructions are inferred.

Conditions, allergies/reactions, the next appointment and the latest diary note follow in compact record cards with adjacent Add actions. Historical conditions stay in Manage conditions & history. Allergy certainty and recorded reactions remain visible. Measurements and documents retain direct discovery links. The existing three primary destinations and My Health nesting are preserved.

Loading and account failures are distinct from empty records. Empty allergy records do not claim “no allergies.” Unknown account record counts are not shown as zero. A neutral “No current medicines” alert is hidden while records are unavailable; independent orange/red health alerts remain available. Routine sync status refreshes preserve focus in unchanged record content.

## Authorised integration scope

The branch starts at production main `a130fc99a9866e6e779178675a09ab192642d619` (PR77). It selects the presentation/navigation fixes from `0eaa838`, `282444c`, `35f879f` and `e56309e`, with cache conflicts resolved locally. It does **not** merge the prior stack wholesale.

- No changes to medication data, catalogues, API/authentication handlers, payment services or `vercel.json`.
- Medication rules remain production ruleset **2026.10.15-r149**. The browser bundle was regenerated from these unchanged production data files.
- The only shared engine edits are the authorised active-record lifecycle fixes: use one active-medicine filter and suppress medicine coverage warnings for zero active medicines while keeping coverage unconfirmed and independent symptom alerts intact. No clinical interaction rule is added or altered.
- Pharmacy identity/data commits `61563e9` / `fbfc20b` and the companion/Family Care prototype `8a3bbb9` are excluded. No real sharing is exposed.

## Visual and accessibility review

The review covered empty and fictional populated states at 320, 390 and 1440px, long medicine names, keyboard entry and focus, 44px primary touch targets, account loading/failure, and 200% CSS zoom. Review fixes include the Pro badge contrast, compact neutral alert summary, avoiding a false empty statement while loading, and allowing the grid to collapse based on available content width at zoom.

- Before, production: [desktop](before-production-1440.png), [mobile](before-production-390.png)
- After, empty: [desktop](after-empty-1440.png), [390px](after-empty-390.png), [320px](after-empty-320.png)
- After, fictional records: [desktop](after-populated-1440.png), [390px](after-populated-390.png), [320px](after-populated-320.png)
- [200% zoom](after-zoom-200.png), [loading](after-loading-390.png), [account unavailable](after-account-unavailable-390.png)
- [Journey and accessibility results](today-records-qa.json)

All populated screenshots use fictional test records in fresh browser contexts. They are not example records added to the product or real account data.

## Verification

- Today: 11 journey groups and seven axe WCAG 2/2.1 A/AA states, including Add/save/Edit/remove, targeted condition/allergy form focus, Scan's sign-in gate, nested Manage navigation, account A/B/anonymous isolation, failed sync and retry.
- Navigation: 60 route/viewport cases, keyboard reachability, mobile menu, Back/Forward, interrupted dialogs and heading focus.
- Zero-active-medicine: 21 browser cases plus lifecycle/controller fixtures; stopped/ended medicines are excluded and independent urgent symptoms retain red alerts.
- Alerts: 76 fictional engine fixtures, 15 status checks and 12 renderer checks.
- Medication database, safety, evidence, scan/review pipeline, login/controller isolation and local UI checks pass against r149.
- Device privacy, account-state contract, record preparation, catalogue provenance, Today diary, server core, JavaScript syntax and static-site checks pass.

The scanner's existing sign-in/Pro/consent path is retained. The review does not use a paid extraction request, a real patient's account or a real camera upload. Preview and production release verification are recorded separately against their exact deployment SHAs.
