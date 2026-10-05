'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');

process.env.AUTH_SECRET = 'synthetic-route-test-secret';
process.env.KV_REST_API_URL = 'https://example.invalid';
process.env.KV_REST_API_TOKEN = 'synthetic-route-test-token';
process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_only';
process.env.BLOB_READ_WRITE_TOKEN = 'synthetic-blob-token';
process.env.ACCOUNT_DELETION_WORKFLOW_ENABLED = 'false';

const hashes = new Map();
const counters = new Map();
const subscriptionsByEmail = new Map();
const subscriptionsByMetadataEmail = new Map();
const paginatedSearchByEmail = new Map();
const incompleteSearchEmails = new Set();
const searchRequestsByEmail = new Map();
const sessionAccounts = new Map();
const sessionStatuses = new Map();
const expiredSessions = [];
const getHash = key => {
  if (!hashes.has(key)) hashes.set(key, new Map());
  return hashes.get(key);
};

global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.pathname === '/pipeline') {
    const commands = JSON.parse(options.body || '[]');
    const results = commands.map(([command, key]) => {
      if (command === 'INCR') {
        const value = (counters.get(key) || 0) + 1;
        counters.set(key, value);
        return { result: value };
      }
      if (command === 'PEXPIRE') return { result: 1 };
      throw new Error(`Unexpected synthetic pipeline command: ${command}`);
    });
    return { ok: true, json: async () => results };
  }
  const [command, key, field] = url.pathname.slice(1).split('/').map(decodeURIComponent);
  let result = null;
  if (command === 'hset') {
    getHash(key).set(field, JSON.parse(options.body || 'null'));
    result = 1;
  } else if (command === 'hget') {
    result = hashes.get(key)?.get(field) ?? null;
  } else if (command === 'hgetall') {
    result = Object.fromEntries(hashes.get(key) || []);
  } else if (command === 'hvals') {
    result = [...(hashes.get(key)?.values() || [])];
  } else if (command === 'hdel') {
    result = hashes.get(key)?.delete(field) ? 1 : 0;
  } else if (command === 'del') {
    result = hashes.delete(key) ? 1 : 0;
  } else {
    throw new Error(`Unexpected synthetic storage command: ${command}`);
  }
  return { ok: true, json: async () => ({ result }) };
};

class SyntheticStripe {
  constructor() {
    this.customers = { list: async ({ email }) => ({ data: [{ id: `cus_${email.replace(/[^a-z0-9]/gi, '')}`, email }], has_more: false }) };
    this.subscriptions = { list: async ({ customer }) => {
      const email = customer.replace(/^cus_/, '');
      const canonicalEmail = [...subscriptionsByEmail.keys()].find(value => value.replace(/[^a-z0-9]/gi, '') === email);
      return { data: subscriptionsByEmail.get(canonicalEmail) || [], has_more: false };
    }, search: async ({ query, page }) => {
      const match = query.match(/metadata\["account_email"\]:"((?:\\\\.|[^"])*)"/);
      const email = match?.[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const requestCount = (searchRequestsByEmail.get(email) || 0) + 1;
      searchRequestsByEmail.set(email, requestCount);
      if (incompleteSearchEmails.has(email)) return { data: [], has_more: true, next_page: `cursor-${requestCount}` };
      const pages = paginatedSearchByEmail.get(email);
      if (pages) {
        const pageIndex = page ? Number(page.replace(/^cursor-/, '')) : 0;
        return { data: pages[pageIndex] || [], has_more: pageIndex < pages.length - 1, next_page: pageIndex < pages.length - 1 ? `cursor-${pageIndex + 1}` : null };
      }
      return { data: subscriptionsByMetadataEmail.get(email) || [], has_more: false, next_page: null };
    }, retrieve: async id => ({ id, status: 'canceled', cancel_at_period_end: false }) };
    this.checkout = { sessions: {
      retrieve: async id => ({ id, status: sessionStatuses.get(id) || 'expired', metadata: { account_email: sessionAccounts.get(id) || '' }, subscription: null }),
      expire: async id => { sessionStatuses.set(id, 'expired'); expiredSessions.push(id); }
    } };
  }
}

const originalLoad = Module._load;
const deletedBlobPaths = [];
Module._load = function (request, parent, isMain) {
  if (request === 'stripe') return SyntheticStripe;
  if (request === '@vercel/blob') return { del: async paths => deletedBlobPaths.push(...paths), list: async () => ({ blobs: [], hasMore: false }) };
  return originalLoad.call(this, request, parent, isMain);
};
const deleteAccount = require('../server-src/staff/delete-account.js');
Module._load = originalLoad;
const core = require('../server-src/_lib/doctorai-core.cjs');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function invoke(session, body) {
  const response = responseRecorder();
  await deleteAccount({
    method: 'POST', body,
    headers: { cookie: `doctorai_session=${core.signedToken(session)}`, 'x-forwarded-for': '203.0.113.99' },
    socket: { remoteAddress: '203.0.113.99' }
  }, response);
  return response;
}

(async () => {
  const admin = core.createSession({ sub: 'synthetic-admin', email: 'kameronlewis1996@gmail.com' });
  assert.equal(await core.activateSession(admin), true);
  const activeEmail = 'synthetic-active@example.test';
  subscriptionsByEmail.set(activeEmail, [{ id: 'sub_syntheticActive', status: 'active', cancel_at_period_end: false }]);
  const blocked = await invoke(admin, { action: 'delete', email: activeEmail, requestVerified: true, retentionReviewed: true, billingReviewed: true, confirmation: `DELETE ${activeEmail}` });
  assert.equal(blocked.statusCode, 423, 'Deletion stays disabled before workflow approval.');
  assert.equal((await core.accountDeletionStatus({ email: activeEmail })).status, null);

  process.env.ACCOUNT_DELETION_WORKFLOW_ENABLED = 'true';
  const billingBlocked = await invoke(admin, { action: 'delete', email: activeEmail, requestVerified: true, retentionReviewed: true, billingReviewed: true, confirmation: `DELETE ${activeEmail}` });
  assert.equal(billingBlocked.statusCode, 409, 'Active Stripe subscriptions must block deletion.');
  assert.equal((await core.accountDeletionStatus({ email: activeEmail })).status, null);

  const changedBillingEmail = 'synthetic-changed@example.test';
  subscriptionsByMetadataEmail.set(changedBillingEmail, [{ id: 'sub_syntheticChangedBillingEmail', status: 'active', cancel_at_period_end: false, metadata: { account_email: changedBillingEmail } }]);
  const metadataBlocked = await invoke(admin, { action: 'delete', email: changedBillingEmail, requestVerified: true, retentionReviewed: true, billingReviewed: true, confirmation: `DELETE ${changedBillingEmail}` });
  assert.equal(metadataBlocked.statusCode, 409, 'Active subscriptions must be found by account metadata even after a customer billing-email change.');
  assert.equal((await core.accountDeletionStatus({ email: changedBillingEmail })).status, null);

  const paginatedEmail = 'synthetic-paged@example.test';
  paginatedSearchByEmail.set(paginatedEmail, [[], [{ id: 'sub_syntheticPageTwo', status: 'active', cancel_at_period_end: false, metadata: { account_email: paginatedEmail } }]]);
  const paginatedBlocked = await invoke(admin, { action: 'delete', email: paginatedEmail, requestVerified: true, retentionReviewed: true, billingReviewed: true, confirmation: `DELETE ${paginatedEmail}` });
  assert.equal(paginatedBlocked.statusCode, 409, 'An active metadata-linked subscription on a later search page must block deletion.');
  assert.equal(searchRequestsByEmail.get(paginatedEmail), 2, 'Search must follow Stripe next_page cursors.');

  const incompleteEmail = 'synthetic-incomplete-search@example.test';
  incompleteSearchEmails.add(incompleteEmail);
  const incomplete = await invoke(admin, { action: 'inspect', email: incompleteEmail });
  assert.equal(incomplete.statusCode, 200);
  assert.equal(incomplete.body.billing.verified, false, 'A search result set beyond the safety page cap must fail closed.');
  assert.equal(searchRequestsByEmail.get(incompleteEmail), 10, 'Search pagination must stop at its configured safety cap.');

  const cleanEmail = 'synthetic-clean@example.test';
  subscriptionsByEmail.set(cleanEmail, [{ id: 'sub_syntheticCanceled', status: 'canceled', cancel_at_period_end: false }]);
  sessionAccounts.set('cs_syntheticOpen', cleanEmail);
  sessionStatuses.set('cs_syntheticOpen', 'open');
  assert.equal(await core.savePendingCheckoutSession({ email: cleanEmail }, 'cs_syntheticOpen'), true);
  const noAttestation = await invoke(admin, { action: 'delete', email: cleanEmail, requestVerified: false, retentionReviewed: true, billingReviewed: true, confirmation: `DELETE ${cleanEmail}` });
  assert.equal(noAttestation.statusCode, 400, 'The endpoint must require staff request-verification attestation.');
  assert.equal((await core.accountDeletionStatus({ email: cleanEmail })).status, null);

  process.env.ACCOUNT_DELETION_WORKFLOW_ENABLED = 'false';
  const gated = await invoke(admin, { action: 'delete', email: cleanEmail, requestVerified: true, retentionReviewed: true, billingReviewed: true, confirmation: `DELETE ${cleanEmail}` });
  assert.equal(gated.statusCode, 423, 'The runtime environment flag must gate fulfillment.');
  assert.equal((await core.accountDeletionStatus({ email: cleanEmail })).status, null);

  process.env.ACCOUNT_DELETION_WORKFLOW_ENABLED = 'true';
  const fulfilled = await invoke(admin, { action: 'delete', email: cleanEmail, requestVerified: true, retentionReviewed: true, billingReviewed: true, confirmation: `DELETE ${cleanEmail}` });
  assert.equal(fulfilled.statusCode, 200);
  assert.equal(fulfilled.body.deleted, true);
  assert.equal((await core.accountDeletionStatus({ email: cleanEmail })).status, 'deleted');
  assert.equal(await core.isDeletedSubscription('sub_syntheticCanceled'), true);
  assert.deepEqual(expiredSessions, ['cs_syntheticOpen'], 'Open checkout links must be expired before deletion completes.');
  assert.deepEqual(await core.listPendingCheckoutSessions({ email: cleanEmail }), []);
  assert.deepEqual(deletedBlobPaths, []);
  console.log('Synthetic staff account-deletion route verification passed (feature flag, owner attestation, billing blocks, and successful flow).');
})().catch(error => { console.error(error); process.exit(1); });
