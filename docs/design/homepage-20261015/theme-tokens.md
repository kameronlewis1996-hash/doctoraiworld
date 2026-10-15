# Shared four-topic theme mapping

Homepage owner: PR70, branch `codex/astra-homepage-20261015`. Destination pages remain owned by Luna. These tokens are ready for the corresponding page themes.

| Topic | Soft surface | Accent / bold outline | Homepage token prefix | Destination |
| --- | --- | --- | --- | --- |
| Medicines | `#EAF3FF` | `#0759B6` | `--home-medicines-` | `/health-hub#medications` |
| Symptom notes | `#E8F6F1` | `#176B60` | `--home-symptoms-` | `/health-hub#symptoms` |
| Appointments | `#F2EDFC` | `#65439B` | `--home-appointments-` | `/health-hub#appointments` |
| Visit prep | `#FFF4DE` | `#805418` | `--home-visit-` | `/health-hub#visit-prep` |

Each prefix has `surface` and `accent` tokens. Labels use navy `#0A2340`; supporting copy uses `#465F73`. Homepage badges use a 2px accent border and 2.6 SVG stroke width. The selected topic detail card adopts the same surface/accent pair, including its link. Selected state also has an extra outline ring and `aria-pressed`, so it is not indicated by colour alone. Existing reduced-motion, forced-colour, links and pause controls remain.

The homepage revision changes only `index.html`, `welcome.css`, `welcome.js` and homepage QA evidence. Do not apply these tokens to clinical warning/severity colours. No destination page or shared stylesheet has been edited by the homepage owner.
