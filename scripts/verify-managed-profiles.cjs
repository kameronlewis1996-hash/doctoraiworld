'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { installTestStore, responseRecorder } = require('./managed-profile-test-store.cjs');
const store = installTestStore();
const core = require('../server-src/_lib/doctorai-core.cjs');
const profiles = require('../server-src/health/profiles.js');
const health = require('../server-src/health/state.js');
const documents = require('../api/documents.js');
const chat = require('../api/chat.js');
const medication = require('../api/medication/[...action].js');
const safety = require('../api/medication/safety.js');
const syntheticState = name => ({ medications: [{ name: `${name} medicine` }], appointments: [{ title: `${name} appointment` }], providers: [], timeline: [{ type: 'symptom', title: `${name} symptom` }], documents: [], measurements: [{ value: name }], tasks: [{ title: name }], profile: { name, allergies: `${name} allergy`, notes: `${name} note`, medicationSafetyTerms: { allergies: [{ id: 'DB00001', name }] } }, memoryEnabled: true, memoryDetails: [name] });
async function call(handler, account, method, body, profileId, query = {}) {
  if (handler === health && method === 'PUT' && account && body?.state) body = { ...body, revision: (await core.readHealthState(account, profileId === 'self' ? null : profileId))?.revision || null };
  const req = { method, headers: account ? { cookie: `doctorai_session=${core.signedToken(account)}` } : {}, query, body };
  if (profileId !== undefined) req.headers['x-doctorai-profile'] = profileId;
  const res = responseRecorder(); await handler(req, res); return res;
}
(async () => {
  const owner = core.createSession({ sub: 'synthetic-a', email: 'account-a@example.invalid' });
  const other = core.createSession({ sub: 'synthetic-b', email: 'account-b@example.invalid' });
  await core.activateSession(owner); await core.activateSession(other);
  const pro = { tier: 'pro', exp: core.nowSeconds() + 3600, source: 'synthetic-test' };
  await core.saveEntitlement(owner, pro); await core.saveEntitlement(other, pro);
  assert.equal((await call(profiles, null, 'GET')).statusCode, 401);
  const creationId = randomUUID();
  const body = { creationId, name: 'Cedar', relationship: 'Parent', authorityBasis: 'adult_permission_or_authority', authorityConfirmed: true };
  for (const confirmation of [undefined, false, 'true', 1]) assert.equal((await call(profiles, owner, 'POST', { creationId: randomUUID(), name: 'Blocked', authorityBasis: 'adult_permission_or_authority', authorityConfirmed: confirmation })).statusCode, 400, 'Authority confirmation is enforced by the API.');
  const duplicate = await Promise.all([call(profiles, owner, 'POST', body), call(profiles, owner, 'POST', body)]);
  assert.deepEqual(duplicate.map(result => result.statusCode), [201, 201]);
  const cedar = duplicate[0].body.profile.id;
  for (const authorityBasis of [undefined, 'friend_of_child', 'parent', true]) assert.equal((await call(profiles, owner, 'POST', { creationId: randomUUID(), name: 'Blocked', authorityBasis, authorityConfirmed: true })).statusCode, 400, 'A valid authority basis is required.');
  const river = (await call(profiles, owner, 'POST', { creationId: randomUUID(), name: 'River', authorityBasis: 'parent_or_legal_guardian', authorityConfirmed: true })).body.profile.id;
  const otherId = (await call(profiles, other, 'POST', { creationId: randomUUID(), name: 'Birch', authorityBasis: 'adult_permission_or_authority', authorityConfirmed: true })).body.profile.id;
  assert.ok((await core.readManagedProfile(owner, cedar)).authorityConfirmedAt);
  assert.equal((await core.readManagedProfile(owner, cedar)).authorityBasis, 'adult_permission_or_authority');
  assert.equal((await core.readManagedProfile(owner, river)).authorityBasis, 'parent_or_legal_guardian');
  assert.ok(!(await core.readManagedProfile(owner, river)).dateOfBirth, 'No DOB is required or stored.');
  assert.equal((await call(profiles, owner, 'PATCH', { id: river, authorityBasis: 'adult_permission_or_authority' })).statusCode, 400, 'Child authority cannot be reclassified by a forged profile edit.');
  assert.equal((await call(profiles, owner, 'GET')).body.profiles.length, 2, 'Repeated/concurrent submission must create one profile.');
  assert.equal((await call(profiles, owner, 'POST', { ...body, ownerKey: core.accountKey(other) })).statusCode, 400);
  assert.equal((await call(profiles, owner, 'POST', { creationId: randomUUID(), name: '', authorityBasis: 'adult_permission_or_authority', authorityConfirmed: true })).statusCode, 400);
  assert.equal((await call(profiles, owner, 'PATCH', { id: otherId, name: 'Intrusion' })).statusCode, 404);
  assert.equal((await call(profiles, other, 'PATCH', { id: cedar, archived: true })).statusCode, 404);
  for (const id of ['../self', '', ['self'], 'person-crafted']) assert.equal((await call(health, owner, 'GET', null, id)).statusCode, 400);
  assert.equal((await call(health, owner, 'GET', null, cedar, { profileId: river })).statusCode, 400);
  for (const [id, name] of [[undefined, 'Self'], [cedar, 'Cedar'], [river, 'River']]) {
    assert.equal((await call(health, owner, 'PUT', { state: syntheticState(name) }, id)).statusCode, 200);
    assert.deepEqual((await call(health, owner, 'GET', null, id)).body.state, syntheticState(name));
  }
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await call(health, other, method, { state: syntheticState('Intrusion') }, cedar)).statusCode, 404);
  for (const id of [undefined, cedar, river]) {
    const result = await call(documents, owner, 'POST', { name: `synthetic-${id || 'self'}.txt`, data: 'data:text/plain;base64,c3ludGhldGlj' }, id);
    assert.equal(result.statusCode, 201);
    const docId = result.body.document.id;
    assert.equal((await call(documents, owner, 'GET', null, id)).body.documents.length, 1);
    assert.equal((await call(documents, other, 'GET', null, id, { id: docId })).statusCode, id ? 404 : 404);
    assert.equal((await call(documents, owner, 'GET', null, id === cedar ? river : cedar, { id: docId })).statusCode, 404);
    assert.equal((await call(documents, owner, 'GET', null, id, { id: docId })).body.toString(), 'synthetic');
  }
  const selfDocs = (await call(documents, owner, 'GET')).body.documents;
  assert.equal((await call(chat, other, 'POST', { messages: [] }, cedar)).statusCode, 404);
  assert.equal((await call(medication, other, 'POST', {}, cedar, { action: 'scan' })).statusCode, 404);
  assert.equal((await call(medication, owner, 'POST', {}, cedar, { action: 'safety-check' })).statusCode, 409, 'External checks remain unavailable for managed profiles.');
  assert.equal((await call(safety, other, 'POST', { consent: true, medications: ['synthetic'] }, cedar)).statusCode, 404);
  assert.equal((await call(safety, owner, 'POST', { consent: true, medications: ['synthetic'] }, cedar)).statusCode, 200);
  assert.equal((await call(profiles, owner, 'PATCH', { id: cedar, name: 'Cedar Updated', relationship: '' })).statusCode, 200);
  assert.equal((await call(profiles, owner, 'PATCH', { id: cedar, archived: true })).statusCode, 200);
  assert.equal((await call(health, owner, 'PUT', { state: syntheticState('Blocked') }, cedar)).statusCode, 409);
  assert.equal((await call(health, owner, 'GET', null, cedar)).statusCode, 200, 'Archive preserves deliberate access.');
  assert.equal((await call(profiles, owner, 'PATCH', { id: cedar, archived: false })).statusCode, 200);
  for (const entitlement of [{ tier: 'free' }, { ...pro, exp: core.nowSeconds() - 1 }, { ...pro, revokedAt: Date.now() }]) {
    await core.saveEntitlement(owner, entitlement);
    assert.equal((await call(profiles, owner, 'POST', { creationId: randomUUID(), name: 'Blocked' })).statusCode, 403);
    assert.equal((await call(profiles, owner, 'PATCH', { id: cedar, name: 'Blocked' })).statusCode, 403);
    assert.equal((await call(health, owner, 'PUT', { state: syntheticState('Blocked') }, cedar)).statusCode, 403);
    assert.equal((await call(health, owner, 'GET', null, cedar)).statusCode, 200);
    assert.equal((await call(documents, owner, 'GET', null, cedar)).body.documents.length, 1);
    assert.equal((await call(health, owner, 'PUT', { state: syntheticState('Self') })).statusCode, 200, 'Free self records remain unchanged.');
  }
  const switchedRequest = { method: 'PUT', headers: { cookie: `doctorai_session=${core.signedToken(other)}`, 'x-doctorai-account': core.accountKey(owner) }, body: { state: syntheticState('Stale tab') }, query: {} };
  const switchedResponse = responseRecorder(); await health(switchedRequest, switchedResponse); assert.equal(switchedResponse.statusCode, 409, 'A stale tab must not upload the previous account’s self data to the new session.');
  const staleRequest = { method: 'POST', headers: { cookie: `doctorai_session=${core.signedToken(owner)}; doctorai_entitlement=${core.signedToken({ ...pro, email: owner.email })}` }, body: { creationId: randomUUID(), name: 'Blocked' }, query: {} };
  const staleResponse = responseRecorder(); await profiles(staleRequest, staleResponse); assert.equal(staleResponse.statusCode, 403, 'A stale signed Pro cookie cannot bypass durable revocation.');
  assert.equal((await call(profiles, owner, 'PATCH', { id: cedar, archived: true })).statusCode, 200);
  assert.equal((await call(profiles, owner, 'PATCH', { id: cedar, archived: false })).statusCode, 403);
  const cedarDoc = (await call(documents, owner, 'GET', null, cedar)).body.documents[0];
  // Archived + Free deletion is deliberately allowed, but general writes stay
  // gated. Seed references as the existing Pro upload flow would have saved.
  const deletionState = syntheticState('Cedar');
  deletionState.documents = [{ id: cedarDoc.id, title: cedarDoc.name }, { id: 'keep-document', title: 'Keep' }];
  deletionState.timeline.push({ source: 'document', documentId: cedarDoc.id, description: cedarDoc.name }, { source: 'document', description: cedarDoc.name }, { source: 'document', documentId: 'keep-document', description: 'Keep' });
  await core.saveHealthState(owner, deletionState, cedar);
  assert.equal((await call(documents, owner, 'DELETE', null, cedar, { id: cedarDoc.id })).statusCode, 200);
  const reloaded = (await call(health, owner, 'GET', null, cedar)).body.state;
  assert.deepEqual(reloaded.documents, [{ id: 'keep-document', title: 'Keep' }], 'Deleted document must stay absent after scoped reload.');
  assert.deepEqual(reloaded.timeline, [deletionState.timeline[0], { source: 'document', documentId: 'keep-document', description: 'Keep' }], 'Remove identified and legacy upload references, preserving unrelated timeline.');
  assert.equal((await call(documents, owner, 'GET', null, cedar)).body.documents.length, 0);
  assert.deepEqual(reloaded.profile, deletionState.profile, 'Deletion cannot rewrite arbitrary health fields.');
  assert.equal((await call(health, owner, 'PUT', { state: syntheticState('Blocked') }, cedar)).statusCode, 409);
  assert.equal((await call(health, owner, 'DELETE', null, cedar)).statusCode, 200);
  assert.deepEqual((await call(health, owner, 'GET', null, river)).body.state, syntheticState('River'));
  assert.deepEqual((await call(health, owner, 'GET')).body.state, syntheticState('Self'));
  assert.deepEqual((await call(documents, owner, 'GET')).body.documents, selfDocs);
  await core.revokeSession(owner);
  assert.equal((await call(health, owner, 'GET', null, river)).statusCode, 401);
  assert.ok([...store.hashes.values()].flatMap(hash => [...hash.values()]).every(value => !JSON.stringify(value).includes('Cedar allergy')), 'Persisted data must be encrypted.');
  console.log('Managed profile verification passed: real session signing/encryption with mocked storage; ownership, two-person/self isolation, documents, durable read-only deletion cleanup, atomic retries, archive/restore, Free/expired/revoked gates, no paid calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
