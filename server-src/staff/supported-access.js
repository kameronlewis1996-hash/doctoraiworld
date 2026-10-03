"use strict";
const core = require("../_lib/doctorai-core.cjs"),
  programme = require("../_lib/supported-access.cjs");
module.exports = async (request, response) => {
  core.noStore(response);
  const account = await core.identityFromRequest(request);
  if (!programme.reviewer(account))
    return core.json(response, 403, {
      error: "The existing authorised programme reviewer is required.",
    });
  if (!core.storageConfigured())
    return core.json(response, 503, {
      error: "Private review storage is unavailable.",
    });
  try {
    if (request.method === "GET")
      return core.json(response, 200, await programme.reviewQueue(account));
    if (request.method !== "POST")
      return core.json(response, 405, { error: "Method not allowed." });
    const limit = await core.rateLimit(
      request,
      `support-review:${core.accountKey(account)}`,
      20,
      3600000,
    );
    if (!limit.allowed)
      return core.json(response, 429, {
        error: "Too many review changes. Try again later.",
      });
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
    return core.json(response, 200, {
      application: await programme.review(account, body),
    });
  } catch (error) {
    return core.json(response, error.status || 503, {
      error: error.status
        ? error.message
        : "Private review is temporarily unavailable.",
    });
  }
};
