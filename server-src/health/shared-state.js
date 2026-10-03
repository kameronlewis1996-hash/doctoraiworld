"use strict";
const core = require("../_lib/doctorai-core.cjs"),
  care = require("../_lib/care-access.cjs");
module.exports = async (request, response) => {
  core.noStore(response);
  const account = await core.identityFromRequest(request);
  if (!account)
    return core.json(response, 401, {
      error: "Sign in to access authorised caregiver records.",
    });
  if (!core.storageConfigured())
    return core.json(response, 503, {
      error: "Private caregiver storage is unavailable.",
    });
  try {
    core.validateOwnerContext(request, account);
    const limit = await core.rateLimit(
      request,
      `care-records:${core.accountKey(account)}`,
      60,
      60000,
    );
    if (!limit.allowed)
      return core.json(response, 429, {
        error: "Too many record requests. Try again later.",
      });
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
    return core.json(
      response,
      200,
      await care.sharedState(request, account, body),
    );
  } catch (error) {
    return core.json(response, error.status || 503, {
      error: error.status
        ? error.message
        : "Private caregiver records are temporarily unavailable.",
    });
  }
};
