# DoctorAI Preview setup

Updated 8 October 2026. This checklist supplies the settings needed for a real provider rehearsal. Local synthetic checks cannot establish that Stripe, Google login, storage and deletion work together on the deployed site.

## Current setup status

- Vercel Preview now has a separate Stripe sandbox restricted test key, a USD 9.99/month test price and a USD 79/year test price. Production retains its existing Stripe key and prices. The temporary sandbox expires on **11 October 2026** unless its owner claims it in Stripe. Do not treat these settings as durable until the sandbox is claimed.
- The live webhook signing secret is now Production-only. Preview webhook delivery is still unconfigured.
- A separate private Blob store, `doctorai-preview-test`, is attached to this project for Preview only. Vercel's store page confirms the project connection uses OIDC. The release patch now passes the store ID and an explicit OIDC token to every Preview private Blob operation; if OIDC cannot be obtained, the operation fails instead of falling back to the shared `BLOB_READ_WRITE_TOKEN`. Deployed upload/read/delete smoke checks are still required before treating the isolation as verified.
- Preview and Production still use the same Redis database. The production Blob token is still scoped to Preview and Development for now; remove those targets after the OIDC document smoke checks pass.
- Checked Vercel's Upstash provisioning flow on 6 October: the lowest displayed Redis plan was Pay as You Go at **US$0.20 per 100,000 commands**; the next fixed option was **US$10/month plus US$5 per read region**. Upstash's current pricing page also lists a Free plan with 256 MB and 500,000 commands/month; its plan comparison says one Free database, while its FAQ says up to ten databases can be created free. The existing Free Redis remains shared with Production, so a second free slot is not confirmed for this account. No new database was selected or created. Confirm free-slot availability, or approve a PAYG monthly budget cap before provisioning; Upstash says reaching that cap stops database operations. Keep Preview data synthetic. [Upstash Redis pricing](https://upstash.com/pricing/redis).
- Rechecked 6 October after the user authorized handling the API-key task: the connected Stripe account list still exposes only the live-mode `Doctoraiworld` context; no test-mode/sandbox context is available in this session. No live-mode Stripe write was attempted. The separate restricted test key and prices remain configured in Vercel Preview, but the sandbox webhook signing secret must be created from the sandbox's event destination and entered in Vercel Preview by an authorized dashboard user. Creating another private Blob store through the connected Vercel API also returned 403 (`You don't have permission to create the blob`).
- On 8 October, the exact-head Preview deployment `dpl_3eyY2hcGq4QpGvxp7ubagtExjgq3` returned 200 from `/api/auth/config`, but `ready` remains false because `subscriptions` is false. The plans endpoint returns both USD test prices as available. No Stripe account-list call was made in this turn because the secure Stripe account authorization has not been completed. The user has authorized handling this test-key setup; continue after they open the secure Stripe connection link from this conversation and confirm the connection. Do not request secret values in chat.

## 1. Separate the Vercel environments

Open **Vercel → doctorai-health-hub → Settings → Environment Variables**. For each shared variable below, keep the existing value assigned to **Production only**, then add a separate value with **Preview only** selected. Check for branch-specific Preview overrides too. Store secrets as sensitive values. Do not paste them into chat or commit them. Vercel applies changed variables to new deployments, so tell Codex when the settings are saved and it can build a new Preview. [Vercel environment variables](https://vercel.com/docs/environment-variables).

| Variable | Preview value |
|---|---|
| `STRIPE_SECRET_KEY` | Restricted test-mode key for the dedicated sandbox (prefer an `rk_` restricted key; the server accepts `rk_test_` and `rkcs_test_`). Grant only permissions needed for checkout and subscriptions. Do not use a live key. |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Sandbox recurring USD monthly Price ID, `price_…` |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Sandbox recurring USD annual Price ID, `price_…` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the sandbox event destination in step 4, `whsec_…` |
| `KV_REST_API_URL` | REST URL of a separate test Redis database |
| `KV_REST_API_TOKEN` | REST token for that test database |
| `KV_REST_API_READ_ONLY_TOKEN` | If retained, the test database's read-only token |
| `AUTH_SECRET` | A newly generated random secret, distinct from Production |
| `ACCOUNT_DELETION_WORKFLOW_ENABLED` | Keep `false`; enable in Preview only when the synthetic staff rehearsal is ready |

`DOCTORAI_TEST_BLOB_STORE_ID` selects the Preview private Blob store. The Vercel Blob SDK uses the connected store's short-lived OIDC credential from the function request context; it is not available as `process.env.VERCEL_OIDC_TOKEN` at runtime. After the release patch is deployed and document operations are verified, remove Preview and Development from the production `BLOB_READ_WRITE_TOKEN` environment variable. Keep the production value scoped to Production. `DOCTORAI_TEST_BLOB_WEBHOOK_PUBLIC_KEY` is for Vercel Blob callback verification and does not select the store.

## 2. Stripe sandbox and prices

Use one claimed Stripe sandbox for Preview keys, products, prices and billing-portal settings. The current automatically provisioned sandbox is temporary and expires on **11 October 2026**; claim it before then or replace its key and prices with a durable sandbox. The current test prices are USD 9.99/month and USD 79/year. Those match the existing live amounts for technical rehearsal only; they do not approve the commercial launch price. Enable the sandbox customer portal so cancellation can be rehearsed. [Stripe sandboxes](https://docs.stripe.com/sandboxes), [API keys and signing secrets](https://docs.stripe.com/keys).

## 3. Test storage and Google login

The private Preview Blob store is already created and connected for Preview with OIDC. No long-lived Preview Blob token is needed. Keep `DOCTORAI_TEST_BLOB_STORE_ID` set to the attached store's ID. Preview document calls now supply OIDC explicitly and fail closed if that credential is unavailable, so they cannot fall back to the legacy shared read-write token. After private upload/read/delete are rehearsed successfully, restrict the legacy `BLOB_READ_WRITE_TOKEN` to Production only. [Vercel Blob OIDC](https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication).

The application now also separates Preview KV keys, signatures, encryption derivation and document paths. This extra safeguard does not replace dedicated physical stores. Earlier Preview records and logins will not be visible through the new namespace.

Before sign-in rehearsal, add the exact current protected Preview HTTPS origin to the Google web client's authorized JavaScript origins if that origin is not already authorized. Use synthetic test accounts and records for the rehearsal. The revised billing handlers return to their own Preview deployment automatically.

## 4. Protected sandbox webhook

After a new Preview deployment is ready, open the dedicated sandbox in Stripe Workbench and create an event destination for `https://<current-preview-host>/api/stripe/webhook` with `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed` selected. Copy that destination's signing secret to `STRIPE_WEBHOOK_SECRET` in **Vercel → doctorai-health-hub → Settings → Environment Variables**, set the target to **Preview only**, and use the **Secret** type (called Sensitive in older Vercel UI). Do not paste the key or `whsec_` value into chat, a URL, or source control. Stripe's dashboard shows the endpoint signing secret when the destination is created; Stripe only returns the endpoint secret at creation through its API. [Stripe webhook setup](https://docs.stripe.com/webhooks), [Stripe event endpoint reference](https://docs.stripe.com/api/webhook_endpoints).

Vercel authentication blocks ordinary third-party webhook delivery. Keep protection enabled. A project administrator can configure **Protection Bypass for Automation** and use its secret in the destination's `x-vercel-protection-bypass` URL query parameter when custom headers are unavailable. Configure this directly in the provider dashboards; the resulting URL is secret and must not appear in chat, source or screenshots. A project bypass secret grants access to all protected deployments in the project; limit who can read it and remove it when Preview webhook testing ends. The current Vercel connection lacks permission to create this bypass. [Vercel's documented Stripe/webhook delivery method](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## 5. Evidence required before release

Rehearse sandbox purchase, entitlement, refresh/restart, cancellation, failed payment, signed webhooks, private document upload/read/delete, and account deletion with synthetic records. Record results and verify Production records remain untouched. Keep the account-deletion workflow disabled until the ownership, billing and retention procedure is approved.

Then build a **staged Production deployment** using `--prod --skip-domain`, verify that exact artifact with Production configuration using read-only checks, and promote its deployment ID after the release gates are satisfied. Promoting a Preview triggers a new Production build; it does not publish the same tested Preview artifact. [Vercel promotion behavior](https://vercel.com/docs/deployments/promote-preview-to-production), [staging with skip-domain](https://vercel.com/docs/cli/deploy).
