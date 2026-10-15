# Shared four-category theme mapping

Homepage and main-category visual identity: PR70, branch `codex/astra-homepage-20261015`. Functional and nested-feature work remains owned by Luna. The user requested the four main categories below. This mapping replaces the earlier Medicines / Symptom notes / Appointments tour mapping.

| Topic | Soft surface | Accent / bold outline | Homepage token prefix | Destination |
| --- | --- | --- | --- | --- |
| Today | `#EAF3FF` | `#0759B6` | `--home-today-` | `/health-hub#today` |
| My Health | `#E8F6F1` | `#176B60` | `--home-health-` | `/health-hub#health` |
| Visit Prep | `#FFF4DE` | `#805418` | `--home-visit-` | `/health-hub#visit-prep` |
| Profile | `#F2EDFC` | `#65439B` | `--home-profile-` | `/health-hub#profile` |

Each prefix has `surface` and `accent` tokens. Labels use navy `#0A2340`; supporting copy uses `#465F73`. Homepage badges use a 2px accent border and 2.6 SVG stroke width. The selected topic detail card adopts the same surface/accent pair, including its link. Selected state also has an extra outline ring and `aria-pressed`, so it is not indicated by colour alone. Existing reduced-motion, forced-colour, links and pause controls remain.

The main-app follow-up adds `hub-category-themes.css`, using equivalent `--hub-` tokens, and one stylesheet link in `health-hub.html`. See [main-app theme evidence](hub-themes.md). Existing shared stylesheets, application JavaScript and clinical warning/severity colours remain unchanged.

The logo is 84% opaque. The primary `+ Add Health Detail` action opens `/health-hub#add` and its existing six-choice picker: Medication, Health profile, Symptom, Appointment, Measurement, Document or photo. The separate `Scan medication` link with a Pro badge sits beneath it and opens `/health-hub#scan`; existing scanner consent and access checks remain in the app.
