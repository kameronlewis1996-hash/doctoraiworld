'use strict';

module.exports = function billingReturnUrl() {
  const environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV;
  if (environment && environment !== 'production' && environment !== 'development') {
    const host = String(process.env.VERCEL_URL || '').toLowerCase();
    if (!/^[a-z0-9.-]+\.vercel\.app$/.test(host)) throw new Error('The Preview return address is not configured.');
    return `https://${host}`;
  }
  return String(process.env.NEXT_PUBLIC_APP_URL || 'https://www.doctoraiworld.com').replace(/\/$/, '');
};
