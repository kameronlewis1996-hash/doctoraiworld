const core = require('../../server-src/_lib/doctorai-core.cjs');

module.exports = function handler(request, response) {
  core.noStore(response);
  const googleClientId = core.googleClientId();
  const paidProvidersEnabled = require('../../server-src/_lib/preview-provider-guard.cjs').paidProvidersEnabled();
  const services = {
    authentication: Boolean(core.configured() && googleClientId),
    accountStorage: core.storageConfigured(),
    documentStorage: core.documentStorageConfigured(),
    subscriptions: Boolean(paidProvidersEnabled && process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRO_MONTHLY_PRICE_ID && process.env.STRIPE_PRO_ANNUAL_PRICE_ID),
    ai: Boolean(paidProvidersEnabled && process.env.OPENAI_API_KEY)
  };
  return response.status(200).json({ googleClientId, ready: Object.values(services).every(Boolean), services });
};
