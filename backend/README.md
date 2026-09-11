# DoctorAIWorld Admin API

Private REST API backing the DoctorAIWorld admin Android app. Not part of
the public-facing DoctorAIWorld product — this is a separate, internal
service for you (the operator) to view usage stats, manage users, and issue
Pro upgrade codes.

## Stack

- Node.js + TypeScript + Express
- SQLite via `better-sqlite3` (single file, zero external DB to run)
- JWT-based admin sessions (`jsonwebtoken`), passwords hashed with `bcryptjs`
- Request validation with `zod`

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `JWT_SECRET` — generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — your admin login. Change the
  password after first login in any real deployment.

Create the database and your admin account:

```bash
npm run seed
```

This also seeds some demo app users and AI-query history so the dashboard
isn't empty on first run. It only seeds demo data when the `app_users`
table is empty, so it's safe to re-run — it won't duplicate your admin
account or demo data.

Run the API:

```bash
npm run dev      # ts-node-dev, auto-restarts on change
# or
npm run build && npm start   # compiled production run
```

The server listens on `PORT` (default `4000`). Health check: `GET /health`.

## Auth

Every route under `/api/*` except `/api/auth/login` requires
`Authorization: Bearer <token>`, where `<token>` comes from
`POST /api/auth/login`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{email, password}` → `{token, admin}` |
| GET | `/api/auth/me` | Current admin from the token |
| GET | `/api/stats/overview` | Totals: users, pro users, queries, revenue estimate |
| GET | `/api/stats/timeseries?metric=ai_queries\|new_users&days=14` | Daily counts |
| GET | `/api/users?search=&page=&pageSize=` | Paginated user list |
| GET | `/api/users/:id` | User detail + query count |
| PATCH | `/api/users/:id` | Edit `displayName`, `isPro`, `proExpiresAt`, `isBanned` |
| GET | `/api/pro-codes?activeOnly=true` | List Pro upgrade codes |
| POST | `/api/pro-codes` | Create a code: `{note?, maxUses?, expiresAt?, customCode?}` |
| PATCH | `/api/pro-codes/:id` | Edit `note`, `maxUses`, `active`, `expiresAt` |
| DELETE | `/api/pro-codes/:id` | Revoke/delete a code |
| GET | `/api/settings` | Editable app content (pro price, announcement banner, etc.) |
| PATCH | `/api/settings` | Update settings — string-keyed map |

## Deploying

This is a plain Node/Express app — deploy it anywhere that runs Node
(a small VPS, Fly.io, Render, Railway, etc.). Put it behind HTTPS in
production; the Android app's network security config only allows
cleartext (`http://`) traffic to `localhost`/`10.0.2.2` for local dev
against the emulator, and requires HTTPS everywhere else.

The SQLite file lives at `DB_PATH` (default `./data/admin.db`) — back it
up like you would any database.

## Wiring up your real DoctorAIWorld app

This repo doesn't yet contain the public DoctorAIWorld product, so `app_users`
and `ai_queries` here are a self-contained schema seeded with demo data.
When you connect this to your real app:

- Have your main app's backend write into (or call this API to write into)
  `app_users` and `ai_queries` as real usage happens, **or**
  point these tables/queries at your existing user database instead.
- Have your main app check `pro_codes` (via a redemption endpoint you add,
  or directly against this DB) when a user redeems a code, incrementing
  `uses` and inserting into `code_redemptions`.
