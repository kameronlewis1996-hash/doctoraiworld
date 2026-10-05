# DoctorAI Preview setup

Updated 5 October 2026. This checklist supplies the settings needed for a real provider rehearsal. Local synthetic checks cannot establish that Stripe, Google login, storage and deletion work together on the deployed site.

## Current setup status

- Vercel Preview now has a separate Stripe sandbox restricted test key, a USD 9.99/month test price and a USD 79/year test price. Production retains its existing Stripe key and prices. The temporary sandbox expires on **11 October 2026** unless its owner claims it in Stripe. Do not treat these settings as durable until the sandbox is claimed.
- The live webhook signing secret is now Production-only. Preview webhook delivery is still unconfigured.
- The existing Preview Blob store ID points to a store that Vercel reports as not found. The Vercel connection could edit environment variables and deploy, but returned 403 when creating a Blob store or an automation bypass. A Vercel project administrator must complete those dashboard steps below.
- Preview and Production still use the same Redis database and the same Blob token. Environment namespaces reduce accidental collisions but do not provide physical storage isolation.
- Rechecked 5 October: creating a new private Blob store through the connected Vercel API also returned 403 (`You don't have permission to create the blob`). The connected Stripe account list exposes only the live-mode `Doctoraiworld` context, not the separate temporary Preview sandbox, so no Stripe API write was attempted. The test sandbox's current key/prices remain configured in Vercel Preview, but its webhook signing secret must be created inside that sandbox and entered in Vercel Preview by an authorized dashboard user.

## 1. Separate the Vercel environments

Open **Vercel → doctorai-health-hub → Settings → Environment Variables**. For each shared variable below, keep the existing value assigned to **Production only**, then add a separate value with **Preview only** selected. Check for branch-specific Preview overrides too. Store secrets as sensitive values. Do not paste them into chat or commit them. Vercel applies changed variables to new deployments, so tell Codex when the settings are saved and it can build a new Preview. [Vercel environment variables](https://vercel.com/docs/environment-variables).

| Variable | Preview value |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe test-mode key starting `sk_test_`, `rk_test_` or `rkcs_test_`; verify it has the required permissions |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Sandbox recurring USD monthly Price ID, `price_…` |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Sandbox recurring USD annual Price ID, `price_…` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the sandbox event destination in step 4, `whsec_…` |
| `KV_REST_API_URL` | REST URL of a separate test Redis database |
| `KV_REST_API_TOKEN` | REST token for that test database |
| `KV_REST_API_READ_ONLY_TOKEN` | If retained, the test database's read-only token |
| `BLOB_READ_WRITE_TOKEN` | Token for a separate **private** test Blob store |
| `AUTH_SECRET` | A newly generated random secret, distinct from Production |
| `ACCOUNT_DELETION_WORKFLOW_ENABLED` | Keep `false`; enable in Preview only when the synthetic staff rehearsal is ready |

`DOCTORAI_TEST_BLOB_STORE_ID` and `DOCTORAI_TEST_BLOB_WEBHOOK_PUBLIC_KEY` do not redirect account-document storage. The application uses `BLOB_READ_WRITE_TOKEN`. The current test-store ID is stale; update it when a new store is attached.

## 2. Stripe sandbox and prices

Use one claimed Stripe sandbox for Preview keys, products, prices and billing-portal settings. The current automatically provisioned sandbox is temporary and expires on **11 October 2026**; claim it before then or replace its key and prices with a durable sandbox. The current test prices are USD 9.99/month and USD 79/year. Those match the existing live amounts for technical rehearsal only; they do not approve the commercial launch price. Enable the sandbox customer portal so cancellation can be rehearsed. [Stripe sandboxes](https://docs.stripe.com/sandboxes), [API keys and signing secrets](https://docs.stripe.com/keys).

## 3. Test storage and Google login

Create a separate test Redis database and copy its REST URL and token into Preview. In Vercel's **Storage → Create Storage → Blob**, choose **Private**, name the store for DoctorAI Preview, and select **Preview only** when connecting it; Production is preselected in the creation flow, so check the selection before saving. Use the ordinary `BLOB_READ_WRITE_TOKEN` name. Then change the existing Blob token to Production and Development only, and add the new store's token to Preview. Update `DOCTORAI_TEST_BLOB_STORE_ID` and its webhook public key to the new store's values. [Vercel Blob setup](https://vercel.com/docs/vercel-blob/using-blob-sdk).

The application now also separates Preview KV keys, signatures, encryption derivation and document paths. This extra safeguard does not replace dedicated physical stores. Earlier Preview records and logins will not be visible through the new namespace.

After Codex creates the new protected Preview, add its exact HTTPS origin to the Google web client's authorized JavaScript origins if that origin is not already authorized. Use synthetic test accounts and records for the rehearsal. The revised billing handlers return to their own Preview deployment automatically.

## 4. Protected sandbox webhook

After a new Preview deployment is ready, create a sandbox Stripe event destination for its `/api/stripe/webhook` endpoint with `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed` selected. Copy that destination's signing secret to **Preview only**.

Vercel authentication blocks ordinary third-party webhook delivery. Keep protection enabled. A project administrator can configure **Protection Bypass for Automation** and use its secret in the destination's `x-vercel-protection-bypass` URL query parameter when custom headers are unavailable. Configure this directly in the provider dashboards; the resulting URL is secret and must not appear in chat, source or screenshots. A project bypass secret grants access to all protected deployments in the project; limit who can read it and remove it when Preview webhook testing ends. The current Vercel connection lacks permission to create this bypass. [Vercel's documented Stripe/webhook delivery method](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## 5. Evidence required before release

Rehearse sandbox purchase, entitlement, refresh/restart, cancellation, failed payment, signed webhooks, private document upload/read/delete, and account deletion with synthetic records. Record results and verify Production records remain untouched. Keep the account-deletion workflow disabled until the ownership, billing and retention procedure is approved.

Then build a **staged Production deployment** using `--prod --skip-domain`, verify that exact artifact with Production configuration using read-only checks, and promote its deployment ID after the release gates are satisfied. Promoting a Preview triggers a new Production build; it does not publish the same tested Preview artifact. [Vercel promotion behavior](https://vercel.com/docs/deployments/promote-preview-to-production), [staging with skip-domain](https://vercel.com/docs/cli/deploy).
