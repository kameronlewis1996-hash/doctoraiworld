"use strict";
const core = require("../_lib/doctorai-core.cjs"),
  programme = require("../_lib/supported-access.cjs"),
  cash = require("../_lib/contribution-reporting.cjs");
module.exports = async (request, response) => {
  core.noStore(response);
  const account = await core.identityFromRequest(request);
  if (!programme.reviewer(account))
    return core.json(response, 403, {
      error: "The existing authorised reviewer is required.",
    });
  if (!core.storageConfigured())
    return core.json(response, 503, {
      error: "Private accounting storage is unavailable.",
    });
  try {
    if (request.method === "GET")
      return core.json(response, 200, await cash.report(account));
    if (request.method !== "POST")
      return core.json(response, 405, { error: "Method not allowed." });
    const limit = await core.rateLimit(
      request,
      `cash-report:${core.accountKey(account)}`,
      12,
      3600000,
    );
    if (!limit.allowed)
      return core.json(response, 429, {
        error: "Too many accounting changes. Try again later.",
      });
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
    return core.json(response, 200, await cash.record(account, body));
  } catch (error) {
    return core.json(response, error.status || 503, {
      error: error.status
        ? error.message
        : "Private accounting is temporarily unavailable.",
    });
  }
};
