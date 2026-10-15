# Shared DoctorAI blue theme mapping

The homepage and Health Hub use DoctorAI blue for the four main categories. This updates the earlier multicolour treatment on PR75's draft preview.

| Topic | Soft surface | Accent / bold outline | Homepage token prefix | Destination |
| --- | --- | --- | --- | --- |
| Today | `#EAF3FF` | `#0759B6` | `--home-today-` | `/health-hub#today` |
| My Health | `#EAF3FF` | `#0759B6` | `--home-health-` | `/health-hub#health` |
| Visit Prep | `#EAF3FF` | `#0759B6` | `--home-visit-` | `/health-hub#visit-prep` |
| Profile | `#EAF3FF` | `#0759B6` | `--home-profile-` | `/health-hub#profile` |

Each prefix has `surface` and `accent` tokens. Labels use navy `#0A2340`; supporting copy uses `#465F73`. Homepage badges use a 2px accent border and 2.6 SVG stroke width. The selected topic detail card adopts the same surface/accent pair, including its link. Selected state also has an extra outline ring and `aria-pressed`, so it is not indicated by colour alone. Existing reduced-motion, forced-colour, links and pause controls remain.

The Health Hub uses `--hub-` tokens with `#F2F7FF` navigation surfaces and `#F7FAFF` nested tool surfaces. See [the app palette](hub-themes.md). Clinical warning and severity colours remain separate. Screenshots linked from the earlier design notes predate this blue update.

The logo is 84% opaque. The primary `+ Add Health Detail` action opens `/health-hub#add` and its existing six-choice picker: Medication, Health profile, Symptom, Appointment, Measurement, Document or photo. The separate `Scan medication` link with a Pro badge sits beneath it and opens `/health-hub#scan`; existing scanner consent and access checks remain in the app.
