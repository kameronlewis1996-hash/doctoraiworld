# Aurora icon and compactness audit (2026-10-16)

Follow-up: the draft now gives `#view-alerts .hub-alert-card[data-severity]` scoped orange/red icon and card accents; urgent/high and moderate/low remain distinct in shape and text. `hub-category-themes.css?v=2` now holds the same four route tokens as the homepage, removing the old green/amber fallback. The observations below describe the pre-refinement state.

## Scope and evidence

Reviewed the local homepage and Health Hub preview on branch `codex/aurora-alert-theme-20261016`. The Health Hub route was in its explicit synthetic neutral state (`?state=neutral`) and displayed "Synthetic alert preview: no personal records." I did not open or edit real health records.

The available browser viewport was 1260x710. The homepage capture showed the hero and Add Health Detail button; Scan medication (Pro) and the four-item dock were below that viewport. This is not a same-size comparison against the requested 1487x1058 reference, whose visible composition was described as the logo in a circular halo, centered two-line heading, lead, both CTAs, and a frosted four-item dock. The local browser could not be refreshed after the CSS version bump because its CUA connection closed, so the captured colors may reflect cached CSS. The worktree now links `accessibility.css?v=13` and `aurora-theme.css?v=2`; treat the source findings below as current and the screenshots as pre-refresh evidence. No phone-sized viewport was used.

## Prioritized findings

1. **High - alert cards need severity-colored status treatment.** The alert renderer puts severity on `.hub-alert-card[data-severity]` (`health-hub.js:1461`), but the Alerts view gives every `.hub-alert-icon` the same blue tile and has no severity-specific card/icon rule (`health-hub.css:6222-6235`). The theme preserves overall alert state colors on `body[data-health-alert-level="orange|red"]` and the navigation badge (`aurora-theme.css:20-35, 253-256`), and medication warning components retain their red/orange styling (`health-hub.css:373-383`). Give urgent/high/critical cards a red icon/accent, caution/moderate cards an orange icon/accent, and unknown/neutral cards a neutral treatment, scoped to `#view-alerts .hub-alert-card[data-severity]`. Keep the severity label and icon shape so meaning is not carried by color alone.

2. **Medium - some feature accents drift between public Pro and Hub surfaces.** The Hub's semantic map is in `health-hub.js:58-66` and `accessibility.css:43-50`; public Pro cards are remapped separately in `feature-icons.js:243-246`. For example, Profile Documents use `tone-mint` (cyan ink), while the Pro file-library card uses `tone-blue`; Profile Measurements use `tone-coral` (blue ink), while Trends uses `tone-mint`. Align the per-feature map used by `.feature-card > .feature-icon`, `.profile-shortcut-icon`, and `.add-detail-choice[data-modal]` if the intended rule is that the same feature keeps the same accent across the site. Most current values already sit in the blue/cyan/lilac family, so this is a semantic consistency issue rather than a palette break.

3. **Medium - route colors are consistent today but defined twice.** The homepage and Hub route tokens match in `aurora-theme.css:39-62`, and `.home-aurora-dock .home-dock-icon` / Hub nav icons read from those route tokens. `hub-category-themes.css:3-13` still contains the earlier green and amber fallback values; the later-loaded Aurora stylesheet currently overrides them. Keep one source of truth for the four route tokens so stylesheet order changes cannot restore the older hues.

4. **Low - empty states are deliberately text-only.** Common `.empty-state` and `.empty-inline` messages are emitted without decorative icons (for example `health-hub.js:630, 675, 885, 893, 939, 1088, 1165, 1381, 1391, 1462`). This avoids another competing accent in sparse screens. If an empty-state icon is added later, use the same semantic feature map and keep neutral text/readability intact.

## Compactness checks

The source supports the requested density changes: `.home-aurora-dock` is four columns on desktop and two columns at `max-width: 680px` (`aurora-theme.css:130-138, 288-310`); the Add Health Detail chooser is two columns and becomes one column at `max-width: 620px` (`health-hub.css:6023-6027, 6361-6362`); Profile shortcuts use three columns at desktop, two at `max-width: 620px`, and one column at `max-width: 360px` (`health-hub.css:4367, 4520, 4533`; `accessibility.css:90-116`). The captured chooser showed six readable two-column cards and the shortcut grid showed six cards in three columns. These are desktop observations only; a mobile rendering check remains open.

## Review selectors

- Route identity: `.home-aurora-dock [data-home-theme]`, `#hub-shell .primary-nav > .nav-item[data-view]`, `.category-bar > [data-view]`, `.mobile-bottom-nav > [data-view]`
- Add chooser: `#hub-shell #view-add .add-detail-choice[data-modal]`, `#hub-shell #view-add .add-detail-choice[data-view="documents"]`
- Profile shortcuts and semantic map: `#view-profile .profile-shortcut-card`, `.profile-shortcut-icon.tone-*`, `.feature-card > .feature-icon`
- Alerts: `#view-alerts .hub-alert-card[data-severity]`, `#view-alerts .hub-alert-icon`, `.hub-alert-nav-symbol[data-alert-level]`, `body[data-health-alert-level]`
- Pro/utility icons: `.pro-gate-icon`, `.refill-icon`, `.result-file-icon`, `.info-icon`, `.overview-icon`, `.provider-avatar`
