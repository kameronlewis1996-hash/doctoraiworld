# DoctorAI browser regression checks

This is a separate, private test package. It does not add dependencies to the
app's root `package.json` and does not need Vercel, Preview, account credentials,
Redis, Blob, Google OAuth, Stripe or a paid AI key.

The Playwright server binds only to `127.0.0.1`. It serves the checked-out
static files and provides in-memory synthetic account/state endpoints. The
medication scanner calls the real local handler with a fake OCR response; that
response is deterministic and asserts `store: false`. The browser blocks every
request to a different origin. Camera access is stubbed as unavailable. All
record names and images are synthetic; nothing is sent to a real account or
provider. Payment routes return a synthetic disabled response.

From the repository root, install and run the suite with:

```sh
npm ci --prefix tests/browser
tests/browser/node_modules/.bin/playwright install chromium
npm test --prefix tests/browser
```

If Chromium is already installed system-wide and the Playwright browser
download is unavailable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its
executable (for example `/usr/bin/chromium`). CI installs the pinned
Playwright-managed Chromium build.

Screenshots and traces are captured when a test fails. The JSON report and
failure artifacts are written under `tests/browser/test-results/`, which is
ignored by Git and uploaded by CI for seven days. The suite checks first-party
image decoding, phone-width navigation/overflow, high-impact axe findings,
synthetic medication/appointment/symptom saves, scanner consent and manual
fallback, and the visible behavior during a mocked account-storage outage.
If port `4173` is already in use locally, select another with
`BROWSER_TEST_PORT=4187` for the test command.

These checks are UI and integration regression evidence only. They do not
validate clinical content, production identity, real account isolation,
Preview/Production storage configuration, or real private-file synchronization.
