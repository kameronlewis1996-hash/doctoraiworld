"use strict";
const crypto = require("node:crypto"),
  core = require("./doctorai-core.cjs");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("base64url");
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const exact = (body, keys) =>
  body &&
  typeof body === "object" &&
  !Array.isArray(body) &&
  Object.keys(body).every((k) => keys.includes(k));
const field = "care-access-v1";
const ownerHash = (key) => `doctorai:accounts:${key}`;
const read = async (ownerKey) => {
  const record = await core.readPrivateGlobalRecord(ownerHash(ownerKey), field);
  return {
    ...record,
    value: record.value || {
      v: 1,
      invitations: [],
      grants: [],
      transitions: [],
    },
  };
};
const recordEntry = (ownerKey, record, value) => ({
  globalKey: ownerHash(ownerKey),
  field,
  raw: record.raw,
  value,
});
function configuration() {
  return {
    enabled:
      process.env.VERCEL_ENV !== "preview" &&
      process.env.DOCTORAI_CARE_SHARING_ENABLED === "true" &&
      process.env.DOCTORAI_ADULT_SHARING_POLICY_APPROVED === "true" &&
      process.env.DOCTORAI_CARE_SIGNED_IN_QA_APPROVED === "true",
    childSharingEnabled: false,
    adultManagedSharingEnabled: false,
    transitionCompletionEnabled: false,
  };
}
function gate() {
  if (!configuration().enabled)
    fail(
      503,
      "Caregiver invitations are disabled while consent, access policy and signed-in verification are pending.",
    );
}
function ownerView(value) {
  return {
    invitations: value.invitations.map(({ tokenHash, ...i }) => i),
    grants: value.grants.map((g) => ({
      id: g.id,
      personId: g.personId,
      recipientEmail: g.recipientEmail,
      role: g.role,
      scopes: g.scopes,
      acceptedAt: g.acceptedAt,
      revokedAt: g.revokedAt || null,
    })),
    transitions: value.transitions,
  };
}
async function ownStatus(account) {
  return {
    ...configuration(),
    accountKey: core.accountKey(account),
    ...ownerView((await read(core.accountKey(account))).value),
  };
}
async function invite(request, account, body) {
  gate();
  if (
    !exact(body, [
      "recipientEmail",
      "role",
      "scopes",
      "adultSelfConsent",
      "personId",
    ]) ||
    body.personId !== "self" ||
    body.adultSelfConsent !== true ||
    !["viewer", "editor"].includes(body.role) ||
    !Array.isArray(body.scopes) ||
    !body.scopes.length ||
    body.scopes.length > 3 ||
    new Set(body.scopes).size !== body.scopes.length ||
    !body.scopes.every((s) =>
      ["medications", "appointments", "notes"].includes(s),
    )
  )
    fail(
      400,
      "Only an adult sharing their own records can invite someone. Select explicit record groups and permissions.",
    );
  const recipientEmail = core.normaliseEmail(body.recipientEmail);
  if (
    !/^\S+@\S+\.\S+$/.test(recipientEmail) ||
    recipientEmail.length > 254 ||
    recipientEmail === core.normaliseEmail(account.email)
  )
    fail(400, "Choose another adult’s signed-in account email.");
  if (!(await core.activeEntitlement(request, account)))
    fail(403, "Pro is required to create a new caregiver invitation.");
  const ownerKey = core.accountKey(account),
    record = await read(ownerKey),
    now = Date.now();
  const invitations = record.value.invitations.filter(
    (i) => i.expiresAt > now && !i.acceptedAt && !i.revokedAt,
  );
  if (
    invitations.length +
      record.value.grants.filter((g) => !g.revokedAt).length >=
    20
  )
    fail(409, "Review existing access before inviting another caregiver.");
  const token = crypto.randomBytes(32).toString("base64url"),
    id = crypto.randomUUID();
  const invitation = {
    id,
    ownerKey,
    personId: "self",
    recipientEmail,
    role: body.role,
    scopes: body.scopes,
    tokenHash: hash(token),
    consentAt: now,
    expiresAt: now + 48 * 3600000,
    createdAt: now,
  };
  if (
    !(await core.commitPrivateRecords([
      recordEntry(ownerKey, record, {
        ...record.value,
        invitations: [...invitations, invitation],
      }),
    ]))
  )
    fail(409, "The access list changed. Retry the invitation.");
  // No outbound email. Tokens appear only in the initiating response and URL
  // fragment, never in persistent plaintext, search parameters or logs.
  return {
    id,
    expiresAt: invitation.expiresAt,
    invitationFragment: `${ownerKey}.${id}.${token}`,
  };
}
async function accept(account, body) {
  gate();
  if (
    !exact(body, ["invitationFragment", "permissionAccepted"]) ||
    body.permissionAccepted !== true ||
    typeof body.invitationFragment !== "string"
  )
    fail(400, "Review and accept the explicit caregiver permissions.");
  const [ownerKey, id, token, extra] = body.invitationFragment.split(".");
  if (
    extra ||
    !/^[A-Za-z0-9_-]{43}$/.test(ownerKey || "") ||
    !uuid(id) ||
    !/^[A-Za-z0-9_-]{43}$/.test(token || "")
  )
    fail(400, "The invitation link is invalid.");
  const record = await read(ownerKey),
    invitation = record.value.invitations.find((i) => i.id === id);
  if (
    !invitation ||
    invitation.tokenHash !== hash(token) ||
    invitation.recipientEmail !== core.normaliseEmail(account.email) ||
    invitation.revokedAt ||
    invitation.expiresAt <= Date.now()
  )
    fail(403, "This invitation is unavailable for this signed-in account.");
  if (invitation.acceptedAt)
    fail(
      409,
      "This invitation was already used. Ask the owner to review current access.",
    );
  const acceptedAt = Date.now(),
    recipientKey = core.accountKey(account);
  const grant = {
    id: crypto.randomUUID(),
    ownerKey,
    personId: "self",
    recipientKey,
    recipientEmail: invitation.recipientEmail,
    role: invitation.role,
    scopes: invitation.scopes,
    acceptedAt,
    consentAt: invitation.consentAt,
  };
  const inbox = await core.readPrivateRecord(
    "accounts",
    account,
    "care-inbox-v1",
  );
  const refs = Array.isArray(inbox.value?.references)
    ? inbox.value.references
    : [];
  if (refs.length >= 100)
    fail(409, "Review old caregiver access links before accepting another.");
  if (
    !(await core.commitPrivateRecords([
      recordEntry(ownerKey, record, {
        ...record.value,
        invitations: record.value.invitations.map((i) =>
          i.id === id ? { ...i, acceptedAt } : i,
        ),
        grants: [...record.value.grants, grant],
      }),
      {
        namespace: "accounts",
        account,
        field: "care-inbox-v1",
        raw: inbox.raw,
        value: { references: [...refs, { ownerKey, grantId: grant.id }] },
      },
    ]))
  )
    fail(409, "The invitation changed. No access was added; reopen the link.");
  return {
    ownerKey,
    grantId: grant.id,
    role: grant.role,
    scopes: grant.scopes,
  };
}
async function inspectInvitation(account, body) {
  gate();
  if (
    !exact(body, ["invitationFragment"]) ||
    typeof body.invitationFragment !== "string"
  )
    fail(400, "Choose a valid invitation.");
  const [ownerKey, id, token, extra] = body.invitationFragment.split(".");
  if (
    extra ||
    !/^[A-Za-z0-9_-]{43}$/.test(ownerKey || "") ||
    !uuid(id) ||
    !/^[A-Za-z0-9_-]{43}$/.test(token || "")
  )
    fail(400, "The invitation link is invalid.");
  const { value } = await read(ownerKey),
    invitation = value.invitations.find((i) => i.id === id);
  if (
    !invitation ||
    invitation.tokenHash !== hash(token) ||
    invitation.recipientEmail !== core.normaliseEmail(account.email) ||
    invitation.revokedAt ||
    invitation.acceptedAt ||
    invitation.expiresAt <= Date.now()
  )
    fail(403, "This invitation is unavailable for this signed-in account.");
  return {
    role: invitation.role,
    scopes: invitation.scopes,
    expiresAt: invitation.expiresAt,
    personId: "self",
  };
}
async function incoming(account) {
  const inbox = await core.readPrivateRecord(
      "accounts",
      account,
      "care-inbox-v1",
    ),
    references = inbox.value?.references || [],
    result = [];
  for (const ref of references) {
    const { value } = await read(ref.ownerKey),
      grant = value.grants.find(
        (g) =>
          g.id === ref.grantId && g.recipientKey === core.accountKey(account),
      );
    if (
      grant &&
      !grant.revokedAt &&
      !value.transitions.some(
        (t) => t.personId === grant.personId && t.status === "pending",
      )
    )
      result.push({
        ...ref,
        role: grant.role,
        scopes: grant.scopes,
        personId: grant.personId,
      });
  }
  return result;
}
async function revoke(account, body) {
  if (!exact(body, ["id"]) || !uuid(body.id))
    fail(400, "Choose an invitation or access grant to revoke.");
  const ownerKey = core.accountKey(account),
    record = await read(ownerKey),
    found = [...record.value.grants, ...record.value.invitations].find(
      (g) => g.id === body.id,
    );
  if (!found) fail(404, "Access entry not found for this account.");
  if (found.revokedAt) return { revoked: true };
  const revokeEntry = (entry) =>
    entry.id === body.id ? { ...entry, revokedAt: Date.now() } : entry;
  if (
    !(await core.commitPrivateRecords([
      recordEntry(ownerKey, record, {
        ...record.value,
        grants: record.value.grants.map(revokeEntry),
        invitations: record.value.invitations.map(revokeEntry),
      }),
    ]))
  )
    fail(409, "The access list changed. Retry revocation.");
  return { revoked: true };
}
async function requestTransition(account, body) {
  if (!exact(body, ["personId"]) || !core.validProfileId(body.personId))
    fail(400, "Select the managed person whose authority needs review.");
  const profile = await core.readManagedProfile(account, body.personId);
  if (profile.authorityBasis !== "parent_or_legal_guardian")
    fail(
      400,
      "Use the adult’s own account and explicit consent for adult arrangements. Disability does not confer decision-making authority.",
    );
  const ownerKey = core.accountKey(account),
    record = await read(ownerKey);
  if (
    record.value.transitions.some(
      (t) => t.personId === body.personId && t.status === "pending",
    )
  )
    return { pending: true };
  const transition = {
    id: crypto.randomUUID(),
    personId: body.personId,
    status: "pending",
    requestedAt: Date.now(),
  };
  if (
    !(await core.commitPrivateRecords([
      recordEntry(ownerKey, record, {
        ...record.value,
        transitions: [...record.value.transitions, transition],
        grants: record.value.grants.map((g) =>
          g.personId === body.personId ? { ...g, revokedAt: Date.now() } : g,
        ),
      }),
    ]))
  )
    fail(409, "The authority review changed. Retry.");
  return {
    pending: true,
    message:
      "Shared access is frozen for this person. Control transfer requires verified adult consent and an approved authority review; it is unavailable in this Preview.",
  };
}
const filterState = (state, scopes) => ({
  ...(scopes.includes("medications")
    ? { medications: state?.medications || [] }
    : {}),
  ...(scopes.includes("appointments")
    ? { appointments: state?.appointments || [] }
    : {}),
  ...(scopes.includes("notes")
    ? {
        profile: { notes: state?.profile?.notes || "" },
        timeline: (state?.timeline || []).filter((i) => i.type === "note"),
      }
    : {}),
});
async function sharedState(request, account, body) {
  gate();
  const ownerKey = request.query?.ownerKey,
    id = request.query?.grantId;
  if (!/^[A-Za-z0-9_-]{43}$/.test(ownerKey || "") || !uuid(id))
    fail(400, "Choose a valid caregiver access entry.");
  const access = await read(ownerKey),
    grant = access.value.grants.find((g) => g.id === id);
  if (
    !grant ||
    grant.recipientKey !== core.accountKey(account) ||
    grant.revokedAt ||
    grant.personId !== "self" ||
    access.value.transitions.some(
      (t) => t.personId === grant.personId && t.status === "pending",
    )
  )
    fail(403, "This caregiver permission is unavailable or was revoked.");
  const health = await core.readPrivateGlobalRecord(
      ownerHash(ownerKey),
      "health-state",
    ),
    revision = health.raw ? hash(health.raw) : null;
  if (request.method === "GET") {
    const latest = await read(ownerKey);
    if (latest.raw !== access.raw)
      fail(409, "Permissions changed. Reopen this person’s records.");
    return {
      state: filterState(health.value?.state, grant.scopes),
      revision,
      role: grant.role,
      scopes: grant.scopes,
      personId: "self",
      persistentBrowserCacheAllowed: false,
      aiAndOcrAllowed: false,
    };
  }
  if (request.method !== "PUT")
    fail(
      405,
      "Caregivers can read or edit authorised records; full deletion is reserved to the account owner.",
    );
  if (grant.role !== "editor")
    fail(403, "This permission allows viewing and export, not edits.");
  if (
    !exact(body, ["revision", "scope", "value"]) ||
    body.revision !== revision ||
    !grant.scopes.includes(body.scope)
  )
    fail(
      409,
      "Records changed or the selected record group is not authorised. Reload before editing.",
    );
  const state = { ...(health.value?.state || {}) };
  const entitlements = await Promise.all(
    ["entitlement", "complimentary-pro", "lifetime-pro"].map(async (field) => ({
      field,
      ...(await core.readPrivateGlobalRecord(ownerHash(ownerKey), field)),
    })),
  );
  if (
    !entitlements.some(
      (e) =>
        e.value?.tier === "pro" &&
        !e.value.revokedAt &&
        (Number(e.value.exp) > core.nowSeconds() ||
          (e.field === "lifetime-pro" &&
            e.value.lifetime === true &&
            e.value.source === "supported-access" &&
            e.value.accountKey === ownerKey)),
    )
  )
    fail(
      403,
      "The owner’s Pro access is required for new caregiver edits. Viewing and export remain available.",
    );
  if (body.scope === "notes") {
    if (typeof body.value !== "string" || body.value.length > 10000)
      fail(400, "Notes are invalid.");
    state.profile = { ...state.profile, notes: body.value };
  } else {
    if (!Array.isArray(body.value) || body.value.length > 100)
      fail(400, "The record group is invalid.");
    const allowed =
      body.scope === "medications"
        ? ["id", "name", "dose", "frequency", "instructions"]
        : ["id", "title", "date", "time", "provider", "location", "note"];
    const previous = state[body.scope] || [],
      ids = new Set();
    state[body.scope] = body.value.map((input) => {
      if (
        !exact(input, allowed) ||
        (input.id !== undefined &&
          (typeof input.id !== "string" || ids.has(input.id)))
      )
        fail(400, "Manual record fields or identifiers are invalid.");
      if (input.id) ids.add(input.id);
      const existing = input.id
        ? previous.find((r) => r.id === input.id)
        : null;
      if (input.id && !existing)
        fail(
          409,
          "An entry changed or is not part of the selected record group.",
        );
      if (
        Object.values(input).some(
          (v) => typeof v !== "string" || v.length > 500,
        )
      )
        fail(400, "Manual record text is invalid.");
      const result = {
        ...existing,
        ...input,
        id:
          existing?.id ||
          `${body.scope === "medications" ? "med" : "appointment"}-${crypto.randomUUID()}`,
      };
      if (body.scope === "medications") {
        if (
          !result.name?.trim() ||
          result.name.length > 120 ||
          (result.dose || "").length > 80
        )
          fail(400, "Enter a medicine name and the reviewed label strength.");
        if (
          !existing ||
          existing.name !== result.name ||
          existing.dose !== result.dose
        )
          Object.assign(result, {
            activeIngredients: [],
            activeIngredientsConfirmed: false,
            activeIngredientsManuallyConfirmed: false,
            resolvedIngredients: [],
            nzfProduct: null,
            nzfProductConfirmed: false,
            reviewedAgainstPackageAt: "",
            entrySource: "manual-caregiver",
          });
      } else if (
        !result.title?.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(result.date || "") ||
        !Number.isFinite(Date.parse(result.date)) ||
        new Date(result.date).toISOString().slice(0, 10) !== result.date ||
        (result.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time))
      )
        fail(400, "Enter an appointment title, date and valid optional time.");
      return result;
    });
  }
  if (!core.validHealthState(state)) fail(400, "The manual update is invalid.");
  const updatedAt = Date.now();
  if (
    !(await core.commitPrivateRecords([
      { ...recordEntry(ownerKey, access, null), checkOnly: true },
      ...entitlements.map((e) => ({
        globalKey: ownerHash(ownerKey),
        field: e.field,
        raw: e.raw,
        checkOnly: true,
      })),
      {
        globalKey: ownerHash(ownerKey),
        field: "health-state",
        raw: health.raw,
        value: { v: 1, updatedAt, state },
      },
    ]))
  )
    fail(
      409,
      "Permissions or records changed during saving. Nothing was overwritten.",
    );
  return { saved: true, updatedAt };
}
module.exports = {
  configuration,
  ownStatus,
  invite,
  inspectInvitation,
  accept,
  incoming,
  revoke,
  requestTransition,
  sharedState,
};
