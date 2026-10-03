# Isolated Preview setup: secure owner handoff

The owner approved separate test credentials/resources, subject to zero charges, no production changes, no paid plans, no new legal agreements and no broad access. This approval is already recorded; this is an access handoff, not another permission request.

## Current access limit

The connected Vercel app can inspect projects/deployments but exposes no environment-variable or storage provisioning action. This workspace has no Vercel CLI, CLI authentication or `VERCEL_TOKEN`. Do not copy production credentials, retrieve hidden dashboard secrets, grant broad account permissions or paste credentials into chat. No test credentials or remote resources have been created here.

## Configure through the existing owner dashboard

Project: `doctorai-health-hub` (`prj_3QCCQLMxvE3mCcDvCkngVMGbAJl5`), team `kameronlewis1996-3703s-projects`.

1. In the existing Vercel Storage dashboard, confirm the team's Hobby plan and unused free allowance. Create a **new private Blob store**, named for this test candidate. Do not connect an existing production store. Select only Preview; do not add a production or development binding. Do not accept a paid upgrade, trial, new provider terms or production-variable overwrite. If the connection UI cannot restrict bindings, leave the store unconnected and set its new token manually in the next step.
2. Use an existing authorized Upstash account/integration to create a physically separate **Free** Redis database with no credit card, paid upgrade or automatic upgrade. A separate key prefix in the production database is insufficient. If no eligible free allocation exists without accepting new agreements, stop this step. The current public provider pages are linked below; confirm the actual dashboard selection before creating anything.
3. Generate a new strong random signing secret using the owner's password manager. In the project's environment-variable dashboard, set the following as sensitive values for **Preview only**, with the branch override **`codex/web-accessibility-integration-20261003`**:

   | Variable | Source |
   | --- | --- |
   | `PREVIEW_AUTH_SECRET` | New test signing secret |
   | `PREVIEW_KV_REST_API_URL` | New database HTTPS REST endpoint |
   | `PREVIEW_KV_REST_API_TOKEN` | New database token |
   | `PREVIEW_BLOB_READ_WRITE_TOKEN` | New private test-store token |

   Each must differ from its production/generic counterpart; the Redis origin must also differ. Leave all production variables and bindings untouched. Use an existing dedicated test Google OAuth client and override `AUTH_GOOGLE_ID` for this Preview branch only, with the Preview origin authorized on that test client. If no test client is available, stop sign-in setup; do not modify the production OAuth client or accept new agreements.
4. Prevent paid calls in this branch: override inherited `OPENAI_API_KEY`, provider tokens and Stripe secrets to empty/unavailable for this Preview only, and keep DrugBank/NZF license/consumer-use flags false. Verify Preview billing remains disabled. Do not test external AI, licensed medicine providers or payment endpoints.
5. Redeploy this exact candidate as Preview. Verify `/api/auth/config` reports test authentication/account/document storage available, and AI/subscriptions unavailable. Actual test sign-in must activate a durable session; a manually forged browser cookie is not valid deployed QA.
6. A trusted owner-only local process must seed a short-lived synthetic Pro entitlement into the **new test database** using the existing `core.saveEntitlement` function and the verified test account. Do not expose a public grant endpoint, alter billing records or use a production entitlement. This seed has not been performed here. The signed-in Pro flows remain unverified until the isolated binding, test account and durable entitlement exist.

Once finished, tell the parent only that the branch-scoped settings are configured. Do not send any token, signing secret or OAuth credential. The parent can resume test-account/cross-account, profile, save/delete and document QA using synthetic records. Production remains blocked pending signed-in QA and policy approval.

## Free-tier references

- [Vercel Blob usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing): Hobby has included limits and blocks additional use instead of charging overage. Private stores use the same storage/operation pricing as public stores. Separate stores still share the team's allowance; creating a store counts as an advanced operation.
- [Upstash Redis pricing](https://upstash.com/pricing/redis): Free is a distinct plan; entering a credit card upgrades a database to paid usage. Do not choose paid usage for this handoff.
