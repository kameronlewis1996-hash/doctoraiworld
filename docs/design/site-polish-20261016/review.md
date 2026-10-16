# Site-wide Aurora polish — 16 October 2026

This small follow-up is stacked on the companion preview (PR #81). It keeps the blue Aurora design as the default and leaves the existing orange/red Health Hub alert states, medical rules, and data untouched.

| Surface | Review result |
| --- | --- |
| Home | Aurora mark, primary action, Pro scan link and Health Hub dock remain consistent at desktop and mobile sizes. At 320px the third dock destination now occupies its own row so its label stays whole. |
| Health Hub | Today, My Health, Medicines, Diary, Appointments, Visit prep, Alerts, Profile, Add, Documents, Measurements, History and Ask retain their category treatments at 1440, 390 and 320px. The Emergency information card in My Health now has its intended dark background and readable white text. Synthetic orange and red alert states remain visually distinct. |
| Public pages | About, Research, Subscription, Privacy, Terms, Download, Appointment Checklist, Medication List Template, Visit Brief demo, My Next Steps demo and Staff pages loaded without horizontal overflow or broken imagery at reviewed widths. Research tabs now fit and remain usable at 320px. |
| Resource links | The visible “Save to Pinterest” wording now appears in the accessible name on both free guide pages. |

The two printable guides and legal pages intentionally use more compact layouts than the marketing hero. At 320px some small header labels and the Pro comparison navigation remain dense, but no navigation or content is clipped; those larger refinements are outside this bounded polish.

## Visual evidence

- [Home, 320px](home-320.png) and [Research, 320px](research-320.png)
- [Emergency information, 390px](emergency-card-390.png) and [1440px](emergency-card-1440.png)
- [My Health, 390px](health-390.png) and [1440px](health-1440.png)
- [Browser measurements and interaction checks](visual-check.json)
- Earlier [companion page screenshots](../companion-20261016/review.md) and [alert-state screenshots](../aurora-severity-20261016/)

## Verification

- Public pages: 12 routes at 1440 and 390px, plus a 320px pass. Each returned HTTP 200 with no page errors or horizontal overflow; axe WCAG 2/2.1 A/AA found no violations after the link-label fix.
- Health Hub: 60 route/viewport navigation cases across 1440, 390 and 320px passed, including Back/Forward, dialogs, keyboard reachability and mobile menu behavior.
- Companion browser: 22 checks and 9 axe states passed.
- Health alerts: 78 synthetic engine checks, 12 renderer checks and zero-medicine lifecycle checks passed.
- Static site (107 required files, 14 HTML pages), JavaScript syntax (91 files), medication evidence and About route checks passed.

The previews are for review. This change does not request a production deployment.
