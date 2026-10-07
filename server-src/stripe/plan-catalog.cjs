'use strict';

const plans = Object.freeze({
  monthly: Object.freeze({ env: 'STRIPE_PRO_MONTHLY_PRICE_ID', interval: 'month' }),
  annual: Object.freeze({ env: 'STRIPE_PRO_ANNUAL_PRICE_ID', interval: 'year' })
});

function keyMode(secretKey) {
  const value = String(secretKey || '');
  if (/^(?:sk|rk|rkcs)_live_/.test(value)) return 'live';
  if (/^(?:sk|rk|rkcs)_test_/.test(value)) return 'test';
  return '';
}

function environmentModeMatches(secretKey, environment) {
  const mode = keyMode(secretKey);
  const target = environment === 'production'
    ? 'live'
    : environment ? 'test' : mode;
  return Boolean(mode && mode === target);
}

function isValidPlanPrice(price, plan, mode) {
  const definition = plans[plan];
  return Boolean(definition && (mode === 'live' || mode === 'test')
    && price?.active === true
    && price?.type === 'recurring'
    && Number.isSafeInteger(price?.unit_amount)
    && price.unit_amount > 0
    && String(price.currency || '').toLowerCase() === 'usd'
    && price.recurring?.interval === definition.interval
    && price.recurring?.interval_count === 1
    && price.livemode === (mode === 'live'));
}

module.exports = { plans, keyMode, environmentModeMatches, isValidPlanPrice };
