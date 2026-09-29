'use strict';

const Stripe = require('stripe');
const core = require('../_lib/doctorai-core.cjs');
const { plans, keyMode, environmentModeMatches, isValidPlanPrice } = require('./plan-catalog.cjs');

function createHandler(StripeClient = Stripe) {
  return async function publicPlans(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return core.json(response, 405, { error: 'Method not allowed.' });
    }

    const secretKey = String(process.env.STRIPE_SECRET_KEY || '');
    const mode = keyMode(secretKey);
    if (!secretKey || !mode || !environmentModeMatches(secretKey, process.env.VERCEL_ENV)) {
      return core.json(response, 503, { error: 'Subscription pricing is temporarily unavailable.' });
    }

    try {
      const stripe = new StripeClient(secretKey);
      const availablePlans = {};
      await Promise.all(Object.entries(plans).map(async ([name, definition]) => {
        const priceId = String(process.env[definition.env] || '').trim();
        if (!priceId) {
          availablePlans[name] = { available: false, interval: definition.interval };
          return;
        }
        try {
          const price = await stripe.prices.retrieve(priceId);
          if (!isValidPlanPrice(price, name, mode)) {
            core.reportError('stripe_public_plan_invalid', { route: '/api/stripe/plans', plan: name });
            availablePlans[name] = { available: false, interval: definition.interval };
            return;
          }
          availablePlans[name] = { available: true, amount: price.unit_amount, currency: 'USD', interval: definition.interval };
        } catch (error) {
          core.reportError('stripe_public_plan_unavailable', { route: '/api/stripe/plans', plan: name, type: error?.type, code: error?.code });
          availablePlans[name] = { available: false, interval: definition.interval };
        }
      }));
      return core.json(response, 200, { currency: 'USD', plans: availablePlans });
    } catch (error) {
      core.reportError('stripe_public_plans_failed', { route: '/api/stripe/plans', type: error?.type, code: error?.code });
      return core.json(response, 503, { error: 'Subscription pricing is temporarily unavailable.' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.isValidPlanPrice = isValidPlanPrice;
