"use strict";
const core = require("../_lib/doctorai-core.cjs"),
  care = require("../_lib/care-access.cjs");
module.exports = async (request, response) => {
  core.noStore(response);
  const account = await core.identityFromRequest(request);
  if (!account)
    return core.json(response, 401, {
      ...care.configuration(),
      error: "Sign in to review your caregiver permissions.",
    });
  if (!core.storageConfigured())
    return core.json(response, 503, {
      ...care.configuration(),
      error: "Private caregiver storage is unavailable.",
    });
  try {
    core.validateOwnerContext(request, account);
    if (request.method === "GET")
      return core.json(response, 200, {
        ...(await care.ownStatus(account)),
        incoming: await care.incoming(account),
      });
    if (request.method !== "POST")
      return core.json(response, 405, { error: "Method not allowed." });
    const limit = await core.rateLimit(
      request,
      `care-access:${core.accountKey(account)}`,
      20,
      3600000,
    );
    if (!limit.allowed)
      return core.json(response, 429, {
        error: "Too many permission changes. Try again later.",
      });
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
    let result;
    if (body?.action === "invite") {
      const { action, ...input } = body;
      result = await care.invite(request, account, input);
    } else if (body?.action === "inspect") {
      const { action, ...input } = body;
      result = await care.inspectInvitation(account, input);
    } else if (body?.action === "accept") {
      const { action, ...input } = body;
      result = await care.accept(account, input);
    } else if (body?.action === "revoke") {
      const { action, ...input } = body;
      result = await care.revoke(account, input);
    } else if (body?.action === "transition") {
      const { action, ...input } = body;
      result = await care.requestTransition(account, input);
    } else
      return core.json(response, 400, {
        error: "Choose a valid caregiver action.",
      });
    return core.json(response, 200, result);
  } catch (error) {
    return core.json(response, error.status || 503, {
      error: error.status
        ? error.message
        : "Private caregiver access is temporarily unavailable.",
    });
  }
};
