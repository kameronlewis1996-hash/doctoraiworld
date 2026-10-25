# DoctorAI Health Hub

Open the [free DoctorAI Health Hub](https://www.doctoraiworld.com/health-hub) to organise appointments, medicines, symptoms, and notes. For print tools, see the [New Zealand appointment checklist](https://www.doctoraiworld.com/appointment-checklist) or the [medication-list template](https://www.doctoraiworld.com/medication-list-template).

Source for [DoctorAI World](https://www.doctoraiworld.com), deployed as the `doctorai-health-hub` Vercel project.

DoctorAI is a personal health organizer and information service. It does not diagnose, treat, or replace a qualified clinician or emergency service. Use the in-app medication coverage and privacy disclosures when reviewing scan or medication information.

## Project layout

- Static pages and browser assets are in the repository root.
- `api/` contains the Vercel serverless routes.
- `server-src/` contains shared server handlers.
- `scripts/` contains source checks and Vercel preparation helpers.
- `.env.example` lists environment variable names with placeholders only.

## Local setup

Use Node.js 24 and the pnpm version in `package.json`.

```sh
pnpm install
pnpm run check:js
pnpm run verify:static
```

The static verification script uses PowerShell. Focused checks include `verify:scan`, `verify:medication-provider-retirement`, `verify:medication-database`, and `verify:server`.

## Secrets

Copy the names from `.env.example` into your local environment or Vercel settings as needed. Never commit populated `.env` files, API keys, Stripe secrets, OAuth secrets, or user health data. Configure production and preview credentials separately in Vercel.

## Subscription plans

Configure `STRIPE_PRO_WEEKLY_PRICE_ID` for the optional NZ$6.99 weekly plan and `STRIPE_PRO_MONTHLY_PRICE_ID` for NZ$29 monthly. Each must reference an active recurring Price with the exact amount, NZD currency, billing interval and interval count of one. Production requires live Stripe prices and credentials; previews use test credentials and prices. The existing annual Price remains separately configured by `STRIPE_PRO_ANNUAL_PRICE_ID` and displays its verified currency.

An absent or invalid weekly Price disables only the weekly choice. Adding a Price does not migrate existing subscriptions. New weekly subscriptions renew every week until cancelled; monthly subscriptions renew every month until cancelled. Twelve NZ$29 monthly payments total NZ$348, while 52 NZ$6.99 weekly payments total NZ$363.48.

Run `pnpm run verify:stripe` and `pnpm run verify:subscription-ui` for offline pricing, checkout, subscription-event and plan-selection checks. These checks use synthetic data and make no Stripe requests or charges.
