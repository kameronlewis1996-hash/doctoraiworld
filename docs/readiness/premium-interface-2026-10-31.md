# DoctorAI interface refinement — 31 October 2026

Draft for review. The goal is a calmer, more consistent interface based on My Health. The 9/10 description is an aspiration, not a measured score. No production release is implied.

## Diagnosis and design decisions

The local baseline showed a large decorative mark competing with the homepage message, saturated background layers, and different card and control treatments across page families. On the smallest phone layout, the homepage and About navigation occupied two rows. The Hub's six large tiles also pushed the next useful content down the screen.

The refinement simplifies the existing shared blue/cyan atmosphere, uses a lighter shared surface and quieter border, standardises control radius and shadow tokens, and keeps clinical warning and emergency colours outside those cosmetic selectors. The homepage mark and heading are more restrained on mobile and desktop; its value and actions remain visible. My Health tiles are more compact while remaining well above 44px. Home and About navigation fit on one row at 320px. Existing logos, routes, consent, pricing, records and warning wording are retained.

## Before and after

All captures use local Chromium, blocked external requests and fallback system fonts. Medication details are fictional. The dialog's existing content and warning wording are preserved; its pair shows how it sits within the revised system rather than a new form design.

| View | Before | After |
| --- | --- | --- |
| Home, 390px | [Before](premium-evidence/home-before-390.png) | [After](premium-evidence/home-after-390.png) |
| My Health, 390px | [Before](premium-evidence/my-health-before-390.png) | [After](premium-evidence/my-health-after-390.png) |
| Fictional long medicine, 390px | [Before](premium-evidence/medication-before-390.png) | [After](premium-evidence/medication-after-390.png) |
| Medicine dialog, 390px | [Before](premium-evidence/dialog-before-390.png) | [After](premium-evidence/dialog-after-390.png) |
| Home, 1440px | [Before](premium-evidence/home-before-1440.png) | [After](premium-evidence/home-after-1440.png) |

For direct retrieval, [home and My Health bundle](premium-evidence/premium-home-health.zip) contains the first two pairs; [medication and dialog bundle](premium-evidence/premium-medication-dialog.zip) contains the next two. Desktop PNGs are linked individually above.

## Coverage and remaining review

The affected-page screenshot sweep sampled home, About, subscription, Privacy and Hub health, medications, documents and profile at 320, 375, 390, 412, 768 and 1440 CSS pixels. Local simulated states included a long medicine name, the medication form, profile drawer, privacy/sign-in dialogs and subscription review at phone, short-landscape and reflow-sized viewports. Existing whole-site and medical safety regressions cover more routes and states; they are not equivalent to visual inspection of every populated screen.

| Coverage | Evidence | Limit |
| --- | --- | --- |
| Public pages and Hub families | 48 targeted screenshots across eight routes and six widths | Representative screenshots, not every populated state |
| Whole-site shell and status states | Local browser regression across 25 route/state scenarios at three widths, including neutral unmatched, review and high-severity fictional alerts | Automated synthetic fixtures; not a live clinical assessment |
| Long labels and overlays | Fictional medication and dialog screenshots, including a short landscape viewport | Physical keyboard and device safe areas remain unverified |
| Focus and fixed navigation | Local keyboard and clearance regressions | Does not substitute for a screen reader or physical phone |

The declared DM Sans and Newsreader fonts could not be loaded in this executor because the Google Fonts request was blocked by network policy. Screenshot proportions are therefore fallback-font evidence, not verification of those fonts. Independent protected-preview review, actual 200% browser zoom, physical phone/safe-area testing, authenticated uploads and real payment fulfilment remain open. Clinical, privacy, security, advertising and legal reviews remain separate gates.
