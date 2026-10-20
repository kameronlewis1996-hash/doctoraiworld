# Welcome-page visual consistency — 20 October 2026

Implementation and verification performed with Astra. Baseline: current main `5881b2019d847749ec97a04285543554bf8999a2`. Worktree: `/workspace/doctoraiworld-style`; branch: `style/welcome-consistency-20261020`. Main was fetched again before packaging and remained at that baseline. The concurrent database work is not included.

## Canonical design and live inspection

The welcome page is `/`, served from `index.html`. A read-only Vercel fetch returned HTTP 200 for the live page, `welcome.css?v=11` and `aurora-theme.css?v=10`. After trimming boundary whitespace, all three matched current main exactly. SHA-256 hashes of those normalized contents:

| File | SHA-256 |
| --- | --- |
| index.html | `182824b4958172ed22705172900464fd2d900ca131362ef49544c56a9caf29d9` |
| welcome.css | `30abe5076392fcb7180ca4a49f47a2e5c100e1340d09bfa820d39a8420f98374` |
| aurora-theme.css | `5cf83161df144e3fc7dea5275f4bbab0f18d69f4bd7f400517ced616290cc332` |

The canonical language uses DM Sans, navy `#061639`, blue `#0664ed` actions with `#0759b6` hover, white cards, pale blue boundaries, and the existing cyan/lilac layered background. The welcome's editorial serif emphasis is retained where already used. Its layout is unchanged.

Direct browser-origin access and Google Fonts requests were unavailable through the environment proxy. These screenshots are **local source renders under the repository CSP**, not live-site browser captures. They use the existing system-font fallback. The live source comparison establishes design identity; it does not establish hosted visual acceptance.

## Changes and route inventory

`welcome-system.css` is linked last on every HTML page. It extends the exact welcome background to public/system pages, unifies known primary actions and card/control geometry, and restores the Hub background covered by a later legacy rule. The gradient variable resolves on each body so existing orange/red alert variables continue to work. Candidate-review orange borders, severity controls, disabled controls, hidden panels, warning notices and print styles remain separate. Staff grant/stats cards receive a readable light surface and corrected text contrast.

| HTML route | Retained purpose |
| --- | --- |
| `/` | Welcome and entry links |
| `/about` | Founder/story and service scope |
| `/health-hub` | Personal health workspace |
| `/appointment-checklist` | Editable, printable visit checklist |
| `/medication-list-template` | Editable, printable medication list |
| `/research` | Research highlights, search and discussion views |
| `/subscription` | Plans, availability and checkout entry |
| `/download` | Install/open app guidance |
| `/terms` | Terms reading layout |
| `/privacy` | Privacy reading layout |
| `/staff` | Protected staff tools, review, testing and ideas |
| `/mobile-auth` | Mobile authentication handoff |
| `/professional-brief-demo` | Clearly fictional static brief |

Hub captures cover Today, My Health, Medication & Prescriptions, Diary, Appointments, Visit Prep, Profile, Alerts, Add, Documents, Results, Timeline and Ask. The existing navigation suite also exercises legacy hash aliases; its preexisting failure is noted below.

Only stylesheet links change in HTML. The PWA shell moves from v176 to v177 and precaches the shared stylesheet; matching static/evidence/PWA test references are updated. No medical text, clinical rules, API code, dataset, authentication logic, data handling, billing logic, CSP, Vercel configuration or route behavior is changed.

## Visual evidence

Final result: **75 route/viewport combinations passed at 1440 × 960, 390 × 844 and 320 × 844; 72 screenshots, zero page-script errors, no horizontal overflow.** The welcome desktop capture is pixel-identical to the untouched baseline capture.

- [Desktop route overview](desktop-overview.jpg) · [Phone route overview](phone-overview.jpg)
- [Welcome reference](welcome-1440.jpg) · [Today workspace](health-hub-today-1440.jpg) · [My Health on phone](health-hub-health-390.jpg)
- [Staff ideas form on phone](staff-ideas-390.jpg) · [Fictional staff review packet](staff-review-fixture-1440.jpg)
- [Red alert state on phone](hub-red-390.jpg) · [Appointment checklist on phone](appointment-checklist-390.jpg) · [Research loading state](research-loading-390.jpg)
- [Full browser result and capture inventory](browser-report.json)

The contact sheets show the first viewport/top section of each route for comparison; linked individual captures retain full page content. Selected JPEGs keep the commit small; all 72 original PNGs and logs are in `/workspace/doctoraiworld-style-evidence-20261020.zip`. Screenshots containing health or staff records use explicitly fictional local fixtures only.

## Verification

| Check | Result |
| --- | --- |
| Node 24.19.0 + pinned pnpm 11.19.0 frozen install, scripts disabled | Passed; lockfile unchanged |
| JavaScript syntax | 102 files passed |
| Focused source/contract suites | 29 of 30 passed; baseline alert-status assertion below |
| PowerShell static site verification | 114 required files, all 13 production HTML pages passed; CSP hashes and references valid |
| Comprehensive welcome route/state harness | Passed: 75 route/viewport combinations, all state groups, 72 captures, zero page errors |
| Final CTA cascade follow-up | After the full run, Subscription and Download received a narrow primary-button specificity correction; both routes passed computed-colour, no-gradient and overflow checks at 1440/390/320, and their desktop/phone screenshots were refreshed |
| Today records browser | 11 journey groups passed, including fictional add/edit/remove and targeted forms at 1440/390/320 |
| Keyboard accessibility browser | 103 assertions passed |
| Zero-medication browser | 21 cases passed |
| Compact medication browser | 442 assertions, 45 screenshots passed on final rerun and baseline; first run intermittently failed its fictional-record setup assertion |
| PWA browser journey | Passed install/offline/update rehearsal with local unavailable API fixtures |
| axe WCAG A/AA scans | 38 route/viewport states; 36 clear, two retain the same preexisting Ideas empty-list issue; staff heading/stats contrast now clear |
| Public MCP suite (extra check) | 7 passed, 1 unchanged baseline version assertion failed |
| `git diff --check` | Passed |
| Independent Astra review | No actionable regression findings; read-only source/diff and sampled screenshots |

The focused suites include server, private health state/device storage, medication scan/safety/database/pipeline/provenance/evidence/controller/login, local medication UI, open catalogues, alert presentation, navigation contracts, record preparation, staff access/review/ideas and Stripe pricing. [Detailed source results](source-checks.json) and [axe results](accessibility.json) are included.

Known preexisting failures were reproduced against untouched main:

- `verify-alert-status.cjs`: expected “Some details need review”, received “Review needed”. Alert/medical wording remains unchanged.
- `verify-navigation-browser.cjs`: “Leaving the menu by keyboard closes it” expects `aria-expanded=false`, receives `true`. Its preceding route and navigation checks ran, but the entire suite is not claimed as passing.
- Public MCP test expects server version `1.3.0`, actual is `1.3.1` (7 tests pass).
- axe reports an invalid direct child role in the empty `#staff-idea-list` on both viewport widths. Staff idea logic/markup is unchanged; this is not a claim of full WCAG compliance.

There are no root build, lint or type-check scripts/configurations for this vanilla HTML/CSS/JavaScript site. `prepare:vercel` is a **post-build function dependency packaging helper**, not a site compiler. It was invoked with PowerShell and cannot run here because it looks for Windows `npm.cmd`/`pnpm.cmd`; its prerequisite `.vercel/output/functions` artifacts are also absent. No Vercel configuration, secret pull, build-service call or deployment was used to work around that environment limitation. Static validation and browser rendering are the completed application checks.

Reproduce the new local browser verification with Playwright available:

```sh
CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/verify-welcome-system-browser.cjs
```

The verifier serves the actual local files with repository CSP, blocks external network requests, and exercises denied staff access plus clearly fictional allowed staff/research/health fixtures in fresh browser contexts. It checks responsive overflow, research loading/empty/error, staff forms/tabs/error rendering, actual engine-driven orange/red backgrounds, and checklist/reset/print behavior. The axe library was injected into a separate local QA browser with CSP bypass for the scanner only; product CSP was not changed.


## Release state and remaining gaps

No branch push, remote draft PR, preview deployment, production deployment or merge was performed. The feature-branch Git integration automatically creates Vercel previews. Because deployment was explicitly prohibited, pushing and creating the draft PR are **pending further authorization**; this is a known automatic side effect, not an uncertain push outcome or an automatic approval denial. [The exact draft PR text](PR.md) is prepared locally. Deployment configuration was left unchanged.

Real sign-in, protected hosted staff data, live Google OAuth, paid scans, payments, external research responses, cross-device persistence, real devices, screen-reader acceptance and live-browser pixel rendering were not tested. Fictional staff responses are local browser fixtures, not bypasses or changes to production access. No production health data or review records were read or written.
