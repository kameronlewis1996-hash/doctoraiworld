# DoctorAI homepage review

This homepage makes the existing DoctorAI brand the centrepiece: the canonical head mark floats gently inside an orbit of the four main categories: Today, My Health, Visit Prep and Profile. The animated logo is slightly transparent (84% opacity). Each selection explains a real destination and offers a direct link. The existing full logo remains in the header and footer. A clearly labelled example visit brief connects the introduction to the product's useful next step.

## Scope and baseline

- Branch: `codex/astra-homepage-20261015`.
- Verified main: `aef725b916e7412fb39dea4caedb4a85229aa87d` (checked again before PR preparation).
- Product changes: `index.html`, `welcome.css`, `welcome.js`, plus `hub-category-themes.css` and its stylesheet link in `health-hub.html` for the user's follow-up colour correction.
- Existing logo files, application code, medication checking, authentication, storage, billing, APIs, service worker and deployment configuration are unchanged.
- Work was done in a fresh clone and isolated branch. No other local checkout or M-folder work was edited.
- No generated artwork, video, AI requests or paid services were used.

## Four categories and add-detail action

The four hero entry points have distinct soft surfaces, 2px accent outlines, bolder 2.6px SVG strokes and navy labels. Selecting a topic also applies its surface/accent pair to the detail card and its destination link. The selected state retains an extra outline ring and `aria-pressed`.

| Topic | Surface | Icon / outline | Destination | Icon and link contrast |
| --- | --- | --- | --- | --- |
| Today | `#EAF3FF` | `#0759B6` | `/health-hub#today` | 6.03:1 |
| My Health | `#E8F6F1` | `#176B60` | `/health-hub#health` | 5.71:1 |
| Visit Prep | `#FFF4DE` | `#805418` | `/health-hub#visit-prep` | 6.02:1 |
| Profile | `#F2EDFC` | `#65439B` | `/health-hub#profile` | 6.47:1 |

Navy labels (`#0A2340`) exceed 13:1 contrast on every surface; supporting copy (`#465F73`) exceeds 5.8:1. These values were measured from browser computed styles. [Exact tokens](theme-tokens.md) and the [main-app colour correction with desktop/mobile screenshots](hub-themes.md) cover the requested matching sidebar, mobile navigation and page themes.

The clear plus action, **Add Health Detail**, opens the existing secondary category picker at `/health-hub#add`: Medication, Health profile, Symptom, Appointment, Measurement, and Document or photo. **Scan medication · Pro** sits directly below and links to the existing scanner start page at `/health-hub#scan`. The homepage does not initiate a scan, access a camera or bypass the app's consent/access checks.

## Screenshots

These are **local source previews**, served with the repository's Content Security Policy. They are not production or Vercel Preview screenshots. Final captures use reduced motion for stable framing; animation behaviour was checked separately.

| View | Screenshot |
| --- | --- |
| Desktop, 1440 × 1000 | [Hero](final-desktop-1440x1000.png) · [Full page](final-desktop-full.png) |
| Mobile, 390 × 844 | [First screen](final-mobile-390x844.png) · [Full page](final-mobile-full.png) |
| Mobile interactive tour | [Detail](final-mobile-tour.png) |
| Example visit brief | [Detail](final-visit-brief.png) |

## Verification

- `node scripts/check-js.js`: passed, 68 JavaScript files.
- `scripts/verify-static-site.ps1`: passed, 75 required files and 10 production pages, including CSP hashes and local references.
- `node scripts/verify-record-preparation.cjs`: passed.
- `node scripts/verify-five-tabs.cjs`: passed.
- `git diff --check`: passed.
- Headless Microsoft Edge browser checks: see the exact version, timestamp, assertions and responsive results in [homepage-browser-checks.json](homepage-browser-checks.json).

Browser checks cover all four topic states at 320, 360, 390, 640, 768, 860, 900, 1080, 1280 and 1440 pixels; no horizontal overflow or overlapping topic controls; targets at least 44 pixels high; the exact requested category labels, subtle logo opacity, plus and scanner link placement/navigation; keyboard skip link, focus and selection; touch selection; pointer tilt and reset; pause/resume; offscreen pause; reduced motion; forced colours; no-JavaScript fallback; FAQ expansion; all original homepage links and eleven legacy hash redirects; local route responses; and the public sharing fallback. The share test replaces clipboard access in the isolated browser context, so it does not change the user's clipboard or send a message.

The tour does not read health data, write browser storage or make API requests. No console errors, page errors, failed requests or CSP violations were observed in the passing run. The 200% check uses CSS zoom; the 320px viewport also checks narrow reflow. These checks are not a comprehensive screen-reader or real-device audit.

## Review and release boundaries

All existing navigation destinations, resource links, share behaviour, privacy information and clinical limits remain. The animation has a visible pause control, respects reduced motion, stops offscreen or in a hidden tab, and remains static without JavaScript. The tour never changes health records or implies that label capture verifies medication safety.

Review the draft PR and its exact preview before release. No production merge, deployment, credential change, purchase, live account test or medication workflow change is part of this work. The separate functional audit owns non-homepage fixes.
