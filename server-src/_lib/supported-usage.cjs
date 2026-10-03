"use strict";
const core = require("./doctorai-core.cjs");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
// Counts and usage only: never prompts, extracted labels or health information.
async function reserve(request, account, kind) {
  const entitlement = await core.activeEntitlement(request, account);
  if (entitlement?.source !== "supported-access") return null;
  const limit = Number(
    entitlement.limits?.[
      kind === "scan" ? "scansPerMonth" : "aiRequestsPerMonth"
    ],
  );
  if (!Number.isSafeInteger(limit) || limit <= 0)
    fail(
      503,
      "Supported Pro usage allowances are awaiting configuration. Manual records remain available.",
    );
  const month = new Date().toISOString().slice(0, 7),
    field = "supported-usage-current-month";
  for (let attempt = 0; attempt < 5; attempt++) {
    const record = await core.readPrivateRecord("accounts", account, field);
    const value =
      record.value?.month === month
        ? record.value
        : {
            month,
            ai: 0,
            scan: 0,
            inputTokens: 0,
            outputTokens: 0,
            unreportedAttempts: 0,
          };
    if (Number(value[kind] || 0) >= limit)
      fail(
        429,
        "This month’s supported AI allowance has been reached. Your lifetime Pro grant and manual records remain available.",
      );
    const next = {
      ...value,
      [kind]: Number(value[kind] || 0) + 1,
      unreportedAttempts: Number(value.unreportedAttempts || 0) + 1,
    };
    if (
      await core.commitPrivateRecords([
        { namespace: "accounts", account, field, raw: record.raw, value: next },
      ])
    )
      return { month, kind };
  }
  fail(409, "Usage changed. Please retry once. No provider request was made.");
}
async function complete(account, reservation, usage) {
  if (
    !reservation ||
    !Number.isSafeInteger(usage?.input_tokens) ||
    !Number.isSafeInteger(usage?.output_tokens) ||
    usage.input_tokens < 0 ||
    usage.output_tokens < 0
  )
    return;
  const field = "supported-usage-current-month";
  for (let attempt = 0; attempt < 5; attempt++) {
    const record = await core.readPrivateRecord("accounts", account, field);
    if (record.value?.month !== reservation.month) return;
    const value = {
      ...record.value,
      inputTokens: record.value.inputTokens + usage.input_tokens,
      outputTokens: record.value.outputTokens + usage.output_tokens,
      unreportedAttempts: Math.max(0, record.value.unreportedAttempts - 1),
    };
    if (
      await core.commitPrivateRecords([
        { namespace: "accounts", account, field, raw: record.raw, value },
      ])
    )
      return;
  }
}
async function reserveStorage(request, account, document, bytes, entitlement) {
  const access =
    entitlement || (await core.activeEntitlement(request, account));
  if (access?.source !== "supported-access") return false;
  const limit = Number(access.limits?.storedBytes),
    field = "supported-storage-usage";
  if (!Number.isSafeInteger(limit) || limit <= 0)
    fail(
      503,
      "Supported document allowance is awaiting configuration. Existing documents remain available.",
    );
  for (let attempt = 0; attempt < 5; attempt++) {
    const record = await core.readPrivateRecord("accounts", account, field);
    let entries = record.value?.entries;
    if (!Array.isArray(entries)) {
      const profiles = await core.listManagedProfiles(account);
      const groups = await Promise.all(
        [null, ...profiles.map((p) => p.id)].map((id) =>
          core.listDocumentMetadata(account, id),
        ),
      );
      entries = groups
        .flat()
        .map((d) => ({
          id: d.id,
          bytes: Number.isSafeInteger(d.storageBytes)
            ? d.storageBytes
            : Math.ceil((Number(d.size || 0) * 4) / 3) + 200,
        }));
    }
    if (entries.reduce((n, e) => n + e.bytes, 0) + bytes > limit)
      fail(
        413,
        "The supported document storage allowance is reached. Export or remove an unneeded document before adding another; your lifetime grant remains active.",
      );
    const value = {
      entries: [...entries, { id: document.id, bytes }],
      updatedAt: Date.now(),
    };
    if (
      await core.commitPrivateRecords([
        { namespace: "accounts", account, field, raw: record.raw, value },
      ])
    )
      return true;
  }
  fail(409, "Document storage changed. Please retry; no file was uploaded.");
}
async function releaseStorage(account, id) {
  const field = "supported-storage-usage";
  for (let attempt = 0; attempt < 5; attempt++) {
    const record = await core.readPrivateRecord("accounts", account, field);
    if (!record.value?.entries?.some((e) => e.id === id)) return;
    const value = {
      ...record.value,
      entries: record.value.entries.filter((e) => e.id !== id),
      updatedAt: Date.now(),
    };
    if (
      await core.commitPrivateRecords([
        { namespace: "accounts", account, field, raw: record.raw, value },
      ])
    )
      return;
  }
  fail(
    409,
    "The document was removed but its storage accounting needs a retry.",
  );
}
module.exports = { reserve, complete, reserveStorage, releaseStorage };
