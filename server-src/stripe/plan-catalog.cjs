'use strict';

const plans = Object.freeze({
  weekly: Object.freeze({ env: 'STRIPE_PRO_WEEKLY_PRICE_ID', interval: 'week', currency: 'nzd', unitAmount: 699 }),
  monthly: Object.freeze({ env: 'STRIPE_PRO_MONTHLY_PRICE_ID', interval: 'month', currency: 'nzd', unitAmount: 2900 }),
  annual: Object.freeze({ env: 'STRIPE_PRO_ANNUAL_PRICE_ID', interval: 'year' })
});

const supportedCurrencies = new Set(['usd', 'nzd']);

function keyMode(secretKey) {
  const value = String(secretKey || '');
  if (/^(?:sk|rk)_live_/.test(value)) return 'live';
  if (/^(?:sk|rk)_test_/.test(value)) return 'test';
  return '';
}

function environmentModeMatches(secretKey, environment) {
  const mode = keyMode(secretKey);
  const target = environment === 'production'
    ? 'live'
    : environment === 'preview' || environment === 'development'
      ? 'test'
      : mode;
  return Boolean(mode && mode === target);
}

function isValidPlanPrice(price, plan, mode) {
  const definition = plans[plan];
  const currency = String(price?.currency || '').toLowerCase();
  return Boolean(definition && (mode === 'live' || mode === 'test')
    && price?.active === true
    && price?.type === 'recurring'
    && Number.isSafeInteger(price?.unit_amount)
    && price.unit_amount > 0
    && supportedCurrencies.has(currency)
    && (!definition.currency || currency === definition.currency)
    && (!definition.unitAmount || price.unit_amount === definition.unitAmount)
    && price.recurring?.interval === definition.interval
    && price.recurring?.interval_count === 1
    && price.livemode === (mode === 'live'));
}

module.exports = { plans, keyMode, environmentModeMatches, isValidPlanPrice };
