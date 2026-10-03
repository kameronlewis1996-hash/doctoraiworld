"use strict";
const crypto = require("node:crypto"),
  core = require("./doctorai-core.cjs"),
  programme = require("./supported-access.cjs");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const key = "doctorai:contribution-planning:v1",
  field = "ledger";
function configuration() {
  const financialYear = String(
      process.env.DOCTORAI_CONTRIBUTION_FINANCIAL_YEAR || "",
    ),
    profitDefinition = String(
      process.env.DOCTORAI_CONTRIBUTION_PROFIT_DEFINITION_REF || "",
    ),
    payoutTiming = String(
      process.env.DOCTORAI_CONTRIBUTION_PAYOUT_TIMING_REF || "",
    ),
    recipient = String(process.env.DOCTORAI_CONTRIBUTION_RECIPIENT_REF || "");
  const currency = String(process.env.DOCTORAI_CONTRIBUTION_CURRENCY || "");
  const valid =
    [financialYear, profitDefinition, payoutTiming, recipient].every((v) =>
      /^[A-Za-z0-9._-]{3,80}$/.test(v),
    ) &&
    /^[A-Z]{3}$/.test(currency) &&
    process.env.DOCTORAI_CONTRIBUTION_ACCOUNTING_APPROVED === "true";
  return {
    active:
      process.env.VERCEL_ENV !== "preview" &&
      valid &&
      process.env.DOCTORAI_CONTRIBUTION_ENABLED === "true",
    goalPercent: 5,
    financialYear: financialYear || null,
    approvedCashProfitDefinition: profitDefinition || null,
    payoutTiming: payoutTiming || null,
    recipient: recipient || null,
    reportingCurrency: currency || null,
    complimentaryValueCountsAsCash: false,
  };
}
async function report(account) {
  if (!programme.reviewer(account))
    fail(403, "The existing authorised reviewer is required.");
  const config = configuration(),
    snapshot = await core.readPrivateGlobalRecord(key, field),
    entries = snapshot.value?.entries || [];
  const relevant = entries.filter(
    (e) =>
      e.financialYear === config.financialYear &&
      e.currency === config.reportingCurrency,
  );
  const sum = (type) =>
    relevant
      .filter((e) => e.type === type)
      .reduce((s, e) => s + e.amountMinor, 0);
  return {
    ...config,
    cashCommitted: config.active ? sum("cash_committed") : null,
    cashDistributed: config.active ? sum("cash_distributed") : null,
    administrationCosts: config.active ? sum("administration_cost") : null,
    amountUnit: "minor currency unit",
    records: relevant.map(({ id, type, amountMinor, recordReference, at }) => ({
      id,
      type,
      amountMinor,
      recordReference,
      at,
    })),
    complimentaryAccounts: (await programme.reviewQueue(account)).report
      .complimentaryAccounts,
  };
}
async function record(account, body) {
  if (!programme.reviewer(account))
    fail(403, "The existing authorised reviewer is required.");
  const config = configuration();
  if (!config.active)
    fail(
      503,
      "Cash contribution recording is disabled while accounting basis, year, recipient and timing remain undecided.",
    );
  if (
    !body ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) => !["id", "type", "amountMinor", "recordReference"].includes(k),
    ) ||
    !["cash_committed", "cash_distributed", "administration_cost"].includes(
      body.type,
    ) ||
    !Number.isSafeInteger(body.amountMinor) ||
    body.amountMinor <= 0 ||
    !/^[A-Za-z0-9_-]{8,100}$/.test(body.id || "") ||
    !/^[A-Za-z0-9_-]{4,80}$/.test(body.recordReference || "")
  )
    fail(
      400,
      "Provide a verified cash/accounting record reference and a positive minor-unit amount. Complimentary retail value cannot be recorded as cash.",
    );
  const snapshot = await core.readPrivateGlobalRecord(key, field),
    entries = snapshot.value?.entries || [];
  const prior = entries.find((e) => e.id === body.id);
  if (prior) {
    if (
      prior.type === body.type &&
      prior.amountMinor === body.amountMinor &&
      prior.recordReference === body.recordReference
    )
      return { recorded: true, id: prior.id };
    fail(409, "This record ID already has a different entry.");
  }
  if (entries.length >= 10000)
    fail(
      503,
      "Archive accounting records through an approved process before recording more.",
    );
  const entry = {
    ...body,
    financialYear: config.financialYear,
    currency: config.reportingCurrency,
    recipientReference: config.recipient,
    at: Date.now(),
    reviewerKey: core.accountKey(account),
  };
  if (
    !(await core.commitPrivateRecords([
      {
        globalKey: key,
        field,
        raw: snapshot.raw,
        value: { entries: [...entries, entry] },
      },
      {
        globalKey: "doctorai:audit",
        field: crypto.randomUUID(),
        raw: null,
        value: {
          type: "cash-report-recorded",
          recordId: entry.id,
          at: entry.at,
          actor: entry.reviewerKey,
        },
      },
    ]))
  )
    fail(409, "Accounting records changed. Retry with the same ID.");
  return { recorded: true, id: entry.id };
}
module.exports = { configuration, report, record };
