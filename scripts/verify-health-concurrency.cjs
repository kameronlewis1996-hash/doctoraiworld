'use strict';
// Deterministic synthetic interleavings exercise actual handlers and encrypted
// state, with an in-memory CAS transport. No real Redis/Blob/provider is used.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { installTestStore, responseRecorder } = require('./managed-profile-test-store.cjs');
const realRedis = Boolean(process.env.DOCTORAI_REDIS_TEST_CONTAINER);
const redisCommand = realRedis ? require('./local-redis-test-command.cjs').localRedisCommand(process.env.DOCTORAI_REDIS_TEST_CONTAINER) : null;
const store = installTestStore({ redisCommand });
const core = require('../server-src/_lib/doctorai-core.cjs');
const health = require('../server-src/health/state.js');
const documents = require('../api/documents.js');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const owner = core.createSession({ sub: 'atomic-owner', email: 'atomic-owner@example.invalid' });
const profileId = `person-${randomUUID()}`;
async function call(handler, method, body, query = {}) {
  const response = responseRecorder();
  await handler({ method, headers: { cookie: `doctorai_session=${core.signedToken(owner)}`, 'x-doctorai-profile': profileId }, body, query }, response);
  return response;
}
async function seed() {
  store.controls.beforeCas = null;
  const docs = [];
  for (const name of ['Document A', 'Document B']) {
    const response = await call(documents, 'POST', { name, data: 'data:text/plain;base64,c3ludGhldGlj' });
    docs.push(response.body.document);
  }
  const state = { profile: { notes: 'Original notes' }, medications: [{ name: 'Original medicine' }],
    documents: docs.map(doc => ({ id: doc.id, title: doc.name })),
    timeline: docs.map(doc => ({ source: 'document', documentId: doc.id, description: doc.name })) };
  await core.saveHealthState(owner, state, profileId);
  return { docs, state, revision: (await core.readHealthState(owner, profileId)).revision };
}
function holdFirstCas() {
  const entered = deferred(); const release = deferred(); let calls = 0;
  store.controls.beforeCas = async () => { if (++calls === 1) { entered.resolve(); await release.promise; } };
  return { entered: entered.promise, release: () => release.resolve() };
}
(async () => {
  await core.activateSession(owner);
  await core.saveEntitlement(owner, { tier: 'pro', exp: core.nowSeconds() + 3600 });
  await core.createManagedProfile(owner, { id: profileId, name: 'Synthetic adult', authorityConfirmedAt: Date.now(), archivedAt: null, createdAt: Date.now() });
  let data = await seed(); let hold = holdFirstCas();
  const deleteA = call(documents, 'DELETE', null, { id: data.docs[0].id });
  await hold.entered;
  const deleteB = await call(documents, 'DELETE', null, { id: data.docs[1].id });
  hold.release(); const deletedA = await deleteA;
  assert.deepEqual([deletedA.statusCode, deleteB.statusCode], [200, 200]);
  let reloaded = (await call(health, 'GET')).body;
  assert.deepEqual(reloaded.state.documents, []);
  assert.deepEqual(reloaded.state.timeline, []);
  assert.equal(reloaded.state.profile.notes, 'Original notes');
  assert.deepEqual(reloaded.state.medications, [{ name: 'Original medicine' }]);
  assert.equal((await call(health, 'PUT', { state: data.state, revision: data.revision })).statusCode, 409, 'A stale PUT after deletion cannot resurrect references.');

  // Delete snapshot is paused; PUT wins. Cleanup must retry against the new
  // medicine/notes and remove only its own references.
  data = await seed(); hold = holdFirstCas();
  const deletion = call(documents, 'DELETE', null, { id: data.docs[0].id });
  await hold.entered;
  const edited = { ...data.state, profile: { notes: 'Updated notes' }, medications: [{ name: 'Updated medicine' }] };
  const saved = await call(health, 'PUT', { state: edited, revision: data.revision });
  assert.equal(saved.statusCode, 200);
  hold.release(); assert.equal((await deletion).statusCode, 200);
  reloaded = (await call(health, 'GET')).body;
  assert.equal(reloaded.state.profile.notes, 'Updated notes');
  assert.deepEqual(reloaded.state.medications, [{ name: 'Updated medicine' }]);
  assert.deepEqual(reloaded.state.documents, [{ id: data.docs[1].id, title: data.docs[1].name }]);
  assert.deepEqual(reloaded.state.timeline, [{ source: 'document', documentId: data.docs[1].id, description: data.docs[1].name }]);

  // PUT snapshot is paused; deletion wins. Full-state replacement cannot retry
  // with a fresh revision and overwrite concurrent changes automatically.
  data = await seed(); hold = holdFirstCas();
  const put = call(health, 'PUT', { state: edited, revision: data.revision });
  await hold.entered;
  assert.equal((await call(documents, 'DELETE', null, { id: data.docs[0].id })).statusCode, 200);
  hold.release(); assert.equal((await put).statusCode, 409);
  reloaded = (await call(health, 'GET')).body;
  assert.equal(reloaded.state.profile.notes, 'Original notes');
  assert.deepEqual(reloaded.state.documents, [{ id: data.docs[1].id, title: data.docs[1].name }]);
  assert.equal((await call(health, 'PUT', { state: reloaded.state })).statusCode, 400, 'Missing revision cannot bypass concurrency control.');
  assert.equal((await call(health, 'PUT', { state: reloaded.state, revision: true })).statusCode, 400);
  store.controls.beforeCas = null;
  const concurrent = await Promise.all([call(health, 'PUT', { state: { ...reloaded.state, profile: { notes: 'First update' } }, revision: reloaded.revision }), call(health, 'PUT', { state: { ...reloaded.state, profile: { notes: 'Second update' } }, revision: reloaded.revision })]);
  assert.deepEqual(concurrent.map(result => result.statusCode).sort(), [200, 409]);
  if (realRedis) assert.ok(store.casMetrics.conflicts >= 3, 'The actual Redis Lua path must experience and safely handle conflicting snapshots.');
  console.log('Health concurrency verification passed: simultaneous document deletes, delete/PUT in both orders, preserved medication/notes, stale/missing/invalid revision rejection and two competing PUTs. Real handlers/encryption; ' + (realRedis ? 'actual local Redis Lua/CAS and durable hash commands; Blob and rate-limit pipeline mocked.' : 'Redis CAS and Blob mocked.'));
  if (realRedis) console.log(JSON.stringify({ realRedis: true, cas: store.casMetrics, externalStorageCalls: 0, realBlobCalls: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
