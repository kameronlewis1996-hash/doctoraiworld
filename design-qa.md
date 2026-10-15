# Homepage polish review — 15 October 2026

The latest homepage review is [documented with desktop/mobile evidence](docs/design/homepage-polish-20261015/design-qa.md). It builds on production main `01543ec14d82f8334a59d91d4fb4e3fd94f2dfc0`. Product changes are limited to `index.html`, `welcome.css` and `welcome.js`; the integrated Health Hub and medication release are retained.

Homepage final result: passed

The earlier Health Hub review below is retained as historical evidence.

**Findings**

- [P2, fixed] The first mobile storage banner inherited a vertical translation from the former floating consent dialog. The new inline banner now sets `transform: none`; the corrected capture places it below the logo.
- [P2, fixed] The former selected navigation styles made the Today icon white on pale blue. The selected text and SVG now use readable blue in the four-tab navigation.
- [P2, fixed] The mobile brand inherited the old three-column header placement. The new header uses a centred flex row.
- [P2, fixed] The previous Today heading's important font declaration overrode the selected reference layout. The scoped heading rule now controls its mobile size and blue emphasis.
- [P2, fixed in source; tablet visual review pending] Inherited tablet rules hid the sidebar while preserving its margin, displayed duplicate category navigation and left the bottom navigation unfixed at some widths. The reference stylesheet now explicitly shows the desktop sidebar, hides the duplicate category bar, and fixes the phone/tablet bottom bar within its intended breakpoint.
- [P2, resolved] The connected-browser review was completed on the actual integrated app. All four primary destinations, secondary tools, Free visit-brief review, sign-in/Pro gates, failed sign-in presentation, signed-in sync status, copied routes, refresh and back/forward were checked. Source/build checks passed before release.
- [P2, resolved] The reviewed whole-app theme and return paths are now integrated into production source. Profile text wraps within the card; mobile medicine actions stack at full width; account status reflects actual response/session state rather than the earlier prototype's fixed label.

**Source and comparison evidence**

- Source visual truth: `docs/design/reference-layout/source.png`, supplied by the user. It combines a desktop view and phone view; the black image-editing toolbar is screenshot chrome.
- Implementation: `docs/design/reference-layout/mobile-preview.png` and `docs/design/reference-layout/desktop-first-preview.png`.
- Desktop CSS viewport: 1152 x 960; mobile CSS viewport: 390 x 984. Browser screenshots use device pixel ratio 1. The reference's desktop region is approximately 385 x 323 and its phone region approximately 128 x 321, so comparison uses their relative proportions at roughly three times the source scale. The surrounding screenshot frame and toolbar are excluded from fidelity judgment.
- State: empty hub, Free plan, first-visit storage choice visible. Greeting is time-aware, so “Good evening.” in the implementation replaces the reference's “Good morning.”
- Full comparison: user source and revised mobile screenshot were opened together in one comparison call. The corrected composition has the centred logo, pale cyan storage banner, navy/blue Today heading, medicine illustration, stacked actions and four bottom tabs.
- Focused comparison: header placement, consent choices, heading, medicine card and active navigation were inspected in the mobile capture. The first desktop capture showed the desired section hierarchy; it precedes the last text-contrast and heading fixes and is not final desktop proof.

**Required fidelity surfaces**

- Fonts and typography: existing DM Sans preserved; the reference's navy display heading and blue “today.” emphasis are recreated. Storage text keeps the site's larger accessibility minimum.
- Spacing and layout rhythm: desktop sidebar and central main column; phone logo/banner/intro/card stack and four equal navigation columns. The final 390px DOM reading reported no horizontal page overflow.
- Colours and tokens: white/pale blue surfaces, cyan consent banner and vivid blue actions. Clinical warning and severity colours remain unchanged.
- Image quality: existing canonical DoctorAI logos reused. A standalone transparent medicine illustration was generated with built-in imagegen from the supplied reference because no matching source asset existed. It is used at 145px desktop/110px mobile; minor edge pixels are not visible on the card's white background.
- Copy and content: supplied Today heading, medicine heading and action labels retained. Scan coverage limits remain visible. Visit prep retains explicit record selection and review before printing/sharing.

**Primary interactions tested**

- Session-only storage choice dismissed the inline banner.
- Today manual entry opened the existing medication form.
- A fictional entry was saved in the local session-only QA server and appeared in the retained medicine list. No real health data or live provider/billing operation was used.
- The final release review used local empty Free and fictional Pro fixtures on ports 4222/4223, plus a deliberate auth-failure fixture on 4224. No real health data or billing/provider transaction was used. Pro chat-unavailable recovery exposed a Try again action; Free chat required sign-in.
- Canonical feature links, Appointments refresh and browser back/forward preserved the correct section. Tablet widths 750/900 and desktop 1280 were checked with matching DOM sizes; no page overflow or duplicate navigation was present. Final screenshots and JSON evidence are in `.tmp-interface-cleanup-20261011/release-20261012/`.

**Implementation checklist**

- Connected-browser and source/build reviews are complete. Final verification evidence: `.tmp-interface-cleanup-20261011/five-tabs/release-final-checks.json` and `.tmp-interface-cleanup-20261011/release-20261012/`.
- Verify the exact remote Preview/staged production, promote that artifact and audit the public result once. These release actions are tracked separately from this design comparison.

**Historical cloud review checkpoint (2026-10-12)**

- PR60 remains a draft. The checked-out remote head was `f19271b1a93617446ec672df4f1baf45af620009`. At the time of this review, Preview deployment `dpl_HdVsagaLBAyzdVm6fKTWPRHM5x1Z` was `READY` on that exact head; Production deployment `dpl_4TYE7hafiCKCBCFUKsN7SKTe1rhZ` was `READY` on `main` commit `48880d1dd2b615b207985addc6d8fd883c32a8fe`. The local follow-up changes below are not in that Preview.
- Project `doctorai-health-hub` uses Node 24.x, matching `package.json`. It is a static site with Vercel serverless routes. Vercel SSO protection is enabled for all deployments except custom domains. The cloud shell has no linked `.vercel/project.json`, Vercel CLI, or `VERCEL_OIDC_TOKEN`; Chromium could not tunnel to the deployment and the web viewer could not open it. A Vercel share-link helper would create or reuse an authentication bypass, so it was not used under the instruction to preserve authentication permissions. No live cloud screenshot, browser interaction, or console check was completed.
- Vercel environment metadata was checked without decrypting values. Preview has the inputs for authentication and AI; `api/auth/config.js` therefore reports those features configured. Preview account storage uses `DOCTORAI_TEST_KV_REST_API_URL` and `DOCTORAI_TEST_KV_REST_API_TOKEN`, and private document storage uses `DOCTORAI_TEST_BLOB_READ_WRITE_TOKEN`; these test-scoped variables are absent, so the Preview code leaves account/document storage disabled. Generic KV/Blob variables also target Preview, but the code selects the `DOCTORAI_TEST_*` variables unless `VERCEL_ENV=production`. Preview has Stripe test key and price IDs but no `STRIPE_WEBHOOK_SECRET`, so subscriptions remain disabled. The Preview key's Vercel comment says its sandbox expired on 2026-10-11; no payment, purchase or credential operation was attempted. Vercel also marks `BLOB_READ_WRITE_TOKEN` as `readable-secret` across production, Preview and development; its value was not read or changed.
- Local Chromium reviewed this checkout with API responses stubbed to the Preview feature matrix and synthetic session-only data. It checked 1440 x 1000, 900 x 900, 750 x 900 and 390 x 844: no horizontal overflow; the bottom bar is fixed/styled at 750 and 390 and hidden at 900. Primary tabs, Diary, Alerts, Add, Profile/Health Memory (off), the Visit prep select/review/copy/print flow and back/forward navigation passed. The reviewed brief retained its clinical limitation copy; the manual medicine form opened and was canceled without entering data. The session choice stored only its consent preference, not the synthetic health entry. The unauthenticated scanner entry opened Google sign-in and sent no OCR request. This local source check does not replace the blocked live Preview review; signed-in Free-versus-Pro behavior remains unverified.
- Local source-browser captures (not the protected Vercel Preview): [750px before the CSS fix](docs/design/reference-layout/source-browser-before-750x900.png), [desktop 1440x1000](docs/design/reference-layout/source-browser-after-1440x1000.png), [tablet 900x900](docs/design/reference-layout/source-browser-after-900x900.png), [tablet 750x900](docs/design/reference-layout/source-browser-after-750x900.png), [mobile 390x844](docs/design/reference-layout/source-browser-after-390x844.png).
- Targeted checks passed: JavaScript syntax (66 files), four-tab navigation, medication evidence/provider retirement, scan, server core, medication database/safety/pipeline/check controller/login, local medication UI, alert presentation, fictional alert fixtures, generated-alert freshness and Stripe pricing. A frozen dependency install using repository-pinned pnpm 11.19.0 completed with `--ignore-scripts`; the lockfile was unchanged. Microsoft PowerShell 7.6.6 was run from its official Linux release archive in `/tmp` with writable XDG paths, and `verify:static` passed (75 required files, 10 production pages). `git diff --check` passed. No production data, paid API, payment or purchase operation was used. The GitHub Vercel status and medication-provider-retirement workflow passed for the original Preview head; CI for this follow-up commit must be checked after push.


**Follow-up polish**

- The canonical mobile logo remains the existing vertical full mark; the small reference depicts a horizontal lockup. Preserve the verified brand asset pending a supplied canonical horizontal variant.

final result: passed
