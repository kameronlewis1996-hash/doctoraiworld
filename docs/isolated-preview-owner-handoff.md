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


## Superseding parent setup evidence (2026-10-03)

Owner approval for zero-charge isolated test setup was already given. The parent can continue read/provision/binding work through its supported Vercel cloud-browser UI; the absence of CLI or connector provisioning actions is not an access-denied finding and does not require the owner to perform the whole setup. Owner-only steps are secure token/secret entry and interactive authentication/challenges. No raw secret should appear in chat, logs or screenshots.

The parent created a physically separate private `doctorai-preview-test` Blob store, Preview-only and 0B, with its test-store ID; its token binding is still absent. Existing Redis is shared with production and is unsuitable for the isolated Preview. An additional free database was unavailable in the inspected UI; the offered paid option is not authorised. Do not provision it or change a plan. The test OAuth client remains unresolved.

Production provider secrets could not be replaced by empty Preview values in the UI. This branch now implements an explicit Preview provider guard in 12 routes and reports AI/subscriptions unavailable in auth config. Six DrugBank/NZF approval/display flags were disabled by the parent for this branch. Guard and storage isolation are complementary: no inherited paid provider may be invoked and no shared production storage may be used. Once free isolated KV, dedicated auth and Blob bindings are available, perform owner-approved synthetic signed-in QA; do not grant real entitlements, invite real recipients, collect proof or enable programme/cash features. All such new activation remains disabled in Preview.
