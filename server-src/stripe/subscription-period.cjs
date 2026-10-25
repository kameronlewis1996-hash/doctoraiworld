'use strict';

// Stripe API versions can expose billing periods on the subscription or its
// items. Use the earliest item end when a shared subscription end is absent.
function subscriptionPeriodEnd(subscription) {
  const rootEnd = Number(subscription?.current_period_end || 0);
  if (Number.isSafeInteger(rootEnd) && rootEnd > 0) return rootEnd;
  const itemEnds = (Array.isArray(subscription?.items?.data) ? subscription.items.data : [])
    .map(item => Number(item?.current_period_end || 0))
    .filter(end => Number.isSafeInteger(end) && end > 0);
  return itemEnds.length ? Math.min(...itemEnds) : 0;
}

module.exports = { subscriptionPeriodEnd };
