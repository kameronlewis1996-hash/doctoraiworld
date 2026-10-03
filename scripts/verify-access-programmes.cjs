"use strict";
// Actual authentication, encrypted records and API handlers. Local Redis is
// optional; default transport rejects all non-synthetic network origins.
const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const {
  installTestStore,
  responseRecorder,
} = require("./managed-profile-test-store.cjs");
const redisCommand = process.env.DOCTORAI_REDIS_TEST_CONTAINER
  ? require("./local-redis-test-command.cjs").localRedisCommand(
      process.env.DOCTORAI_REDIS_TEST_CONTAINER,
    )
  : null;
const store = installTestStore({ redisCommand });
const core = require("../server-src/_lib/doctorai-core.cjs"),
  programme = require("../server-src/_lib/supported-access.cjs"),
  care = require("../server-src/_lib/care-access.cjs");
const supported = require("../server-src/health/supported-access.js"),
  reviewer = require("../server-src/staff/supported-access.js"),
  access = require("../server-src/health/care-access.js"),
  shared = require("../server-src/health/shared-state.js"),
  redeem = require("../server-src/staff/redeem-pro.js");
const users = [
  "owner",
  "recipient",
  "outsider",
  "applicant-a",
  "applicant-b",
].map((name) =>
  core.createSession({ sub: name, email: `${name}@example.invalid` }),
);
const [owner, recipient, outsider, applicantA, applicantB] = users;
const admin = core.createSession({
  sub: "existing-reviewer-test",
  email: "kameronlewis1996@gmail.com",
});
let checks = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
async function call(handler, user, method, body = {}, query = {}) {
  const response = responseRecorder();
  await handler(
    {
      method,
      body,
      query,
      headers: user
        ? { cookie: `doctorai_session=${core.signedToken(user)}` }
        : {},
      socket: {},
    },
    response,
  );
  return response;
}
const permitProgramme = () => {
  Object.assign(process.env, {
    DOCTORAI_SUPPORT_INTAKE_ENABLED: "true",
    DOCTORAI_SUPPORT_FUNDED_PLACES: "1",
    DOCTORAI_SUPPORT_APPLICATION_RETENTION_DAYS: "30",
    DOCTORAI_SUPPORT_AI_REQUESTS_PER_MONTH: "2",
    DOCTORAI_SUPPORT_SCANS_PER_MONTH: "1",
    DOCTORAI_SUPPORT_STORED_BYTES: "10000",
    DOCTORAI_SUPPORT_REVIEW_MINUTES: "30",
    DOCTORAI_SUPPORT_POLICY_VERSION: "synthetic-v1",
    DOCTORAI_SUPPORT_ELIGIBILITY_APPROVED: "true",
    DOCTORAI_SUPPORT_REVIEW_CHANNEL_APPROVED: "true",
    DOCTORAI_SUPPORT_SIGNED_IN_QA_APPROVED: "true",
  });
};
const application = { kind: "disabled_adult_self", eligibilityConfirmed: true };
(async () => {
  for (const user of [...users, admin]) await core.activateSession(user);
  await core.saveEntitlement(owner, {
    tier: "pro",
    source: "stripe",
    exp: core.nowSeconds() + 3600,
    customerId: "synthetic-preserved",
  });
  check(
    (await call(access, owner, "POST", { action: "invite" })).statusCode,
    503,
    "Invitations are closed by default.",
  );
  check(
    (await call(supported, applicantA, "POST", application)).statusCode,
    503,
    "Intake is closed by default.",
  );
  check(
    (await call(reviewer, outsider, "GET")).statusCode,
    403,
    "Applicants cannot become reviewers.",
  );
  permitProgramme();
  check(
    (await call(supported, null, "POST", application)).statusCode,
    401,
    "Application authentication is mandatory.",
  );
  for (const extra of [
    "diagnosis",
    "file",
    "childName",
    "dateOfBirth",
    "accountKey",
    "approved",
    "reviewer",
  ])
    check(
      (
        await call(supported, applicantA, "POST", {
          ...application,
          [extra]: "synthetic",
        })
      ).statusCode,
      400,
      "Sensitive/authority fields cannot enter minimal intake.",
    );
  const first = await call(supported, applicantA, "POST", application),
    second = await call(supported, applicantB, "POST", {
      kind: "eligible_family",
      eligibilityConfirmed: true,
      authorityConfirmed: true,
    });
  check(first.statusCode, 200);
  check(second.statusCode, 200);
  check(
    (await call(supported, applicantA, "POST", application)).body.application
      .id,
    first.body.application.id,
    "Application retry is idempotent.",
  );
  check(
    await core.activeEntitlement({}, applicantA),
    null,
    "A self-asserted application grants nothing.",
  );
  const decision = (id) => ({
    applicationId: id,
    outcome: "approved",
    reviewReference: "synthetic-review-" + id,
    reviewMinutes: 4,
    verificationComplete: true,
  });
  check(
    (
      await call(
        reviewer,
        outsider,
        "POST",
        decision(first.body.application.id),
      )
    ).statusCode,
    403,
  );
  const race = await Promise.all([
    call(reviewer, admin, "POST", decision(first.body.application.id)),
    call(reviewer, admin, "POST", decision(second.body.application.id)),
  ]);
  check(
    race.map((r) => r.statusCode).sort(),
    [200, 409],
    "Only one final funded place can be committed.",
  );
  const winner = race[0].statusCode === 200 ? applicantA : applicantB,
    loser = winner === applicantA ? applicantB : applicantA,
    winnerId =
      race[0].statusCode === 200
        ? first.body.application.id
        : second.body.application.id;
  check(
    (await core.activeEntitlement({}, winner)).lifetime,
    true,
    "Separate lifetime entitlement resolves.",
  );
  check(
    await core.activeEntitlement({}, loser),
    null,
    "A failed capacity decision grants nothing.",
  );
  process.env.OPENAI_API_KEY = "synthetic-never-called";
  check(
    (
      await call(require("../api/chat.js"), loser, "POST", {
        consent: true,
        purpose: "daily-overview",
        messages: [{ role: "user", content: "Synthetic overview" }],
      })
    ).statusCode,
    403,
    "Free accounts cannot send a paid daily overview request.",
  );
  check(
    (await call(reviewer, admin, "POST", decision(winnerId))).statusCode,
    200,
    "Identical decisions do not duplicate a grant.",
  );
  check(
    (
      await call(reviewer, admin, "POST", {
        ...decision(winnerId),
        outcome: "declined",
      })
    ).statusCode,
    409,
    "Completed decisions cannot be silently changed.",
  );
  const ledger = await programme.reviewQueue(admin);
  check(ledger.report.complimentaryAccounts, 1);
  const privateGrant = await core.readPrivateRecord(
    "accounts",
    winner,
    "lifetime-pro",
  );
  check(privateGrant.value.exp, null);
  check(privateGrant.value.expiresAt, null);
  await core.saveEntitlement(winner, {
    tier: "pro",
    source: "stripe",
    exp: core.nowSeconds() + 3600,
    customerId: "synthetic-existing-customer",
  });
  check(
    (await core.activeEntitlement({}, winner)).source,
    "stripe",
    "A paid subscription is retained separately.",
  );
  await core.saveEntitlement(winner, {
    tier: "free",
    source: "stripe",
    customerId: "synthetic-existing-customer",
  });
  check(
    (await core.activeEntitlement({}, winner)).source,
    "supported-access",
    "Stripe cancellation cannot erase a supported grant.",
  );
  process.env.DOCTORAI_SUPPORT_INTAKE_ENABLED = "false";
  process.env.DOCTORAI_SUPPORT_FUNDED_PLACES = "0";
  check(
    (await core.activeEntitlement({}, winner)).lifetime,
    true,
    "Closing future intake honours an existing grant.",
  );
  check((await call(supported, winner, "GET")).body.approvedLifetime, true);
  const usage = require("../server-src/_lib/supported-usage.cjs");
  await usage.reserve({}, winner, "ai");
  await usage.reserve({}, winner, "ai");
  await assert.rejects(
    () => usage.reserve({}, winner, "ai"),
    (e) => e.status === 429,
  );
  checks++;
  check(
    (await core.activeEntitlement({}, winner)).lifetime,
    true,
    "Usage caps do not revoke lifetime Pro.",
  );
  const reserve = await usage.reserve({}, winner, "scan");
  await usage.complete(winner, reserve, { input_tokens: 12, output_tokens: 4 });
  const counts = (
    await core.readPrivateRecord(
      "accounts",
      winner,
      "supported-usage-current-month",
    )
  ).value;
  check(counts.inputTokens, 12);
  check(counts.outputTokens, 4);
  check(
    counts.unreportedAttempts,
    2,
    "Unreported attempts remain explicit; no invented provider cost.",
  );
  await usage.reserveStorage({}, winner, { id: "synthetic-storage-a" }, 6000);
  await assert.rejects(
    () => usage.reserveStorage({}, winner, { id: "synthetic-storage-b" }, 6000),
    (e) => e.status === 413,
  );
  checks++;
  await usage.releaseStorage(winner, "synthetic-storage-a");
  check(
    (
      await core.readPrivateRecord(
        "accounts",
        winner,
        "supported-storage-usage",
      )
    ).value.entries.length,
    0,
  );
  const cash = require("../server-src/_lib/contribution-reporting.cjs");
  check((await cash.report(admin)).cashDistributed, null);
  await assert.rejects(
    () => cash.record(admin, {}),
    (e) => e.status === 503,
  );
  checks++;
  Object.assign(process.env, {
    DOCTORAI_CONTRIBUTION_ENABLED: "true",
    DOCTORAI_CONTRIBUTION_ACCOUNTING_APPROVED: "true",
    DOCTORAI_CONTRIBUTION_FINANCIAL_YEAR: "synthetic-fy",
    DOCTORAI_CONTRIBUTION_PROFIT_DEFINITION_REF: "synthetic-cash-profit",
    DOCTORAI_CONTRIBUTION_PAYOUT_TIMING_REF: "synthetic-timing",
    DOCTORAI_CONTRIBUTION_RECIPIENT_REF: "synthetic-recipient",
    DOCTORAI_CONTRIBUTION_CURRENCY: "NZD",
  });
  await cash.record(admin, {
    id: "synthetic-commit",
    type: "cash_committed",
    amountMinor: 1000,
    recordReference: "synthetic-record",
  });
  await cash.record(admin, {
    id: "synthetic-paid",
    type: "cash_distributed",
    amountMinor: 500,
    recordReference: "synthetic-record",
  });
  await cash.record(admin, {
    id: "synthetic-admin",
    type: "administration_cost",
    amountMinor: 100,
    recordReference: "synthetic-record",
  });
  const report = await cash.report(admin);
  check(
    [
      report.cashCommitted,
      report.cashDistributed,
      report.administrationCosts,
      report.complimentaryAccounts,
    ],
    [1000, 500, 100, 1],
    "Cash records and complimentary accounts remain separate.",
  );
  await assert.rejects(
    () =>
      cash.record(admin, {
        id: "synthetic-waiver",
        type: "waived_retail",
        amountMinor: 699,
        recordReference: "synthetic-record",
      }),
    (e) => e.status === 400,
  );
  checks++;
  await assert.rejects(
    () =>
      cash.record(outsider, {
        id: "synthetic-bad",
        type: "cash_committed",
        amountMinor: 100,
        recordReference: "synthetic-record",
      }),
    (e) => e.status === 403,
  );
  checks++;
  check(programme.contributionPlan().cashDistributed, null);
  check(programme.contributionPlan().complimentaryValueCountsAsCash, false);
  Object.assign(process.env, {
    DOCTORAI_CARE_SHARING_ENABLED: "true",
    DOCTORAI_ADULT_SHARING_POLICY_APPROVED: "true",
    DOCTORAI_CARE_SIGNED_IN_QA_APPROVED: "true",
  });
  const inviteBody = {
    action: "invite",
    personId: "self",
    recipientEmail: recipient.email,
    role: "editor",
    scopes: ["notes"],
    adultSelfConsent: true,
  };
  const invitation = await call(access, owner, "POST", inviteBody);
  check(invitation.statusCode, 200);
  check(
    (
      await call(access, owner, "POST", {
        ...inviteBody,
        personId: "person-" + randomUUID(),
      })
    ).statusCode,
    400,
    "Managed adult/child delegation is disabled.",
  );
  check(
    (
      await call(access, outsider, "POST", {
        action: "accept",
        invitationFragment: invitation.body.invitationFragment,
        permissionAccepted: true,
      })
    ).statusCode,
    403,
    "A copied invitation cannot be accepted by another account.",
  );
  const accepted = await call(access, recipient, "POST", {
    action: "accept",
    invitationFragment: invitation.body.invitationFragment,
    permissionAccepted: true,
  });
  check(accepted.statusCode, 200);
  check(
    (
      await call(access, recipient, "POST", {
        action: "accept",
        invitationFragment: invitation.body.invitationFragment,
        permissionAccepted: true,
      })
    ).statusCode,
    409,
    "One-use invitation cannot be replayed.",
  );
  await core.saveHealthState(owner, {
    profile: {
      notes: "Synthetic shared notes",
      allergies: "Unshared synthetic allergy",
    },
    medications: [{ name: "Unshared medicine" }],
    documents: [{ id: "Unshared doc" }],
    timeline: [
      { type: "note", description: "Shared note" },
      { type: "symptom", description: "Unshared symptom" },
    ],
  });
  const query = {
    ownerKey: accepted.body.ownerKey,
    grantId: accepted.body.grantId,
  };
  check((await call(shared, outsider, "GET", {}, query)).statusCode, 403);
  const read = await call(shared, recipient, "GET", {}, query);
  check(read.statusCode, 200);
  check(Object.keys(read.body.state).sort(), ["profile", "timeline"]);
  check(read.body.state.profile, { notes: "Synthetic shared notes" });
  check(read.body.state.timeline.length, 1);
  check(
    (
      await call(
        shared,
        recipient,
        "PUT",
        { scope: "medications", revision: read.body.revision, value: [] },
        query,
      )
    ).statusCode,
    409,
    "Out-of-scope edits are rejected.",
  );
  check(
    (await call(shared, recipient, "DELETE", {}, query)).statusCode,
    405,
    "A caregiver cannot delete a full health record.",
  );
  const save = await call(
    shared,
    recipient,
    "PUT",
    {
      scope: "notes",
      revision: read.body.revision,
      value: "Synthetic changed notes",
    },
    query,
  );
  check(save.statusCode, 200);
  check(
    (await core.readHealthState(owner)).state.profile.allergies,
    "Unshared synthetic allergy",
    "Notes edit preserves unshared health fields.",
  );
  const latest = await call(shared, recipient, "GET", {}, query);
  let enteredResolve,
    releaseResolve,
    held = false;
  const entered = new Promise((r) => (enteredResolve = r)),
    release = new Promise((r) => (releaseResolve = r));
  store.controls.beforeCas = async ({ privateTransaction }) => {
    if (privateTransaction && !held) {
      held = true;
      enteredResolve();
      await release;
    }
  };
  const delayed = call(
    shared,
    recipient,
    "PUT",
    {
      scope: "notes",
      revision: latest.body.revision,
      value: "Must not commit after revocation",
    },
    query,
  );
  await entered;
  check(
    (
      await call(access, owner, "POST", {
        action: "revoke",
        id: accepted.body.grantId,
      })
    ).statusCode,
    200,
  );
  releaseResolve();
  check(
    (await delayed).statusCode,
    409,
    "Revocation wins against an in-flight caregiver write.",
  );
  store.controls.beforeCas = null;
  check((await call(shared, recipient, "GET", {}, query)).statusCode, 403);
  check(
    (await core.readHealthState(owner)).state.profile.notes,
    "Synthetic changed notes",
  );
  const viewerInvite = await call(access, owner, "POST", {
      ...inviteBody,
      role: "viewer",
    }),
    viewerAccess = await call(access, recipient, "POST", {
      action: "accept",
      invitationFragment: viewerInvite.body.invitationFragment,
      permissionAccepted: true,
    }),
    viewerQuery = {
      ownerKey: viewerAccess.body.ownerKey,
      grantId: viewerAccess.body.grantId,
    };
  const viewerRead = await call(shared, recipient, "GET", {}, viewerQuery);
  check(
    (
      await call(
        shared,
        recipient,
        "PUT",
        {
          scope: "notes",
          revision: viewerRead.body.revision,
          value: "forbidden",
        },
        viewerQuery,
      )
    ).statusCode,
    403,
  );
  const allInvite = await call(access, owner, "POST", {
      ...inviteBody,
      scopes: ["notes", "medications", "appointments"],
    }),
    allAccess = await call(access, recipient, "POST", {
      action: "accept",
      invitationFragment: allInvite.body.invitationFragment,
      permissionAccepted: true,
    }),
    allQuery = {
      ownerKey: allAccess.body.ownerKey,
      grantId: allAccess.body.grantId,
    };
  let allState = await call(shared, recipient, "GET", {}, allQuery);
  check(
    (
      await call(
        shared,
        recipient,
        "PUT",
        {
          scope: "medications",
          revision: allState.body.revision,
          value: [
            {
              name: "Synthetic edited medicine",
              dose: "10 mg",
              frequency: "Once daily",
              instructions: "Synthetic label text",
            },
          ],
        },
        allQuery,
      )
    ).statusCode,
    200,
    "An editor can make bounded manual medicine changes.",
  );
  const savedMedicine = (await core.readHealthState(owner)).state
    .medications[0];
  check(
    savedMedicine.activeIngredientsConfirmed,
    false,
    "A changed medicine loses prior ingredient confirmations.",
  );
  allState = await call(shared, recipient, "GET", {}, allQuery);
  check(
    (
      await call(
        shared,
        recipient,
        "PUT",
        {
          scope: "medications",
          revision: allState.body.revision,
          value: [
            { name: "Injected confirmation", activeIngredientsConfirmed: true },
          ],
        },
        allQuery,
      )
    ).statusCode,
    400,
    "A caregiver cannot inject a database confirmation.",
  );
  check(
    (
      await call(
        shared,
        recipient,
        "PUT",
        {
          scope: "appointments",
          revision: allState.body.revision,
          value: [{ title: "Synthetic visit", date: "2026-02-31" }],
        },
        allQuery,
      )
    ).statusCode,
    400,
    "Invalid calendar dates are rejected on the server.",
  );
  check(
    (
      await call(
        shared,
        recipient,
        "PUT",
        {
          scope: "appointments",
          revision: allState.body.revision,
          value: [
            { title: "Synthetic visit", date: "2026-10-20", time: "10:30" },
          ],
        },
        allQuery,
      )
    ).statusCode,
    200,
    "An editor can make bounded manual appointment changes.",
  );
  check(
    (await core.readHealthState(owner)).state.profile.allergies,
    "Unshared synthetic allergy",
  );
  const profileId = "person-" + randomUUID();
  await core.createManagedProfile(owner, {
    id: profileId,
    name: "Synthetic child",
    authorityBasis: "parent_or_legal_guardian",
    createdAt: Date.now(),
  });
  check(
    (
      await call(access, owner, "POST", {
        action: "transition",
        personId: profileId,
      })
    ).body.pending,
    true,
    "Authority transition is pending and cannot silently transfer control.",
  );
  check(care.configuration().transitionCompletionEnabled, false);
  check(care.configuration().childSharingEnabled, false);
  // Staff tokens remain valid without a public promotion configuration.
  delete process.env.DOCTORAI_FREE_PRO_CODE;
  const staff = {
    tier: "pro",
    source: "staff-grant",
    email: outsider.email,
    exp: core.nowSeconds() + 3600,
  };
  const token = core.signedToken(staff);
  await core.recordFreeGrant(outsider, {
    ...staff,
    tokenHash: require("node:crypto")
      .createHash("sha256")
      .update(token)
      .digest("base64url"),
    issuedBy: "synthetic-staff",
  });
  const redemption = await Promise.all([
    call(redeem, outsider, "POST", { code: token }),
    call(redeem, outsider, "POST", { code: token }),
  ]);
  check(redemption.map((r) => r.statusCode).sort(), [200, 409]);
  check(
    (await core.readPrivateRecord("accounts", outsider, "complimentary-pro"))
      .value.source,
    "staff-grant",
  );
  check(
    await core.readStoredEntitlement(outsider),
    null,
    "Redeeming a grant does not overwrite paid entitlement storage.",
  );
  await core.revokeFreeGrant(outsider, admin);
  check(
    await core.activeEntitlement({}, outsider),
    null,
    "A revoked short grant is inactive.",
  );
  check(
    (await call(redeem, applicantA, "POST", { code: "" })).statusCode,
    400,
    "Empty promo configuration cannot accept an empty code.",
  );
  check(store.blobCalls.length, 0);
  check(
    store.calls.every((c) => c.command !== undefined),
    true,
  );
  console.log(
    JSON.stringify({
      checks,
      realRedis: Boolean(redisCommand),
      paidCalls: 0,
      privateExternalCalls: 0,
      blobCalls: 0,
      synthetic: true,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
