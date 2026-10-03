'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { installTestStore, responseRecorder } = require('./managed-profile-test-store.cjs');
installTestStore();
const storageFetch = global.fetch;
const core = require('../server-src/_lib/doctorai-core.cjs');
const profiles = require('../server-src/health/profiles.js');
const chat = require('../api/chat.js');
const scan = require('../api/medication/[...action].js');
const providerCalls = [];
let forceStreamFallback = false;
process.env.OPENAI_API_KEY = 'synthetic-mocked-key-only';
global.fetch = async (url, options) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') return storageFetch(url, options);
  const body = JSON.parse(options.body); providerCalls.push(body);
  if (forceStreamFallback && body.stream) return new Response('data: {"type":"response.failed"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const answer = body.text ? JSON.stringify({ name: 'Synthetic label medicine', dose: '10 mg' }) : 'Synthetic educational answer';
  return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: answer }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
async function call(handler, account, profileId, body, extraHeaders = {}) {
  const response = responseRecorder();
  response.write = chunk => { response.events = (response.events || '') + chunk; };
  response.end = () => { response.ended = true; };
  await handler({ method: 'POST', headers: { cookie: `doctorai_session=${core.signedToken(account)}`, 'x-doctorai-profile': profileId, ...extraHeaders }, query: handler === scan ? { action: 'scan' } : {}, body }, response);
  return response;
}
(async () => {
  const owner = core.createSession({ sub: 'ai-a', email: 'ai-a@example.invalid' });
  const other = core.createSession({ sub: 'ai-b', email: 'ai-b@example.invalid' });
  await core.activateSession(owner); await core.activateSession(other);
  await core.saveEntitlement(owner, { tier: 'pro', exp: core.nowSeconds() + 3600 });
  const ids = [];
  for (const name of ['Cedar', 'River']) {
    const response = await call(profiles, owner, 'self', { creationId: randomUUID(), name, authorityBasis: 'adult_permission_or_authority', authorityConfirmed: true });
    const id = response.body.profile.id; ids.push(id);
    await core.saveHealthState(owner, { profile: { allergies: `${name}-allergy` }, medications: [{ name: `${name}-medicine` }], memoryEnabled: true, memoryDetails: [`Approved ${name}-allergy`, `Approved ${name}-medicine`] }, id);
  }
  await core.saveHealthState(owner, { memoryEnabled: true, memoryDetails: ['Owner-allergy', 'Owner-medicine'] });
  const question = { consent: true, managedActionConsent: true, messages: [{ role: 'user', content: 'Help organise a question for a pharmacist.' }], memory: ['Owner-allergy', 'Other-profile-allergy'] };
  for (let i = 0; i < ids.length; i++) {
    const response = await call(chat, owner, ids[i], { ...question, stream: i === 1 });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['X-DoctorAI-Profile'], ids[i]);
    const payload = providerCalls.at(-1);
    assert.equal(payload.store, false, 'Streaming and non-streaming chat explicitly opt out of Responses application-state storage.');
    assert.match(payload.instructions, new RegExp(i ? 'River-allergy' : 'Cedar-allergy'));
    assert.doesNotMatch(payload.instructions, new RegExp(i ? 'Cedar-allergy|Owner-allergy|Other-profile-allergy' : 'River-allergy|Owner-allergy|Other-profile-allergy'));
    assert.match(payload.instructions, /must not diagnose, prescribe/);
    if (i === 1) assert.match(response.events, /Synthetic educational answer/);
  }
  await core.saveHealthState(owner, { memoryEnabled: false, memoryDetails: ['Do-not-send-Cedar'] }, ids[0]);
  assert.equal((await call(chat, owner, ids[0], question)).statusCode, 200);
  assert.doesNotMatch(JSON.stringify(providerCalls.at(-1)), /Do-not-send-Cedar|Owner-allergy|Other-profile-allergy/);
  forceStreamFallback = true;
  let start = providerCalls.length;
  const fallback = await call(chat, owner, ids[1], { ...question, stream: true });
  assert.match(fallback.events, /Synthetic educational answer/);
  assert.equal(providerCalls.length - start, 2);
  assert.ok(providerCalls.slice(start).every(payload => payload.store === false), 'The streaming fallback also opts out of Responses application-state storage.');
  forceStreamFallback = false;
  assert.equal((await call(chat, owner, 'self', question)).statusCode, 200);
  assert.equal(providerCalls.at(-1).store, false, 'Self chat uses the same explicit store:false policy.');
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S0AAAAASUVORK5CYII=';
  const scanned = await call(scan, owner, ids[0], { image, consent: true, managedActionConsent: true });
  assert.equal(scanned.statusCode, 200);
  assert.equal(scanned.body.profileId, ids[0]);
  assert.equal(scanned.body.review.required, true);
  assert.equal(providerCalls.at(-1).store, false);
  assert.doesNotMatch(JSON.stringify(providerCalls.at(-1)), /Owner-allergy|Cedar-allergy|River-allergy|Owner-medicine|Cedar-medicine|River-medicine/);
  let before = providerCalls.length;
  for (const managedActionConsent of [undefined, false, 'true']) {
    assert.equal((await call(chat, owner, ids[1], { ...question, managedActionConsent })).statusCode, 400, 'Managed adult chat needs explicit per-action consent.');
    assert.equal((await call(scan, owner, ids[1], { image, consent: true, managedActionConsent })).statusCode, 400, 'Managed adult OCR needs explicit per-action consent.');
  }
  assert.equal((await call(scan, owner, ids[0], { image })).statusCode, 400);
  for (const handler of [chat, scan]) {
    assert.equal((await call(handler, other, ids[0], handler === chat ? question : { image, consent: true, managedActionConsent: true })).statusCode, 404);
    assert.equal((await call(handler, owner, '../self', question)).statusCode, 400);
    assert.equal((await call(handler, owner, ids[0], question, { 'x-doctorai-account': core.accountKey(other) })).statusCode, 409);
  }
  assert.equal(providerCalls.length, before, 'Invalid consent/ownership/scope must stop before the provider.');
  const child = (await call(profiles, owner, 'self', { creationId: randomUUID(), name: 'Synthetic child', authorityBasis: 'parent_or_legal_guardian', authorityConfirmed: true })).body.profile.id;
  for (const handler of [chat, scan]) {
    const denied = await call(handler, owner, child, handler === chat ? { ...question, authorityBasis: 'adult_permission_or_authority' } : { image, consent: true, managedActionConsent: true, authorityBasis: 'adult_permission_or_authority' });
    assert.equal(denied.statusCode, 409);
    assert.equal(denied.body.code, 'managed_child_ai_unavailable');
  }
  assert.equal(providerCalls.length, before, 'Child AI/OCR is blocked even with consent, before any provider request.');
  const archived = await core.readManagedProfile(owner, ids[0]);
  await core.saveManagedProfile(owner, { ...archived, archivedAt: Date.now() });
  for (const handler of [chat, scan]) assert.equal((await call(handler, owner, ids[0], question)).statusCode, 409);
  await core.saveEntitlement(owner, { tier: 'free' });
  for (const handler of [chat, scan]) assert.equal((await call(handler, owner, ids[1], question)).statusCode, 403);
  assert.equal(providerCalls.length, before);
  console.log('Managed AI verification passed: two-profile authoritative approved memory, streaming/non-streaming chat, image-only scoped OCR with required review, forged/cross-owner/stale/Free/archived/consent gates. OpenAI and storage are mocked; zero real OCR/API calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
