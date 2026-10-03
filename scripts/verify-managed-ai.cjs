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
process.env.OPENAI_API_KEY = 'synthetic-mocked-key-only';
global.fetch = async (url, options) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') return storageFetch(url, options);
  const body = JSON.parse(options.body); providerCalls.push(body);
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
    const response = await call(profiles, owner, 'self', { creationId: randomUUID(), name });
    const id = response.body.profile.id; ids.push(id);
    await core.saveHealthState(owner, { profile: { allergies: `${name}-allergy` }, medications: [{ name: `${name}-medicine` }], memoryEnabled: true, memoryDetails: [`Approved ${name}-allergy`, `Approved ${name}-medicine`] }, id);
  }
  await core.saveHealthState(owner, { memoryEnabled: true, memoryDetails: ['Owner-allergy', 'Owner-medicine'] });
  const question = { messages: [{ role: 'user', content: 'Help organise a question for a pharmacist.' }], memory: ['Owner-allergy', 'Other-profile-allergy'] };
  for (let i = 0; i < ids.length; i++) {
    const response = await call(chat, owner, ids[i], { ...question, stream: i === 1 });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['X-DoctorAI-Profile'], ids[i]);
    const payload = providerCalls.at(-1);
    assert.match(payload.instructions, new RegExp(i ? 'River-allergy' : 'Cedar-allergy'));
    assert.doesNotMatch(payload.instructions, new RegExp(i ? 'Cedar-allergy|Owner-allergy|Other-profile-allergy' : 'River-allergy|Owner-allergy|Other-profile-allergy'));
    assert.match(payload.instructions, /must not diagnose, prescribe/);
    if (i === 1) assert.match(response.events, /Synthetic educational answer/);
  }
  await core.saveHealthState(owner, { memoryEnabled: false, memoryDetails: ['Do-not-send-Cedar'] }, ids[0]);
  assert.equal((await call(chat, owner, ids[0], question)).statusCode, 200);
  assert.doesNotMatch(JSON.stringify(providerCalls.at(-1)), /Do-not-send-Cedar|Owner-allergy|Other-profile-allergy/);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S0AAAAASUVORK5CYII=';
  const scanned = await call(scan, owner, ids[0], { image, consent: true });
  assert.equal(scanned.statusCode, 200);
  assert.equal(scanned.body.profileId, ids[0]);
  assert.equal(scanned.body.review.required, true);
  assert.equal(providerCalls.at(-1).store, false);
  assert.doesNotMatch(JSON.stringify(providerCalls.at(-1)), /Owner-allergy|Cedar-allergy|River-allergy|Owner-medicine|Cedar-medicine|River-medicine/);
  let before = providerCalls.length;
  assert.equal((await call(scan, owner, ids[0], { image })).statusCode, 400);
  for (const handler of [chat, scan]) {
    assert.equal((await call(handler, other, ids[0], handler === chat ? question : { image, consent: true })).statusCode, 404);
    assert.equal((await call(handler, owner, '../self', question)).statusCode, 400);
    assert.equal((await call(handler, owner, ids[0], question, { 'x-doctorai-account': core.accountKey(other) })).statusCode, 409);
  }
  assert.equal(providerCalls.length, before, 'Invalid consent/ownership/scope must stop before the provider.');
  const archived = await core.readManagedProfile(owner, ids[0]);
  await core.saveManagedProfile(owner, { ...archived, archivedAt: Date.now() });
  for (const handler of [chat, scan]) assert.equal((await call(handler, owner, ids[0], question)).statusCode, 409);
  await core.saveEntitlement(owner, { tier: 'free' });
  for (const handler of [chat, scan]) assert.equal((await call(handler, owner, ids[1], question)).statusCode, 403);
  assert.equal(providerCalls.length, before);
  console.log('Managed AI verification passed: two-profile authoritative approved memory, streaming/non-streaming chat, image-only scoped OCR with required review, forged/cross-owner/stale/Free/archived/consent gates. OpenAI and storage are mocked; zero real OCR/API calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
