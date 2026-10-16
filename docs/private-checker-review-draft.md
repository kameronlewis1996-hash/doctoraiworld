# Private checker review — disabled draft

Baseline: PR83 `7bec9131662b72d74e45efbf1aaaea0eda220dbe`, rules `2026.10.15-r149`. The production API export calls `createReviewHandler()` without enabling it or supplying credentials/store/rate-limit adapters: every route returns no-store 404. An environment variable cannot enable it. No real accounts, passwords, tokens, OAuth grants or persistent access have been created.

## Implemented scaffold

The server-rendered area lives exclusively at `/api/checker-review/portal`, with login, setup, pack JSON, feedback, logout and owner revocation routes under the same API prefix. There is no public portal bundle, pack JSON file or embedded private content. `server-src` retains the existing public redirect block. Private imports stay outside the repository/web root; `/private-review-import/` is also excluded by Git and Vercel as a second guard.

Every content/data/action request requires an opaque, server-backed review session and a current membership for the configured workspace. The separate `__Host-doctorai_checker_review` cookie is HttpOnly, Secure, SameSite Strict, Path `/`; only its SHA-256 key is stored. Ordinary health/Google/staff cookies and supplied role headers confer no review permissions; the review cookie confers no health/staff permission. No review endpoint calls the health, billing or admin services. Forms enforce exact origin, CSRF, method/size bounds and a required durable rate-limit adapter. Responses are buffered until the store's transaction commits, so a failed commit cannot disclose a private body or issue a session cookie.

The UI presents a pinned pack/build/ruleset, scope, gaps, source/rights inventory, fictional cases and version/test-linked feedback. Status is draft, reviewed or needs-change; it is never clinical certification. All imported clinical cases must start synthetic, unvalidated and not-run. Reviewer feedback reads and edits are restricted to the author; the workspace owner can read all workspace feedback but cannot rewrite another author's records. Updates check revisions and preserve original version, test and observed-build linkage; a different build needs a new feedback record.

Source inventory supports metadata/links only, explicitly withheld material, or a reviewed excerpt with a permission record and attribution. Pending source text is omitted. The supplied Pack 1.0 is prepared as a **local private structured import**, with 16 cases and 20 metadata/link entries. Validation does not write to a server, enable access, establish source rights or mark a clinical case passed. Its currentness/rights warnings, multi-medicine delivery question and lack of clinical adjudication remain intact.

## Cache transition

Private responses set browser/CDN no-store, Vary Cookie, same-origin referrer policy, noindex and a restrictive script-free CSP. The current worker bypasses private routes. More importantly, **every protected URL uses `/api/`**, which the released PR83 worker already bypasses. A clean URL rewrite or auto redirect is deliberately absent: an old worker could follow a redirect and cache the final protected response under the original navigation request. The verifier executes both old and new worker handlers against all private paths.

## Exact proposed permissions and limits

| Role | Allowed | Denied |
| --- | --- | --- |
| Owner | Read this workspace's versioned pack and feedback; create/update own feedback; revoke this workspace's reviewer sessions | Patient records, billing, staff/admin/deployments, other workspaces, rewriting reviewer feedback, declaring clinical certification |
| Reviewer | Read this workspace's approved/projection-filtered pack; create/read/update own version/test-linked feedback | Other reviewers' private feedback, membership management, patient records, billing/admin, other accounts/workspaces |

Proposed membership maximum: **7 days**, no automatic renewal. Session maximum: **2 hours**, idle expiry **20 minutes**, bounded by membership expiry. Setup code: **30 minutes**, single use, stored as a hash and consumed atomically with credential creation. Passwords are user-set passphrases (14–128 characters), salted scrypt hashes only. Changing credential version, revoking membership or disabling the workspace invalidates access on the next request; owner revocation deletes all affected sessions immediately. Logout deletes the server session. An expired/revoked user cannot log in again without a new approved setup.

## Secure activation proposal — requires specific approval

1. Approve this exact workspace, roles, recipients identified only by reviewer codes, permissions, membership expiry, retention and revocation plan. No professional's personal identity is needed for this proposal.
2. Implement and independently test a **durable, encrypted, atomic** private store adapter in a distinct review namespace and a durable abuse limiter. The current test adapter is synthetic memory only and is never connected to the production export. Reuse existing server storage patterns only after verifying isolation; do not reuse broad staff grants or health-state storage.
3. Rights-review the private pack and import it using the protected store after approval; validate version/hash and retain an audit record. Unknown sources stay metadata-only or withheld. Agree feedback retention/deletion/backups (proposed: delete or export/review within 30 days after membership expiry; not implemented yet).
4. After action-time approval, create the owner/reviewer memberships and one-time setup codes through an owner-controlled secure server/admin flow. Never print credentials in chat, Git, logs or screenshots. The owner can give the reviewer the one-time code directly; the reviewer sets a password in the secure form. If the owner chooses to set the password himself, he does so in that form and hands it over outside chat. Do not email or contact the reviewer automatically.
5. Wire the approved adapters/configuration and re-review the disabled API export before any activation. Verify private API-path routing, no-store/CSP, durable revocation, atomic invite races, data isolation and actual deployment behaviour. Only then consider a separately approved deployment/activation.

The draft branch sets `git.deploymentEnabled` to false for its exact branch, following [Vercel's branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled), so publishing the draft PR does not deploy the portal. No project security setting or production configuration was changed.

## Verification and remaining blockers

Synthetic tests cover disabled defaults, ordinary-user denial, role/workspace/object read/write isolation, version/revision checks, CSRF/origin, expiry, revocation/logout, atomic setup reuse, commit-failure confidentiality, source projection and old-worker cache bypass. Browser tests use only an intercepted synthetic HTTPS origin, fictional credentials/content and no network-backed account. Screenshots under `docs/design/private-checker-review-20261016/` show synthetic content, never the actual private pack.

Before activation: durable adapter/limiter, credential setup and invitation delivery, retention/deletion implementation, rights/currentness decisions, actual hosting verification and explicit approval remain open. Neither the scaffold nor Pack 1.0 grants clinical approval.
