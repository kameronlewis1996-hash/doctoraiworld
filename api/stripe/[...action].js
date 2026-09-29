const handlers = {
  plans: () => require('../../server-src/stripe/public-plans.js'),
  'create-checkout-session': () => require('../../server-src/stripe/create-checkout-session.js'),
  'create-portal-session': () => require('../../server-src/stripe/create-portal-session.js'),
  entitlement: () => require('../../server-src/stripe/entitlement.js'),
  'verify-checkout-session': () => require('../../server-src/stripe/verify-checkout-session.js'),
  webhook: () => require('../../server-src/stripe/webhook.js'),
};

module.exports = async function stripeAction(request, response) {
  const raw = request.query?.action;
  const fromPath = String(request.url || '').split('?')[0].split('/').filter(Boolean).pop();
  const action = Array.isArray(raw) ? raw[0] : String(raw || fromPath || '').split('/')[0];
  const load = handlers[action];
  if (!load) return response.status(404).json({ error: 'Stripe action not found.' });
  return load()(request, response);
};
