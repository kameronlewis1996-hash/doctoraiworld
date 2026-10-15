# DoctorAI blue category palette

The homepage, desktop sidebar, mobile navigation and health tools use one DoctorAI blue accent. The selected tab keeps a border and inset marker as well as `aria-current="page"`. Page headings and utility cards use white or pale blue surfaces with quiet borders. Clinical alert colours remain red, orange and green.

| Surface | Background | Accent |
| --- | --- | --- |
| Homepage category cards | `#EAF3FF` | `#0759B6` |
| App main navigation and summaries | `#F2F7FF` | `#0759B6` |
| Nested health tools | `#F7FAFF` | `#0759B6` |

Current local renders: [homepage desktop, 1440px](blue-home-desktop-1440.png), [homepage mobile, 390px](blue-home-mobile-390.png), [Today desktop, 1440px](blue-hub-today-desktop-1440.png), [My Health mobile, 390px](blue-hub-health-mobile-390.png), [Medicines mobile, 390px](blue-hub-medications-mobile-390.png). The earlier [multicolour screenshots](hub-theme-health-935.png) remain in this folder as a record of the prior design.

## Implementation and integration

`hub-category-themes.css` loads after the existing layout. It uses the app's existing view attributes, with no JavaScript or route changes. It styles the four main pages, secondary headings, navigation, shortcut cards and decorative choice tiles. Clinical alert severity cards retain their own rules and colours.

This update is on PR75's draft preview. The production site is not changed by this branch.

## Verification

The route, contrast, cache and alert checks pass for this update. An isolated local Chrome session rendered the homepage and app at 320, 390, 935 and 1440px. On the 320px and 390px captures, `document.documentElement.scrollWidth` equalled the viewport width; all four mobile tabs stayed visible. Today, My Health, Medicines, Visit Prep and Profile showed the selected blue navigation and white or pale blue headings. The empty Today cards no longer stretch to the height of the diary form. These are local source previews with no real health records, account, scan or purchase; hosted and real-device visual review remains separate. The earlier [browser report](hub-theme-browser-checks.json) documents the prior palette only.
