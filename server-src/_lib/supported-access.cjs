"use strict";
const crypto = require("node:crypto");
const core = require("./doctorai-core.cjs");
const key = "doctorai:supported-access:v1",
  field = "programme";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const exact = (body, keys) =>
  body &&
  typeof body === "object" &&
  !Array.isArray(body) &&
  Object.keys(body).every((k) => keys.includes(k));
const reviewer = (account) =>
  core.isAdmin(account) &&
  core.normaliseEmail(account?.email) === "kameronlewis1996@gmail.com";
const positive = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;
function configuration() {
  const capacity = positive(process.env.DOCTORAI_SUPPORT_FUNDED_PLACES);
  const retentionDays = positive(
    process.env.DOCTORAI_SUPPORT_APPLICATION_RETENTION_DAYS,
  );
  const limits = {
    aiRequestsPerMonth: positive(
      process.env.DOCTORAI_SUPPORT_AI_REQUESTS_PER_MONTH,
    ),
    scansPerMonth: positive(process.env.DOCTORAI_SUPPORT_SCANS_PER_MONTH),
    storedBytes: positive(process.env.DOCTORAI_SUPPORT_STORED_BYTES),
    reviewMinutes: positive(process.env.DOCTORAI_SUPPORT_REVIEW_MINUTES),
  };
  const policyVersion = String(
    process.env.DOCTORAI_SUPPORT_POLICY_VERSION || "",
  );
  const ready = Boolean(
    capacity &&
      capacity <= 1000 &&
      retentionDays &&
      Object.values(limits).every(Boolean) &&
      /^[A-Za-z0-9._-]{3,80}$/.test(policyVersion) &&
      process.env.DOCTORAI_SUPPORT_ELIGIBILITY_APPROVED === "true" &&
      process.env.DOCTORAI_SUPPORT_REVIEW_CHANNEL_APPROVED === "true" &&
      process.env.DOCTORAI_SUPPORT_SIGNED_IN_QA_APPROVED === "true",
  );
  return {
    intakeOpen:
      process.env.VERCEL_ENV !== "preview" &&
      ready &&
      process.env.DOCTORAI_SUPPORT_INTAKE_ENABLED === "true",
    capacity: capacity || 0,
    limits,
    retentionDays,
    policyVersion: policyVersion || null,
    evidenceUploadEnabled: false,
    decision: ready ? "configured" : "policy_funding_and_review_pending",
  };
}
const read = async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const record = await core.readPrivateGlobalRecord(key, field),
      value = record.value || {
        v: 1,
        applications: [],
        grants: [],
        metrics: [],
      };
    const applications = value.applications.filter(
      (a) =>
        a.status === "approved" || !a.expiresAt || a.expiresAt > Date.now(),
    );
    if (applications.length === value.applications.length)
      return { ...record, value };
    if (
      await core.commitPrivateRecords([
        {
          globalKey: key,
          field,
          raw: record.raw,
          value: { ...value, applications },
        },
      ])
    )
      continue;
  }
  fail(409, "The private application queue changed. Please reload.");
};
const commit = (record, value, extra = []) =>
  core.commitPrivateRecords([
    { globalKey: key, field, raw: record.raw, value },
    ...extra,
  ]);
const publicApplication = (app) =>
  app && {
    id: app.id,
    status: app.status,
    submittedAt: app.submittedAt,
    reviewedAt: app.reviewedAt || null,
    reviewReference: app.reviewReference || null,
    kind: app.kind || null,
  };
async function accountStatus(account) {
  const record = await read(),
    accountKey = core.accountKey(account);
  return {
    ...configuration(),
    applications: record.value.applications
      .filter((a) => a.accountKey === accountKey)
      .map(publicApplication),
    approvedLifetime: record.value.grants.some(
      (g) => g.accountKey === accountKey,
    ),
    reviewer: reviewer(account),
  };
}
async function submit(account, body) {
  const config = configuration();
  if (!config.intakeOpen)
    fail(
      503,
      "Applications are closed while funding, eligibility and private review decisions are pending. Do not send proof.",
    );
  if (
    !exact(body, [
      "kind",
      "eligibilityConfirmed",
      "authorityConfirmed",
      "referralReference",
    ]) ||
    !["disabled_adult_self", "eligible_family"].includes(body.kind) ||
    body.eligibilityConfirmed !== true ||
    (body.kind === "eligible_family" && body.authorityConfirmed !== true) ||
    (body.referralReference !== undefined &&
      !/^[A-Za-z0-9_-]{4,80}$/.test(body.referralReference))
  )
    fail(
      400,
      "Confirm eligibility using the minimal application. Do not include diagnoses, files or medical history.",
    );
  const record = await read(),
    accountKey = core.accountKey(account);
  const existing = record.value.applications.find(
    (a) =>
      a.accountKey === accountKey &&
      ["pending", "approved", "more_information"].includes(a.status),
  );
  if (existing) return publicApplication(existing);
  if (record.value.grants.length >= config.capacity)
    fail(
      409,
      "All currently funded places are allocated. Existing approved grants remain valid.",
    );
  const cutoff = Date.now() - config.retentionDays * 86400000;
  const applications = record.value.applications.filter(
    (a) => a.status === "approved" || a.submittedAt >= cutoff,
  );
  if (applications.length >= 1000)
    fail(503, "The review queue is full. Please try again later.");
  const app = {
    id: crypto.randomUUID(),
    accountKey,
    kind: body.kind,
    referralReference: body.referralReference || null,
    policyVersion: config.policyVersion,
    status: "pending",
    submittedAt: Date.now(),
    expiresAt: Date.now() + config.retentionDays * 86400000,
  };
  if (
    !(await commit(record, {
      ...record.value,
      applications: [...applications, app],
    }))
  )
    fail(
      409,
      "The application list changed. Retry; no second application was created.",
    );
  return publicApplication(app);
}
async function review(account, body) {
  if (!reviewer(account))
    fail(403, "The existing authorised programme reviewer is required.");
  const config = configuration();
  if (!config.intakeOpen)
    fail(
      503,
      "Reviews are disabled until programme decisions and funding are configured.",
    );
  if (
    !exact(body, [
      "applicationId",
      "outcome",
      "reviewReference",
      "verificationComplete",
      "reviewMinutes",
    ]) ||
    !["approved", "declined", "more_information"].includes(body.outcome) ||
    !/^[A-Za-z0-9_-]{4,80}$/.test(body.reviewReference || "") ||
    !Number.isSafeInteger(body.reviewMinutes) ||
    body.reviewMinutes < 0 ||
    body.reviewMinutes > config.limits.reviewMinutes ||
    (body.outcome === "approved" && body.verificationComplete !== true)
  )
    fail(
      400,
      "A verified minimal review reference and review time are required.",
    );
  const record = await read(),
    app = record.value.applications.find((a) => a.id === body.applicationId);
  if (!app) fail(404, "Application not found.");
  if (["approved", "declined"].includes(app.status)) {
    if (
      app.status === body.outcome &&
      app.reviewReference === body.reviewReference
    )
      return publicApplication(app);
    fail(409, "A completed decision cannot be silently replaced.");
  }
  const targetKey = `doctorai:accounts:${app.accountKey}`,
    grantSnapshot = await core.readPrivateGlobalRecord(
      targetKey,
      "lifetime-pro",
    );
  const approved = body.outcome === "approved",
    alreadyGranted = record.value.grants.some(
      (g) => g.accountKey === app.accountKey,
    );
  if (
    approved &&
    !alreadyGranted &&
    record.value.grants.length >= config.capacity
  )
    fail(
      409,
      "The funded capacity is reached. Existing lifetime grants remain valid.",
    );
  const reviewedAt = Date.now(),
    reviewed = {
      ...app,
      status: body.outcome,
      reviewReference: body.reviewReference,
      reviewedAt,
      reviewerKey: core.accountKey(account),
    };
  if (["approved", "declined"].includes(body.outcome)) {
    delete reviewed.referralReference;
    delete reviewed.kind;
  }
  const grant = {
    tier: "pro",
    source: "supported-access",
    plan: "supported-lifetime",
    lifetime: true,
    exp: null,
    expiresAt: null,
    accountKey: app.accountKey,
    grantedAt: reviewedAt,
    reviewReference: body.reviewReference,
    policyVersion: config.policyVersion,
    limits: config.limits,
  };
  if (grantSnapshot.value && !alreadyGranted)
    fail(
      409,
      "An independent supported grant already exists. Review its history first.",
    );
  const value = {
    ...record.value,
    applications: record.value.applications.map((a) =>
      a.id === app.id ? reviewed : a,
    ),
    grants:
      approved && !alreadyGranted
        ? [
            ...record.value.grants,
            {
              accountKey: app.accountKey,
              grantedAt: reviewedAt,
              reviewReference: body.reviewReference,
            },
          ]
        : record.value.grants,
    metrics: [
      ...record.value.metrics.slice(-999),
      { type: "review", minutes: body.reviewMinutes, at: reviewedAt },
    ],
  };
  const extra =
    approved && !alreadyGranted
      ? [
          {
            globalKey: targetKey,
            field: "lifetime-pro",
            raw: grantSnapshot.raw,
            value: grant,
          },
        ]
      : [];
  if (!(await commit(record, value, extra)))
    fail(
      409,
      "Another decision changed the funded allocation. Reload before reviewing.",
    );
  return publicApplication(reviewed);
}
async function reviewQueue(account) {
  if (!reviewer(account))
    fail(403, "The existing authorised programme reviewer is required.");
  const { value } = await read();
  return {
    ...configuration(),
    applications: value.applications.map((a) => ({
      ...publicApplication(a),
      referralReference: a.referralReference || null,
    })),
    report: {
      complimentaryAccounts: value.grants.length,
      reviewMinutes: value.metrics.reduce(
        (sum, m) => sum + (m.minutes || 0),
        0,
      ),
    },
  };
}
function contributionPlan() {
  // Five per cent is a future planning goal. No cash, charity affiliation or
  // benefit value is manufactured from complimentary accounts.
  return {
    active: false,
    goalPercent: 5,
    financialYear: null,
    approvedCashProfitDefinition: null,
    payoutTiming: null,
    recipient: null,
    cashCommitted: null,
    cashDistributed: null,
    administrationCosts: null,
    reportingCurrency: null,
    complimentaryValueCountsAsCash: false,
  };
}
module.exports = {
  configuration,
  accountStatus,
  submit,
  review,
  reviewQueue,
  contributionPlan,
  reviewer,
};
