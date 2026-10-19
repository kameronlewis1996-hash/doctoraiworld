# Private admin hosting proposal

Reviewed 19 October 2026. This is a read-only proposal; no domain, DNS, Vercel project, deployment-protection setting, credential, or secret was changed.

## Current state

- The production site has an existing `/staff` workspace. Its medication-review and synthetic-test APIs require the signed-in DoctorAI staff admin allowlist and return no-store responses.
- The current project has `www.doctoraiworld.com` and `doctoraiworld.com`; `admin.doctoraiworld.com` is not configured on it.
- The current Vercel deployment-protection setting is `all_except_custom_domains`. A custom admin subdomain therefore must not rely on this project's current Vercel authentication boundary. The app's Google session and server-side admin allowlist are the current data gate.
- Review-only candidates in `review-workspace/` must never be published as static files or loaded directly by the patient-facing application. The root `.vercelignore` now excludes that directory. This reduces accidental publication risk; it is not a replacement for server-side authorization.
- The existing staff tab returns a fixed display-only packet and the test tab runs fixed synthetic scenarios. It does not import candidate JSON or activate any additional clinical rule.

## Options

| Option | Access boundary | Indicative incremental cost | Trade-offs |
| --- | --- | --- | --- |
| Keep the existing `/staff` route | Google sign-in plus the server-side staff admin allowlist on each protected API | No new domain or Vercel protection add-on identified | Fastest for the current administrator; shares the public site's project and release lifecycle. Static review files must remain excluded and APIs must keep enforcing access. |
| Separate Vercel project on `admin.doctoraiworld.com` with Vercel Authentication and the existing app allowlist | Vercel Authentication for all deployments in the separate project, followed by the application's admin check | Vercel's 9 September 2026 changelog says Vercel Authentication can protect production deployments on every plan at no additional feature charge. Existing plan/usage and any additional developer seats still need billing confirmation. No domain purchase is needed if the existing DNS zone is used. | Best separation from the public site's project. Vercel users need suitable project/team access. Requires a new project, domain assignment and DNS CNAME, TLS verification, and a careful Google OAuth/session-origin test. |
| Separate project with Vercel Password Protection plus the app allowlist | A shared Vercel password before the existing per-user app check | Vercel currently lists Password Protection at USD $20 per project per month on Pro; Pro is USD $20 per month, before taxes/usage. If Pro is already active, the protection add-on is the likely incremental line item; verify on the actual billing page. | Works for reviewers without Vercel accounts, but the shared password is not per-person identity or an audit trail. Do not enable it on the public site project. |

## Recommendation

Keep `/staff` for the current authenticated administrator and use a dedicated project for a later `admin.doctoraiworld.com` workspace if broader reviewer access is required. Prefer Vercel Authentication plus the app-level staff allowlist, because it avoids a shared gate and Vercel's latest changelog says this protection is now available without an extra feature charge on all plans. Confirm intended reviewer identities and current Vercel billing first. The standalone domain mapping should be made only after explicit DNS/project approval.

Before the separate admin domain is used, verify the Google OAuth authorized origin and redirect URI, cookie `SameSite`/domain behavior, the exact staff allowlist, and that every sensitive API remains server-authorized and `no-store`. Do not place source candidate files in the static root or create a public rewrite to them. A future authenticated review UI should read review data from a server route that checks the admin session; it must not fetch `review-workspace/*.json` from the browser.

## Approval gates

1. Name the reviewers and decide whether each must have a Vercel account.
2. Confirm the current Vercel plan, team membership, and billing limits; project metadata did not expose the active plan or invoice.
3. Approve or decline the separate Vercel project and the DNS CNAME for `admin.doctoraiworld.com`. No domain purchase is proposed.
4. Approve a data-handling scope for candidate evidence, including who can view it and how it is retained. Source reuse rights and competent clinical review remain separate gates.
5. Test the origin-specific login/session behavior and API denials on a protected preview before any custom domain is mapped.

## Official Vercel references

- [Exclude files from deployments with `.vercelignore`](https://vercel.com/docs/deployments/vercel-ignore) - Vercel states ignored files and directories are not uploaded and served.
- [Protect production deployments for free on every plan](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan) - Vercel Authentication can protect all deployments, including production, when the user has suitable project access.
- [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection) - current protection methods and scope.
- [Vercel pricing](https://vercel.com/pricing) - plan and Password Protection prices. Prices are USD and taxes/usage are separate.
- [Set up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain) - adding a subdomain requires project association and DNS verification.
