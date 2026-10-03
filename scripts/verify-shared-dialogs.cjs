"use strict";
// Real UI and scoped handlers; only synthetic in-memory fixtures and providers.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { chromium } = require("playwright"),
  AxeBuilder = require("@axe-core/playwright").default;
const origin = "http://127.0.0.1:4191",
  out = process.env.DOCTORAI_DIALOG_EVIDENCE || "/tmp/doctorai-dialog-evidence";
fs.mkdirSync(out, { recursive: true });
const server = spawn(
  process.execPath,
  [path.join(__dirname, "preview-managed-profiles.cjs")],
  {
    env: { ...process.env, PROFILE_PREVIEW_PORT: "4191" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let browser;
const checks = [],
  audits = [],
  errors = [],
  metrics = [];
const check = (test, label) => {
  assert.ok(test, label);
  checks.push(label);
};
(async () => {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      if (String(d).includes("Synthetic managed-profile")) resolve();
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
    reducedMotion: "reduce",
  });
  context.setDefaultTimeout(5000);
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/health-hub");
  await page.waitForFunction(
    () =>
      document.getElementById("last-synced").textContent ===
      "Private data synced",
  );
  const json = (url) =>
    page.evaluate(async (url) => (await fetch(url)).json(), url);
  const audit = async (name) => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    audits.push({
      name,
      violations: result.violations,
      incomplete: result.incomplete.map((v) => v.id),
    });
    assert.equal(
      result.violations.length,
      0,
      name + ": " + result.violations.map((v) => v.id).join(","),
    );
  };
  await page.locator(".home-medication-manual-cta").focus();
  await page.keyboard.press("Enter");
  check(
    await page
      .locator("[name=name]")
      .evaluate((e) => e === document.activeElement),
    "Keyboard entry focuses medication name",
  );
  const fields = await page
    .locator("#quick-modal [name=name], #quick-modal [name=dose]")
    .evaluateAll((es) =>
      es.map((e) => ({
        font: getComputedStyle(e).fontSize,
        box: e.getBoundingClientRect().toJSON(),
        border: getComputedStyle(e).borderColor,
        describedby: e.getAttribute("aria-describedby"),
      })),
    );
  metrics.push({ name: "medication essentials", fields });
  check(
    fields.every((e) => e.font === "16px" && e.box.height >= 48),
    "Name/strength text is 16px with 48px controls",
  );
  check(
    Math.abs(fields[0].box.y - fields[1].box.y) < 1,
    "Medication name/strength controls align",
  );
  await page.locator("#quick-modal [type=submit]").click();
  check(
    await page
      .locator("#medication-form-error")
      .textContent()
      .then((s) => s.includes("name")),
    "Required-name error is present in active dialog",
  );
  await page.locator("[name=name]").fill("Synthetic dialog medicine");
  await page.locator("#quick-modal [type=submit]").click();
  check(
    (await page.locator("[name=dose]").getAttribute("aria-invalid")) === "true",
    "Missing manual strength marks its field invalid",
  );
  check(
    await page
      .locator("[name=dose]")
      .evaluate((e) => e === document.activeElement),
    "Strength error focuses its field",
  );
  await page.locator("[name=dose]").fill("Synthetic 10 mg");
  await page.locator("#quick-modal").evaluate((e) => (e.scrollTop = 0));
  await page
    .locator("#quick-modal")
    .screenshot({ path: path.join(out, "medication-essentials-desktop.png") });
  await page.locator(".medication-provider-details summary").click();
  check(
    await page
      .locator("[name=nzfProductQuery]")
      .evaluate((e) => getComputedStyle(e).fontSize === "16px"),
    "Optional product-search input is 16px",
  );
  await audit("medication dialog");
  await page
    .locator("#quick-modal")
    .screenshot({ path: path.join(out, "medication-provider-desktop.png") });
  await page.locator("#quick-modal [type=submit]").evaluate((e) => {
    e.click();
    e.click();
  });
  await page.waitForTimeout(1000);
  check(
    (await json("/api/health/state")).state.medications.filter(
      (m) => m.name === "Synthetic dialog medicine",
    ).length === 1,
    "Double activation adds one medication",
  );
  await page.goto(origin + "/health-hub#medications");
  await page
    .locator("[data-edit-medication]")
    .filter({ visible: true })
    .last()
    .click();
  await page.locator("[name=dose]").fill("Synthetic edited 20 mg");
  await page.locator("#quick-modal [type=submit]").click();
  await page.waitForTimeout(1000);
  check(
    (await json("/api/health/state")).state.medications.some(
      (m) =>
        m.name === "Synthetic dialog medicine" &&
        m.dose === "Synthetic edited 20 mg",
    ),
    "Medication edit preserves the selected record",
  );
  await page.goto(origin + "/health-hub#today");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.locator(".care-visit-card [data-open-summary]").focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-care-summary-form] [type=submit]").click();
  check(
    await page
      .locator("#visit-summary-error")
      .evaluate(
        (e) => e === document.activeElement && e.textContent.length > 0,
      ),
    "Empty visit-summary validation is focused and announced inside dialog",
  );
  await page.locator("[name=focus]").fill("Synthetic visit question");
  await page.locator("[data-care-summary-form] [type=submit]").click();
  check(
    await page
      .locator("#care-summary-reviewed")
      .evaluate((e) => e === document.activeElement),
    "Visit preview receives focus",
  );
  await audit("visit preview");
  await page.locator("[data-edit-care-summary]").click();
  check(
    await page
      .locator("[name=focus]")
      .evaluate(
        (e) =>
          e === document.activeElement &&
          e.value === "Synthetic visit question",
      ),
    "Back to edit restores focus and draft content",
  );
  await page.keyboard.press("Escape");
  check(
    await page
      .locator(".care-visit-card [data-open-summary]")
      .evaluate((e) => e === document.activeElement),
    "Escape restores visit-summary opener focus",
  );
  await page.locator("[data-show-privacy]:visible").first().click();
  await audit("privacy");
  check(
    await page
      .locator("#privacy-storage-state")
      .evaluate((e) => getComputedStyle(e).fontSize === "16px"),
    "Storage status is readable at 16px",
  );
  const before = await json("/api/health/state");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#privacy-modal [data-delete-health]").click();
  check(
    JSON.stringify((await json("/api/health/state")).state) ===
      JSON.stringify(before.state),
    "Deletion cancellation preserves synthetic records",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#privacy-modal [data-export-health]").click();
  const download = await downloadPromise;
  await download.saveAs(path.join(out, "synthetic-export.json"));
  const exported = JSON.parse(
    fs.readFileSync(path.join(out, "synthetic-export.json"), "utf8"),
  );
  check(
    JSON.stringify(exported).includes("Synthetic dialog medicine"),
    "Export contains the selected synthetic record",
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await audit("privacy 320px");
  check(
    await page
      .locator("#privacy-modal")
      .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    "Privacy fits 320 CSS pixels",
  );
  await page
    .locator("#privacy-modal")
    .screenshot({ path: path.join(out, "privacy-mobile.png") });
  await page.keyboard.press("Escape");
  await page.locator(".home-briefing-link").click();
  await audit("daily overview");
  const contrast = await page
    .locator(".today-dashboard-summary")
    .evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      image: getComputedStyle(e).backgroundImage,
      text: [...e.querySelectorAll("p,h3,span")].map((t) => ({
        color: getComputedStyle(t).color,
        opacity: getComputedStyle(t).opacity,
      })),
    }));
  metrics.push({ name: "daily overview contrast", ...contrast });
  check(
    contrast.image === "none" &&
      contrast.background === "rgb(7, 91, 179)" &&
      contrast.text.every((t) => t.color === "rgb(255, 255, 255)"),
    "Overview text uses opaque white on dark blue at every position",
  );
  await page.keyboard.press("Escape");
  await json("/__test/plan?tier=free");
  await page.goto(origin + "/health-hub");
  await page.waitForFunction(
    () =>
      document.getElementById("drawer-pro-status").textContent === "Free plan",
  );
  await page.locator(".care-visit-card [data-open-summary]").click();
  await page
    .locator("[name=focus]")
    .fill("Synthetic Free appointment question");
  await page.locator("[data-care-summary-form] [type=submit]").click();
  check(
    await page
      .locator("#care-summary-reviewed")
      .textContent()
      .then((t) => t.includes("Synthetic Free appointment question")),
    "Manual appointment summary remains available on Free",
  );
  await page.keyboard.press("Escape");
  await page.locator(".home-more-tools summary").focus();
  await page.keyboard.press("Enter");
  check(
    await page.locator(".home-more-tools").evaluate((e) => e.open),
    "Additional tools expand with the keyboard",
  );
  check(
    (await page
      .locator("[data-orbit-action]")
      .filter({ visible: true })
      .count()) === 6,
    "All existing additional dashboard tools remain available",
  );
  await audit("additional tools expanded");
  check(errors.length === 0, "No JavaScript errors");
  fs.writeFileSync(
    path.join(out, "dialog-verification.json"),
    JSON.stringify(
      {
        synthetic: true,
        checks,
        audits,
        errors,
        metrics,
        limits: [
          "Local Chromium with synthetic handlers; no live OAuth/KV/Blob/provider or screen reader",
          "Actual 400% browser zoom could not be set in this managed headless environment; 320 CSS-pixel reflow is tested",
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
      evidence: out,
      paidCalls: 0,
    }),
  );
})()
  .catch((error) => {
    fs.writeFileSync(
      path.join(out, "dialog-failure.json"),
      JSON.stringify(
        { error: error.stack, checks, audits, metrics, errors },
        null,
        2,
      ),
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  });
