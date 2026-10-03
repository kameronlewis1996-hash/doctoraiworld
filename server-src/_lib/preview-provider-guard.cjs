'use strict';

// Preview may inherit production keys. A secret being present is never
// permission to spend or transmit test health data to a paid provider.
// Production/development behaviour is preserved; deterministic local medicine
// matching and checks do not use this guard.
const paidProvidersEnabled = () => process.env.VERCEL_ENV !== 'preview';

function blockPreview(response, kind) {
  if (paidProvidersEnabled()) return false;
  const labels = {
    ai: 'AI requests',
    medication: 'External medication-provider requests',
    payments: 'Payment-provider requests',
    email: 'Outbound email'
  };
  require('./doctorai-core.cjs').json(response, 503, {
    code: `preview_${kind}_disabled`,
    error: `${labels[kind] || 'Paid-provider requests'} are disabled in this test Preview. No provider request was made.`
  });
  return true;
}

module.exports = { paidProvidersEnabled, blockPreview };
