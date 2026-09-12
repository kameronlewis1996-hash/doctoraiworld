# doctoraiworld

## Admin console

This repo includes a private, separate admin system for DoctorAIWorld —
not part of the public product, not discoverable by regular users:

- [`backend/`](backend) — a small REST API (Node/Express/TypeScript +
  SQLite) exposing usage stats, user management, and Pro upgrade code
  management behind admin login.
- [`android-admin/`](android-admin) — a standalone Android app
  (`com.doctoraiworld.admin`) that talks to that API. Different app,
  different package, not on the Play Store, gated behind your admin
  credentials.

Start with `backend/README.md` to get the API running, then
`android-admin/README.md` to build and install the app.
