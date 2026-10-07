'use strict';

const assert = require('node:assert/strict');

process.env.AUTH_SECRET = 'synthetic-test-secret-for-account-deletion';
process.env.KV_REST_API_URL = 'https://example.invalid';
process.env.KV_REST_API_TOKEN = 'synthetic-test-token';

const hashes = new Map();
const getHash = key => {
  if (!hashes.has(key)) hashes.set(key, new Map());
  return hashes.get(key);
};

global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const [command, key, field] = url.pathname.slice(1).split('/').map(decodeURIComponent);
  let result = null;
  if (command === 'hset') {
    const values = getHash(key);
    const value = JSON.parse(options.body || 'null');
    values.set(field, value);
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

const core = require('../server-src/_lib/doctorai-core.cjs');

(async () => {
  const account = { email: 'synthetic.delete@example.test' };
  const other = { email: 'synthetic.keep@example.test' };
  const session = core.createSession({ sub: 'synthetic-user', email: account.email });
  const otherSession = core.createSession({ sub: 'other-user', email: other.email });
  assert.equal(await core.activateSession(session), true);
  assert.equal(await core.activateSession(otherSession), true);
  assert.equal(await core.saveHealthState(account, { profile: { name: 'Synthetic record' } }), true);
  assert.equal(await core.saveEntitlement(account, { tier: 'pro', source: 'stripe', subscriptionId: 'sub_syntheticOld' }), true);
  assert.equal(await core.savePendingCheckoutSession(account, 'cs_syntheticPending'), true);
  assert.equal(await core.saveDocumentMetadata(account, {
    id: 'doc-synthetic-1', blobPath: `doctorai-private/${core.accountKey(account)}/doc-synthetic-1.enc`, createdAt: Date.now()
  }), true);
  assert.equal(await core.recordFreeGrant(account, { email: account.email, issuedAt: new Date().toISOString() }), true);

  const signedRequest = { headers: { cookie: `doctorai_session=${core.signedToken(session)}` } };
  const otherRequest = { headers: { cookie: `doctorai_session=${core.signedToken(otherSession)}` } };
  assert.ok(await core.identityFromRequest(signedRequest));
  assert.ok(await core.identityFromRequest(otherRequest));

  const deletedBlobs = [];
  let failOnce = true;
  const blobStorage = {
    list: async () => ({ blobs: [{ pathname: `doctorai-private/${core.accountKey(account)}/doc-synthetic-1.enc` }, { pathname: `doctorai-private/${core.accountKey(account)}/orphan-synthetic.enc` }], hasMore: false }),
    del: async paths => {
      if (failOnce) { failOnce = false; throw new Error('synthetic blob deletion interruption'); }
      deletedBlobs.push(...paths);
    }
  };
  await assert.rejects(core.deleteAccountData(account, ['sub_syntheticOld'], blobStorage), /synthetic blob deletion interruption/);
  assert.equal((await core.accountDeletionStatus(account)).status, 'processing');
  assert.equal(await core.identityFromRequest(signedRequest), null, 'An interrupted deletion must block the account session.');
  assert.equal(await core.saveHealthState(account, { profile: { name: 'Late synthetic write' } }), false, 'An interrupted deletion must block health writes.');

  const result = await core.deleteAccountData(account, ['sub_syntheticOld'], blobStorage);
  assert.equal(result.deleted, true);
  assert.equal(result.documentsDeleted, 1);
  assert.equal((await core.accountDeletionStatus(account)).status, 'deleted');
  assert.equal(await core.readHealthState(account), null);
  assert.equal(await core.readStoredEntitlement(account), null);
  assert.deepEqual(await core.listDocumentMetadata(account), []);
  assert.deepEqual(await core.listPendingCheckoutSessions(account), []);
  assert.equal(await core.readFreeGrant(account), null);
  assert.deepEqual(deletedBlobs.sort(), [
    `doctorai-private/${core.accountKey(account)}/doc-synthetic-1.enc`,
    `doctorai-private/${core.accountKey(account)}/orphan-synthetic.enc`
  ].sort(), 'Account deletion must also remove orphaned private blobs without metadata.');
  assert.equal(await core.identityFromRequest(signedRequest), null);
  assert.ok(await core.identityFromRequest(otherRequest), 'Deleting one synthetic account must preserve a different account.');
  assert.equal(await core.isDeletedSubscription('sub_syntheticOld'), true);
  assert.equal(await core.saveEntitlement(account, { tier: 'pro', subscriptionId: 'sub_syntheticOld' }), false);
  assert.equal(await core.saveEntitlement(account, { tier: 'pro', subscriptionId: 'sub_syntheticNew' }), false, 'Deleted accounts must not be reactivated by new entitlement writes.');
  assert.equal((await core.listAuditEntries()).entries.some(entry => entry.accountEmail === account.email), false, 'Account-specific audit entries must be removed.');
  console.log('Synthetic account-deletion verification passed (interrupted retry, session revocation, scoped data removal, and Stripe tombstones).');
})().catch(error => { console.error(error); process.exit(1); });
