'use strict';

const plans = Object.freeze({
  monthly: Object.freeze({ env: 'STRIPE_PRO_MONTHLY_PRICE_ID', interval: 'month' }),
  annual: Object.freeze({ env: 'STRIPE_PRO_ANNUAL_PRICE_ID', interval: 'year' })
});

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

function marketForRequest(request, explicit) {
  const value = explicit ?? request.query?.region;
  if (value !== undefined && !['NZ', 'INTL'].includes(value)) return null;
  return value || (String(request.headers?.['x-vercel-ip-country'] || '').toUpperCase() === 'NZ' ? 'NZ' : 'INTL');
}

function plansForMarket(market = 'INTL') {
  if (market !== 'NZ') return plans;
  const annualAmount = Number(process.env.STRIPE_PRO_NZ_ANNUAL_AMOUNT);
  return {
    monthly: { env: 'STRIPE_PRO_NZ_MONTHLY_PRICE_ID', interval: 'month', amount: 699, currency: 'nzd' },
    annual: { env: 'STRIPE_PRO_NZ_ANNUAL_PRICE_ID', interval: 'year', currency: 'nzd',
      amount: process.env.STRIPE_PRO_NZ_ANNUAL_APPROVED === 'true' && Number.isSafeInteger(annualAmount) && annualAmount > 0 ? annualAmount : null }
  };
}

function isValidPlanPrice(price, plan, mode, market = 'INTL') {
  const definition = plansForMarket(market)[plan];
  return Boolean(definition && (mode === 'live' || mode === 'test')
    && price?.active === true
    && price?.type === 'recurring'
    && Number.isSafeInteger(price?.unit_amount)
    && price.unit_amount > 0
    && String(price.currency || '').toLowerCase() === (definition.currency || 'usd')
    && (market !== 'NZ' || (Number.isSafeInteger(definition.amount) && price.unit_amount === definition.amount))
    && price.recurring?.interval === definition.interval
    && price.recurring?.interval_count === 1
    && price.livemode === (mode === 'live'));
}

module.exports = { plans, marketForRequest, plansForMarket, keyMode, environmentModeMatches, isValidPlanPrice };
