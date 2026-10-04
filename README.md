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

The static verification script uses PowerShell. Other focused verification scripts are available as `verify:scan`, `verify:nzf`, and `verify:server`.

## Secrets

Copy the names from `.env.example` into your local environment or Vercel settings as needed. Never commit populated `.env` files, API keys, Stripe secrets, OAuth secrets, or user health data. Configure production and preview credentials separately in Vercel.
