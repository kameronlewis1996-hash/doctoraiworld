const crypto = require('node:crypto');
const core = require('../_lib/doctorai-core.cjs');

const sign = value => crypto.createHmac('sha256', process.env.AUTH_SECRET || '').update(value).digest('base64url');
const json = core.json;

module.exports = async function grantPro(request, response) {
  if (require('../_lib/preview-provider-guard.cjs').blockPreview(response, 'email')) return;
  const session = await core.identityFromRequest(request);
  if (!core.isAdmin(session)) return json(response, 403, { error: 'Staff admin access is required.' });
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' });
  if (!core.storageConfigured()) return json(response, 503, { error: 'Connect KV_REST_API_URL and KV_REST_API_TOKEN before issuing durable complimentary Pro grants.' });
  const limit = await core.rateLimit(request, `staff-grant:${core.accountKey(session)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) { response.setHeader('Retry-After', String(limit.retryAfter)); return json(response, 429, { error: 'Too many complimentary Pro grants. Please try again later.' }); }
  let body = request.body || {};
  try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch { return json(response, 400, { error: 'Invalid complimentary Pro grant request.' }); }
  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return json(response, 400, { error: 'Enter a valid email address.' });
  const days = 30;
  const exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  const payload = Buffer.from(JSON.stringify({ tier: 'pro', source: 'staff-grant', email, exp, issuedBy: core.normaliseEmail(session.email) }), 'utf8').toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const issuedAt = new Date().toISOString();
  await core.recordFreeGrant({ email }, {
    email,
    source: 'staff-grant',
    issuedAt,
    expiresAt: new Date(exp * 1000).toISOString(),
    exp,
    issuedBy: core.normaliseEmail(session.email),
    actor: core.normaliseEmail(session.email),
    tokenHash: crypto.createHash('sha256').update(token).digest('base64url')
  });
  const origin = String(process.env.NEXT_PUBLIC_APP_URL || 'https://www.doctoraiworld.com').replace(/\/$/, '');
  const redeemUrl = `${origin}/subscription?access_code=${encodeURIComponent(token)}#plans`;
  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'DoctorAI Support <support@doctoraiworld.com>',
        to: [email],
        subject: 'Your DoctorAI Pro access',
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#173451"><h1 style="color:#173451">DoctorAI Pro is ready</h1><p>You have been given complimentary access to DoctorAI Pro.</p><p><a href="${redeemUrl}" style="display:inline-block;padding:13px 18px;background:#173451;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Activate Pro access</a></p><p style="color:#6a8493;font-size:13px">This link is personal and should not be forwarded. DoctorAI helps organise health information and does not replace professional medical care.</p></div>`
      })
    });
    emailed = emailResponse.ok;
  }
  return json(response, 200, { email, expiresAt: exp, accessCode: token, redeemUrl, emailed, emailSetupRequired: !process.env.RESEND_API_KEY });
};
