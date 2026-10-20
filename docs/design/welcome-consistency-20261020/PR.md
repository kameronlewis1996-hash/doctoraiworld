# Align all DoctorAI routes with the welcome page

Draft PR — base `main`, branch `style/welcome-consistency-20261020`.

DoctorAI's public resources and private staff tools had drifted from the welcome page's blue actions, white cards and cyan/lilac atmosphere. A late Hub stylesheet also covered its Aurora background with flat grey. Add a shared presentation stylesheet across all 13 HTML routes, restore the Hub atmosphere using the existing alert-state variables, and align cards, primary actions, form controls, decorative icons and navigation surfaces. Each route retains its layout, content and behavior. Fix the existing staff grant heading/stat-copy contrast with CSS only.

No API, medical wording/rules, dataset, authentication, storage, payment, route, security or deployment configuration changes. Update the PWA shell cache and associated asset assertions so the new style is available offline.

See [visual evidence, route inventory, test results and known gaps](review.md). All screenshots are local Chromium renders. Live welcome HTML and CSS were retrieved read-only and match the baseline source. No preview deployment, production deployment or merge has been made.

This PR is prepared locally. Pushing is pending explicit permission because the repository's Git integration automatically creates Vercel preview deployments for feature branches; the user prohibited deployment for this task. Deployment settings were not changed to bypass that restriction.
