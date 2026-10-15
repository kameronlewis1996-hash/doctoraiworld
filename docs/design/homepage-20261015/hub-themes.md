# Matching main-category colours

The main app previously reused blue tab, icon and heading styles for all four categories. The sidebar and mobile tabs now keep the same colour identity as the homepage, including when inactive. The selected tab has a border and inset marker as well as `aria-current="page"`. Page headings, primary controls and key non-clinical cards carry the same category colours.

| Category | Surface | Accent | Desktop | Mobile |
| --- | --- | --- | --- | --- |
| Today | `#EAF3FF` | `#0759B6` | [935px](hub-theme-today-935.png) | [390px](hub-theme-today-390.png) |
| My Health | `#E8F6F1` | `#176B60` | [935px](hub-theme-health-935.png) | [390px](hub-theme-health-390.png) |
| Visit Prep | `#FFF4DE` | `#805418` | [935px](hub-theme-visit-prep-935.png) | [390px](hub-theme-visit-prep-390.png) |
| Profile | `#F2EDFC` | `#65439B` | [935px](hub-theme-profile-935.png) | [390px](hub-theme-profile-390.png) |

## Implementation and integration

`hub-category-themes.css` loads after the existing layout via one added link in `health-hub.html`. It uses the app's existing view attributes, with no JavaScript or route changes. It targets the four main pages and main navigation. The Visit Prep shortcut in Today/My Health uses its destination's amber identity. Clinical alert severities and nested record-state styles are not recoloured.

This extends PR70's visual scope at the user's explicit request. PR71's functional changes, nested feature styles, shared stylesheets and service worker are not edited. The additional HTML stylesheet link is separate from PR71's changed HTML lines. Integration PR72 will need this newer PR70 revision; its earlier preview does not include this correction.

## Verification

- [Browser evidence](hub-theme-browser-checks.json): all four selected states at 320, 390, 768, 935 and 1440px. Computed icon, tab and heading colours match the homepage values; no horizontal overflow; every main tab is at least 44px tall.
- Keyboard activation and visible focus, current-page semantics and forced-colour selected border passed. Screenshots include the heading focus outline because navigation was exercised using the keyboard.
- Existing six-choice Add Detail picker and symptom dialog open; Scan remains a start screen without camera activation. Alerts view colours are unchanged when this stylesheet is toggled.
- Existing JavaScript syntax, static-site verification, four-tab/secondary-route checks, alert-presentation checks and `git diff --check` passed.
- Microsoft Edge rendered local source with the production CSP. Requests for session/config/entitlement were fulfilled by unauthenticated test fixtures; no real health records, authentication, scanning or purchases were used. No page errors occurred. Hosted visuals, live account behaviour and real-device testing are not claimed.
