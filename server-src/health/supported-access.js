"use strict";
const core = require("../_lib/doctorai-core.cjs"),
  programme = require("../_lib/supported-access.cjs");
module.exports = async (request, response) => {
  core.noStore(response);
  if (!["GET", "POST"].includes(request.method))
    return core.json(response, 405, { error: "Method not allowed." });
  const account = await core.identityFromRequest(request);
  if (request.method === "GET" && !account)
    return core.json(response, 200, {
      ...programme.configuration(),
      authenticated: false,
      contribution: programme.contributionPlan(),
    });
  if (!account)
    return core.json(response, 401, {
      error: "Sign in to use your own supported-access application.",
    });
  if (!core.storageConfigured())
    return core.json(response, 503, {
      ...programme.configuration(),
      error: "Isolated private account storage is not available.",
      contribution: programme.contributionPlan(),
    });
  try {
    core.validateOwnerContext(request, account);
    if (request.method === "GET")
      return core.json(response, 200, {
        ...(await programme.accountStatus(account)),
        authenticated: true,
        contribution: programme.contributionPlan(),
      });
    const limit = await core.rateLimit(
      request,
      `support-application:${core.accountKey(account)}`,
      6,
      3600000,
    );
    if (!limit.allowed)
      return core.json(response, 429, {
        error: "Too many application attempts. Try again later.",
      });
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
    return core.json(response, 200, {
      application: await programme.submit(account, body),
    });
  } catch (error) {
    return core.json(response, error.status || 503, {
      error: error.status
        ? error.message
        : "Private applications are temporarily unavailable.",
    });
  }
};
