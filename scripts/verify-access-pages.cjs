"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  { chromium } = require("playwright"),
  AxeBuilder = require("@axe-core/playwright").default;
const out = process.env.DOCTORAI_ACCESS_EVIDENCE || "/tmp/doctorai-access-ui",
  origin = "http://127.0.0.1:4194";
fs.mkdirSync(out, { recursive: true });
const server = spawn(
  process.execPath,
  [path.join(__dirname, "preview-managed-profiles.cjs")],
  {
    env: {
      ...process.env,
      PROFILE_PREVIEW_PORT: "4194",
      PROFILE_PREVIEW_ACCESS_TEST: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let browser;
const checks = [],
  audits = [],
  errors = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
};
(async () => {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      if (String(d).includes("Synthetic managed-profile preview:")) resolve();
    });
    server.on("exit", reject);
  });
  browser = await chromium.launch({
    executablePath: process.env.DOCTORAI_CHROMIUM || undefined,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  context.setDefaultTimeout(5000);
  await context.route("**/*", (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const audit = async (name) => {
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    audits.push({
      name,
      violations: r.violations,
      incomplete: r.incomplete.map((v) => v.id),
    });
    assert.equal(
      r.violations.length,
      0,
      name + ": " + r.violations.map((v) => v.id),
    );
  };
  const json = (url) =>
    page.evaluate(async (u) => (await fetch(u)).json(), url);
  await page.goto(origin + "/health-hub");
  await page.goto(origin + "/supported-access");
  await page.locator("details summary").click();
  await page.waitForFunction(
    () => !document.getElementById("support-fields").disabled,
  );
  check(
    await page
      .locator("#support-form input[type=checkbox]")
      .first()
      .evaluate((e) => getComputedStyle(e.parentElement).minHeight === "48px"),
    "Application checkbox has a 48px label target",
  );
  await page.locator("[name=eligibilityConfirmed]").check();
  await page.locator("#support-form [type=submit]").evaluate((e) => {
    e.click();
    e.click();
  });
  await page.waitForFunction(() =>
    document
      .getElementById("application-result")
      .textContent.includes("pending"),
  );
  check(
    (await json("/api/health/supported-access")).applications.length === 1,
    "Application double activation creates one request",
  );
  await audit("support application");
  await json("/__test/account?reviewer=1");
  await page.reload();
  await page.locator("#support-review").waitFor({ state: "visible" });
  await page.locator("#review-reference").fill("synthetic-ui-review");
  await page.locator("#review-minutes").fill("4");
  await page.locator("#review-outcome").selectOption("approved");
  await page.locator("[name=verificationComplete]").check();
  await audit("authorised review");
  await page.locator("#review-form [type=submit]").click();
  await page.waitForFunction(() =>
    document
      .getElementById("review-status")
      .textContent.startsWith("1 approved"),
  );
  check(
    true,
    "Existing server-authorised reviewer can approve a synthetic request",
  );
  await json("/__test/account?other=0");
  await json("/__test/plan?tier=free");
  await page.goto(origin + "/health-hub#profile");
  await page.waitForFunction(
    () =>
      document.getElementById("drawer-pro-status").textContent ===
      "Supported lifetime Pro",
  );
  check(
    true,
    "Lifetime Pro has no false expiry countdown after paid access ends",
  );
  await page.goto(origin + "/care-access");
  await page.locator("details summary").click();
  await page.waitForFunction(
    () => !document.getElementById("invite-fields").disabled,
  );
  await page.locator("#care-email").fill("demo-other@example.invalid");
  await page.locator("#care-role").selectOption("editor");
  await page.locator("[name=scope][value=notes]").check();
  await page.locator("[name=scope][value=medications]").check();
  await page.locator("[name=scope][value=appointments]").check();
  await page.locator("[name=adultSelfConsent]").check();
  await page.locator("#invite-form [type=submit]").click();
  const link = page.locator("#invitation-result a");
  await link.waitFor();
  const href = await link.getAttribute("href");
  check(
    href.includes("#invite=") && !href.includes("?"),
    "Invitation token is a fragment, not a logged query parameter",
  );
  await audit("caregiver invitation");
  await json("/__test/account?other=1");
  await page.goto(href);
  await page.waitForFunction(
    () => !document.getElementById("accept-button").disabled,
  );
  check(
    !(await page.evaluate(() => location.hash)),
    "Invitation token is removed from browser history after review",
  );
  check(
    await page
      .locator("#invitation-permissions")
      .textContent()
      .then((t) => t.includes("editor") && t.includes("notes")),
    "Recipient reviews exact permissions",
  );
  await page.locator("[name=permissionAccepted]").check();
  await page.locator("#accept-button").click();
  await page.locator("#care-incoming button").click();
  await page.locator("#shared-notes").fill("Synthetic caregiver UI notes");
  await page.locator("#shared-notes-form [type=submit]").click();
  await page.waitForFunction(() =>
    document.getElementById("shared-status").textContent.includes("saved"),
  );
  check(true, "Authorised caregiver manually edits scoped notes");
  await page
    .locator("#shared-medications-edit [data-field=name]")
    .fill("Synthetic caregiver edited medicine");
  await page
    .locator("#shared-medications-edit [data-field=dose]")
    .fill("Synthetic 15 mg");
  await page.locator("#shared-medications-form [type=submit]").click();
  await page.waitForFunction(() =>
    document
      .getElementById("shared-status")
      .textContent.includes("medications saved"),
  );
  check(true, "Caregiver edits medication essentials without a provider call");
  await page.locator("[data-add-shared-entry=appointments]").click();
  await page
    .locator("#shared-appointments-edit [data-field=title]")
    .fill("Synthetic caregiver visit");
  await page
    .locator("#shared-appointments-edit [data-field=date]")
    .fill("2026-10-29");
  await page
    .locator("#shared-appointments-edit [data-field=time]")
    .fill("09:30");
  await page.locator("#shared-appointments-form [type=submit]").click();
  await page.waitForFunction(() =>
    document
      .getElementById("shared-status")
      .textContent.includes("appointments saved"),
  );
  check(true, "Caregiver adds an authorised appointment");
  await audit("shared editors");

  const download = page.waitForEvent("download");
  await page.locator("#shared-export").click();
  await (
    await download
  ).saveAs(path.join(out, "synthetic-caregiver-export.json"));
  check(
    JSON.parse(
      fs.readFileSync(
        path.join(out, "synthetic-caregiver-export.json"),
        "utf8",
      ),
    )
      .scope.sort()
      .join(",") === "appointments,medications,notes",
    "Caregiver export includes only authorised groups",
  );
  check(
    await page.evaluate(
      () =>
        !Object.values(localStorage).some((s) =>
          s.includes("Synthetic caregiver UI notes"),
        ),
    ),
    "Shared health notes are not written to persistent browser storage",
  );
  await json("/__test/account?other=0");
  await json("/__test/plan?tier=free");
  await page.goto(origin + "/health-hub#profile");
  await page.waitForFunction(
    () =>
      document.getElementById("drawer-pro-status").textContent ===
      "Supported lifetime Pro",
  );
  check(
    true,
    "Lifetime Pro has no false expiry countdown after paid access ends",
  );
  await page.goto(origin + "/care-access");
  page.once("dialog", (d) => d.accept());
  await page.locator("#care-own-list button").first().click();
  await page.waitForFunction(() =>
    document.getElementById("care-own-list").textContent.includes("revoked"),
  );
  check(true, "Owner revocation is available independently of invitation gate");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of [
      "/supported-access",
      "/care-access",
      "/subscription",
    ]) {
      await page.goto(origin + route);
      await audit(route + " " + width);
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route + " reflows at " + width,
      );
      if (width === 390)
        await page.screenshot({
          path: path.join(out, route.slice(1) + "-mobile.png"),
          fullPage: true,
        });
    }
  }
  await page.goto(origin + "/subscription");
  check(
    await page
      .locator("table caption")
      .textContent()
      .then((s) => s.length > 0),
    "Plan comparison is a labelled native table",
  );
  check(
    await page
      .locator("[data-price]")
      .textContent()
      .then((t) => t.includes("6.99")),
    "Preview displays intended NZ monthly price",
  );
  await page.locator("[data-review-checkout]").click();
  await audit("checkout review");
  check(
    await page.locator("[data-confirm-checkout]").isDisabled(),
    "Preview review cannot create a charge",
  );
  await page.keyboard.press("Escape");
  check(
    await page
      .locator("[data-review-checkout]")
      .evaluate((e) => e === document.activeElement),
    "Checkout close restores opener focus",
  );
  check(errors.length === 0, "No JavaScript errors");
  fs.writeFileSync(
    path.join(out, "access-ui-verification.json"),
    JSON.stringify(
      {
        checks,
        audits,
        errors,
        synthetic: true,
        paidCalls: 0,
        limits: [
          "Enabled synthetic flags are confined to undeployed test helper. Live features remain disabled.",
          "No real Google account, evidence, grants, payments, external storage or screen-reader testing",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      axeStates: audits.length,
      errors,
      paidCalls: 0,
      evidence: out,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    fs.writeFileSync(
      path.join(out, "access-ui-failure.json"),
      JSON.stringify({ error: e.stack, checks, audits, errors }, null, 2),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  });
