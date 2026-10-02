'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE = 'doctorai_session';
const ENTITLEMENT_COOKIES = ['doctorai_entitlement', 'doctorai_free_pro'];
const ADMIN_EMAILS = new Set(['kameronlewis1996@gmail.com', 'support@doctoraiworld.com']);
const memoryLimits = new Map();

const nowSeconds = () => Math.floor(Date.now() / 1000);
const normaliseEmail = value => String(value || '').trim().toLowerCase();
const noStore = response => {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
};
const json = (response, status, payload) => {
  noStore(response);
  return response.status(status).json(payload);
};
const previewStorageIsolated = () => process.env.VERCEL_ENV !== 'preview' || (
  process.env.DOCTORAI_PREVIEW_STORAGE_ISOLATED === 'true' &&
  Boolean(process.env.PREVIEW_AUTH_SECRET) &&
  Boolean(process.env.PREVIEW_KV_REST_API_URL) &&
  Boolean(process.env.PREVIEW_KV_REST_API_TOKEN)
);
const secret = () => String(process.env.VERCEL_ENV === 'preview'
  ? (previewStorageIsolated() ? process.env.PREVIEW_AUTH_SECRET : '')
  : process.env.AUTH_SECRET || '');
const configured = () => Boolean(secret());
const hash = value => crypto.createHash('sha256').update(String(value)).digest('base64url');
const safeLogValue = value => String(value || '').replace(/[\r\n\t]/g, ' ').slice(0, 120);
function reportError(event, context = {}) {
  const allowed = ['route', 'provider', 'status', 'type', 'code', 'name', 'operation'];
  const details = Object.fromEntries(allowed
    .filter(key => context[key] !== undefined && context[key] !== null && context[key] !== '')
    .map(key => [key, typeof context[key] === 'number' ? context[key] : safeLogValue(context[key])]));
  console.error(JSON.stringify({ level: 'error', event: safeLogValue(event), at: new Date().toISOString(), ...details }));
}
const timingSafeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const sign = value => configured() ? crypto.createHmac('sha256', secret()).update(value).digest('base64url') : '';
const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const decode = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

function parseCookies(request) {
  return String(request.headers?.cookie || '')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index > 0) cookies[part.slice(0, index)] = part.slice(index + 1);
      return cookies;
    }, {});
}

function readSigned(raw) {
  try {
    if (!raw || !configured()) return null;
    const divider = raw.lastIndexOf('.');
    if (divider < 1) return null;
    const payload = raw.slice(0, divider);
    if (!timingSafeEqual(raw.slice(divider + 1), sign(payload))) return null;
    return decode(payload);
  } catch {
    return null;
  }
}

const signedToken = value => {
  const payload = encode(value);
  return `${payload}.${sign(payload)}`;
};

function sessionFromRequest(request) {
  const session = readSigned(parseCookies(request)[SESSION_COOKIE]);
  return session && Number(session.exp) > Date.now() && session.sid && session.sub && normaliseEmail(session.email) ? session : null;
}

function mobileFromRequest(request) {
  const header = String(request.headers?.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  const token = readSigned(header.slice('Bearer '.length).trim());
  return token && token.scope === 'mobile' && token.sid && Number(token.exp) > nowSeconds() && token.sub && normaliseEmail(token.email) ? token : null;
}

async function sessionIsActive(session) {
  if (!session?.sid) return false;
  // A signed browser or mobile token is not enough on its own for a health
  // account. The durable record makes sign-out and revocation enforceable, and
  // prevents a storage outage from weakening account isolation.
  if (!storageConfigured()) return false;
  const field = encodeURIComponent(hash(session.sid));
  const raw = await redis(`hget/${encodeURIComponent('doctorai:sessions')}/${field}`);
  const value = raw.result && typeof raw.result === 'object' && raw.result.value ? raw.result.value : raw.result;
  const stored = value ? unseal(value) : null;
  return Boolean(stored && !stored.revokedAt && Number(stored.exp) > Date.now() && normaliseEmail(stored.email) === normaliseEmail(session.email));
}

async function identityFromRequest(request) {
  const session = sessionFromRequest(request);
  if (session && await sessionIsActive(session).catch(() => false)) return { ...session, transport: 'cookie' };
  const mobile = mobileFromRequest(request);
  if (mobile && await sessionIsActive(mobile).catch(() => false)) return { ...mobile, transport: 'bearer' };
  return null;
}

function sessionCookie(response, session) {
  const token = signedToken(session);
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

function clearSession(response) {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

function createSession(profile) {
  return {
    v: 1,
    sid: crypto.randomUUID(),
    sub: String(profile.sub || ''),
    email: normaliseEmail(profile.email),
    name: String(profile.name || '').slice(0, 120),
    picture: String(profile.picture || '').slice(0, 2048),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  };
}

async function verifyGoogleCredential(credential) {
  const clientId = googleClientId();
  if (!configured() || !clientId) throw new Error('Secure authentication is not configured.');
  const token = String(credential || '').trim();
  if (!token || token.length > 12000) throw new Error('Google credential is required.');
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error('Google credential could not be verified.');
  const profile = await response.json();
  const validIssuer = profile.iss === 'https://accounts.google.com' || profile.iss === 'accounts.google.com';
  if (profile.aud !== clientId || profile.email_verified !== 'true' || !validIssuer || !profile.sub || !normaliseEmail(profile.email)) {
    throw new Error('Google account verification failed.');
  }
  return { sub: String(profile.sub), email: normaliseEmail(profile.email), name: String(profile.name || ''), picture: String(profile.picture || '') };
}

function googleClientId() {
  return String(process.env.AUTH_GOOGLE_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
}

async function activateSession(session) {
  if (!session?.sid || !storageConfigured()) return false;
  const field = encodeURIComponent(hash(session.sid));
  await redis(`hset/${encodeURIComponent('doctorai:sessions')}/${field}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(seal({ sid: session.sid, email: normaliseEmail(session.email), exp: Number(session.exp), createdAt: Date.now() }))
  });
  return true;
}

async function revokeSession(session) {
  if (!session?.sid || !storageConfigured()) return false;
  const field = encodeURIComponent(hash(session.sid));
  const raw = await redis(`hget/${encodeURIComponent('doctorai:sessions')}/${field}`);
  const value = raw.result && typeof raw.result === 'object' && raw.result.value ? raw.result.value : raw.result;
  const stored = value ? unseal(value) : null;
  if (!stored) return false;
  await redis(`hset/${encodeURIComponent('doctorai:sessions')}/${field}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(seal({ ...stored, revokedAt: new Date().toISOString() }))
  });
  return true;
}

function createMobileToken(account, state) {
  if (!configured() || !account?.sid || !account?.sub || !normaliseEmail(account.email) || !state) return null;
  return signedToken({
    v: 1,
    scope: 'mobile',
    sid: String(account.sid),
    sub: String(account.sub),
    email: normaliseEmail(account.email),
    name: String(account.name || '').slice(0, 120),
    picture: String(account.picture || '').slice(0, 2048),
    state: String(state).slice(0, 160),
    exp: nowSeconds() + 60 * 60 * 24 * 30
  });
}

function accountKey(account) {
  return hash(`doctorai:account:v1:${normaliseEmail(account?.email) || account?.sub || ''}`).slice(0, 48);
}

function entitlementFromCookies(request, account) {
  if (!account) return null;
  const cookies = parseCookies(request);
  for (const name of ENTITLEMENT_COOKIES) {
    const entitlement = readSigned(cookies[name]);
    if (!entitlement || entitlement.tier !== 'pro' || Number(entitlement.exp) <= nowSeconds()) continue;
    if (normaliseEmail(entitlement.email) !== normaliseEmail(account.email)) continue;
    return { ...entitlement, source: entitlement.source || (name === 'doctorai_free_pro' ? 'promotional-code' : 'stripe') };
  }
  return null;
}

function setEntitlementCookie(response, entitlement, name = 'doctorai_entitlement') {
  const seconds = Math.max(1, Number(entitlement.exp) - nowSeconds());
  const payload = { ...entitlement, email: normaliseEmail(entitlement.email), tier: 'pro' };
  response.setHeader('Set-Cookie', `${name}=${signedToken(payload)}; Max-Age=${seconds}; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

function clearEntitlementCookies(response) {
  response.setHeader('Set-Cookie', ENTITLEMENT_COOKIES.map(name => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`));
}

const storageConfigured = () => Boolean(previewStorageIsolated() && storageUrl() && storageToken() && configured());
const storageUrl = () => String(process.env.VERCEL_ENV === 'preview'
  ? (previewStorageIsolated() ? process.env.PREVIEW_KV_REST_API_URL : '')
  : process.env.KV_REST_API_URL || '');
const storageToken = () => String(process.env.VERCEL_ENV === 'preview'
  ? (previewStorageIsolated() ? process.env.PREVIEW_KV_REST_API_TOKEN : '')
  : process.env.KV_REST_API_TOKEN || '');
const redisUrl = () => storageUrl().replace(/\/$/, '');

async function redis(path, options = {}) {
  if (!storageConfigured()) return { configured: false, result: null };
  const response = await fetch(`${redisUrl()}/${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${storageToken()}`,
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error('Secure account storage is unavailable.');
  return response.json().catch(() => ({}));
}

function encryptionKey() {
  if (!configured()) throw new Error('Secure account storage is not configured.');
  return crypto.hkdfSync('sha256', Buffer.from(secret()), Buffer.from('doctorai-health-storage-v1'), Buffer.from('account-data'), 32);
}

function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.from(JSON.stringify({ v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: ciphertext.toString('base64url') }), 'utf8').toString('base64url');
}

function sealBuffer(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.from(JSON.stringify({ v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: ciphertext.toString('base64url') }), 'utf8');
}

function unsealBuffer(value) {
  try {
    const envelope = JSON.parse(Buffer.from(value).toString('utf8'));
    if (!envelope || envelope.v !== 1) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64url')), decipher.final()]);
  } catch {
    return null;
  }
}

function unseal(value) {
  try {
    const envelope = typeof value === 'string' ? JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) : value;
    if (!envelope || envelope.v !== 1) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const data = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64url')), decipher.final()]);
    return JSON.parse(data.toString('utf8'));
  } catch {
    return null;
  }
}

function userHashKey(namespace, account) {
  return encodeURIComponent(`doctorai:${namespace}:${accountKey(account)}`);
}

async function hset(namespace, account, field, value) {
  if (!storageConfigured()) return false;
  await redis(`hset/${userHashKey(namespace, account)}/${encodeURIComponent(field)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value)
  });
  return true;
}

async function hget(namespace, account, field) {
  if (!storageConfigured()) return null;
  const raw = await redis(`hget/${userHashKey(namespace, account)}/${encodeURIComponent(field)}`);
  return raw.result ?? null;
}

async function hdel(namespace, account, field) {
  if (!storageConfigured()) return false;
  await redis(`hdel/${userHashKey(namespace, account)}/${encodeURIComponent(field)}`, { method: 'POST' });
  return true;
}

async function hvals(namespace, account) {
  if (!storageConfigured()) return [];
  const raw = await redis(`hvals/${userHashKey(namespace, account)}`);
  return Array.isArray(raw.result) ? raw.result : [];
}

async function saveHealthState(account, state) {
  if (!storageConfigured()) return false;
  return hset('accounts', account, 'health-state', seal({ v: 1, updatedAt: Date.now(), state }));
}

async function readHealthState(account) {
  const raw = await hget('accounts', account, 'health-state');
  const stored = raw && typeof raw === 'object' && raw.value ? raw.value : raw;
  const record = stored ? unseal(stored) : null;
  return record?.v === 1 && record.state ? record : null;
}

async function deleteHealthState(account) {
  return hdel('accounts', account, 'health-state');
}

async function saveDocumentMetadata(account, document) {
  if (!storageConfigured()) return false;
  return hset('documents', account, document.id, seal(document));
}

async function readDocumentMetadata(account, id) {
  const raw = await hget('documents', account, id);
  const stored = raw && typeof raw === 'object' && raw.value ? raw.value : raw;
  return stored ? unseal(stored) : null;
}

async function listDocumentMetadata(account) {
  const values = await hvals('documents', account);
  return values
    .map(value => unseal(typeof value === 'object' && value.value ? value.value : value))
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

async function deleteDocumentMetadata(account, id) {
  return hdel('documents', account, id);
}

async function saveEntitlement(account, entitlement) {
  if (!storageConfigured()) return false;
  return hset('accounts', account, 'entitlement', seal({ ...entitlement, email: normaliseEmail(entitlement.email || account.email), updatedAt: Date.now() }));
}

async function readStoredEntitlement(account) {
  const raw = await hget('accounts', account, 'entitlement');
  const stored = raw && typeof raw === 'object' && raw.value ? raw.value : raw;
  const entitlement = stored ? unseal(stored) : null;
  return entitlement && entitlement.tier === 'pro' ? entitlement : null;
}

async function activeEntitlement(request, account) {
  if (!account) return null;
  const stored = await readStoredEntitlement(account).catch(() => null);
  // When durable account storage is connected it is the source of truth. This
  // prevents an old signed browser cookie from surviving a staff revocation or
  // a cancelled subscription.
  if (storageConfigured()) {
    if (stored?.tier === 'pro' && Number(stored.exp) > nowSeconds() && !stored.revokedAt) return stored;
    return null;
  }
  // Pro access must always be backed by a durable server record. A signed
  // browser cookie is useful for UI continuity, but is never the authority.
  return null;
}

async function readFreeGrant(account) {
  if (!storageConfigured()) return null;
  const field = encodeURIComponent(accountKey(account));
  const raw = await redis(`hget/${encodeURIComponent('doctorai:free-pro:grants')}/${field}`);
  const value = raw.result && typeof raw.result === 'object' && raw.result.value ? raw.result.value : raw.result;
  return value ? unseal(value) : null;
}

async function recordFreeGrant(account, entry) {
  if (!storageConfigured()) return false;
  const field = encodeURIComponent(accountKey(account));
  await redis(`hset/${encodeURIComponent('doctorai:free-pro:grants')}/${field}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(seal(entry))
  });
  const auditType = entry.revokedAt ? 'free-pro-revoked' : entry.redeemedAt ? 'free-pro-redeemed' : 'free-pro-issued';
  await redis(`hset/${encodeURIComponent('doctorai:audit')}/${encodeURIComponent(`${Date.now()}-${accountKey(account)}`)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(seal({ type: auditType, at: new Date().toISOString(), actor: entry.actor || 'self', accountEmail: normaliseEmail(account.email), expiresAt: entry.expiresAt || null }))
  });
  return true;
}

async function listFreeGrants() {
  if (!storageConfigured()) return { configured: false, users: [] };
  const raw = await redis(`hvals/${encodeURIComponent('doctorai:free-pro:grants')}`);
  const users = (raw.result || []).map(value => unseal(typeof value === 'object' && value.value ? value.value : value)).filter(Boolean);
  return { configured: true, users };
}

async function listAuditEntries(limit = 100) {
  if (!storageConfigured()) return { configured: false, entries: [] };
  const raw = await redis(`hvals/${encodeURIComponent('doctorai:audit')}`);
  const entries = (raw.result || [])
    .map(value => unseal(typeof value === 'object' && value.value ? value.value : value))
    .filter(Boolean)
    .sort((left, right) => String(right.at || '').localeCompare(String(left.at || '')))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 100)));
  return { configured: true, entries };
}

async function revokeFreeGrant(account, actor) {
  if (!storageConfigured()) return { found: false, revoked: false };
  const grant = await readFreeGrant(account);
  if (!grant) return { found: false, revoked: false };
  const revoked = {
    ...grant,
    revokedAt: new Date().toISOString(),
    revokedBy: normaliseEmail(actor?.email),
    actor: normaliseEmail(actor?.email) || 'staff-admin'
  };
  await recordFreeGrant(account, revoked);
  const entitlement = await readStoredEntitlement(account);
  // Revoking a complimentary grant must never downgrade a separate paid plan.
  if (entitlement && ['promotional-code', 'staff-grant'].includes(String(entitlement.source))) {
    await hset('accounts', account, 'entitlement', seal({ tier: 'free', source: 'staff-revoked', email: normaliseEmail(account.email), revokedAt: revoked.revokedAt, updatedAt: Date.now() }));
  }
  return { found: true, revoked: true };
}

function memoryRateLimit(request, scope, maximum, windowMs) {
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const key = `${scope}:${forwarded || request.socket?.remoteAddress || 'unknown'}`;
  const now = Date.now();
  const existing = memoryLimits.get(key);
  const next = !existing || existing.resetAt <= now ? { count: 1, resetAt: now + windowMs } : { count: existing.count + 1, resetAt: existing.resetAt };
  memoryLimits.set(key, next);
  if (memoryLimits.size > 1000) for (const [storedKey, value] of memoryLimits) if (value.resetAt <= now) memoryLimits.delete(storedKey);
  return { allowed: next.count <= maximum, retryAfter: Math.max(1, Math.ceil((next.resetAt - now) / 1000)) };
}

async function rateLimit(request, scope, maximum, windowMs) {
  const safeMaximum = Math.max(1, Math.min(10_000, Number(maximum) || 1));
  const safeWindowMs = Math.max(1_000, Math.min(24 * 60 * 60 * 1000, Number(windowMs) || 60_000));
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || request.socket?.remoteAddress || 'unknown';
  const bucket = Math.floor(Date.now() / safeWindowMs);
  const key = `doctorai:rate-limit:v1:${hash(`${scope}:${address}:${bucket}`).slice(0, 48)}`;

  if (storageConfigured()) {
    try {
      const result = await redis('pipeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['PEXPIRE', key, safeWindowMs + 5_000]
        ])
      });
      const count = Number(Array.isArray(result) ? result[0]?.result : NaN);
      if (Number.isFinite(count)) {
        const remainingMs = safeWindowMs - (Date.now() % safeWindowMs);
        return { allowed: count <= safeMaximum, retryAfter: Math.max(1, Math.ceil(remainingMs / 1000)), source: 'durable' };
      }
    } catch {
      // Authentication and account APIs already fail closed when secure storage
      // is unavailable. A bounded in-process fallback keeps local development
      // and non-account error paths protected without exposing health details.
    }
  }

  return { ...memoryRateLimit(request, scope, safeMaximum, safeWindowMs), source: 'memory' };
}

function isAdmin(account) {
  return Boolean(account && ADMIN_EMAILS.has(normaliseEmail(account.email)));
}

function validHealthState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = ['medications', 'appointments', 'timeline', 'documents', 'measurements', 'tasks', 'profile', 'memoryEnabled', 'memoryDetails'];
  if (Object.keys(value).some(key => !allowed.includes(key))) return false;
  const serialized = JSON.stringify(value);
  if (serialized.length > 240000) return false;
  return ['medications', 'appointments', 'timeline', 'documents', 'measurements', 'tasks', 'memoryDetails'].every(key => !value[key] || Array.isArray(value[key])) && (!value.profile || typeof value.profile === 'object');
}

module.exports = {
  ADMIN_EMAILS,
  accountKey,
  activeEntitlement,
  activateSession,
  clearEntitlementCookies,
  clearSession,
  configured,
  createMobileToken,
  createSession,
  deleteDocumentMetadata,
  deleteHealthState,
  entitlementFromCookies,
  hdel,
  hget,
  hset,
  hvals,
  googleClientId,
  identityFromRequest,
  isAdmin,
  json,
  listAuditEntries,
  listFreeGrants,
  listDocumentMetadata,
  noStore,
  normaliseEmail,
  nowSeconds,
  rateLimit,
  reportError,
  readFreeGrant,
  readHealthState,
  readDocumentMetadata,
  readStoredEntitlement,
  recordFreeGrant,
  revokeFreeGrant,
  revokeSession,
  saveEntitlement,
  saveDocumentMetadata,
  saveHealthState,
  sessionCookie,
  sealBuffer,
  setEntitlementCookie,
  signedToken,
  storageConfigured,
  unsealBuffer,
  validHealthState,
  verifyGoogleCredential
};
