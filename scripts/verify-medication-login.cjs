'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Controller, issues } = require('../medication-check-controller.js');
const { review } = require('../server-src/medication/safety-engine.cjs');
const core = require('../server-src/_lib/doctorai-core.cjs');
const auth = require('../api/auth/google.js');
const version = require('../data/medication/medication-safety.seed.json').ruleset.version;
const clone = value => JSON.parse(JSON.stringify(value));
const context = { owner: 'fictional-account', profileIdentity: 'fictional-profile', loginId: 'a'.repeat(64),
  allowed: true, storageAllowed: true, rulesVersion: version,
  payload: { medications: [{ name: 'ibuprofen', dose: '200 mg' }, { name: 'warfarin', dose: '1 mg' }], allergies: [], conditions: [] } };
async function settleUntil(condition) { for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('Synthetic operation did not start'); }

(async () => {
  let saved = null, calls = 0, release, slow = false, fail = false, now = Date.now();
  const options = { load: () => clone(saved), save: value => { saved = clone(value); }, remove: () => { saved = null; }, now: () => now,
    request: async payload => { calls++; if (slow) await new Promise(resolve => { release = resolve; }); if (fail) throw new Error('Synthetic check unavailable'); return review(payload); } };
  let controller = new Controller(options);
  await controller.update(context); await controller.setConsent(true); assert.equal(calls, 0);
  await controller.run(); assert.equal(calls, 1);
  const originalTime = controller.snapshot().checkedAt;
  controller = new Controller(options); await controller.update(context); assert.equal(calls, 1, 'Same session reload reuses completed login check');
  slow = true;
  const next = { ...context, loginId: 'b'.repeat(64) };
  const updating = controller.update(next); await settleUntil(() => calls === 2);
  assert.equal(controller.snapshot().status, 'pending'); assert.equal(controller.snapshot().checkedAt, originalTime);
  assert.ok(issues(controller.snapshot().result).some(alert => alert.ruleId === 'warfarin-nsaid'), 'Prior matching warning remains visible while login refresh is pending');
  await controller.update(next); await controller.update(next); assert.equal(calls, 2, 'Repeated auth notifications do not duplicate requests');
  now += 1000; release(); await updating; assert.equal(controller.snapshot().checkedAt, now); assert.equal(controller.snapshot().status, 'complete');
  slow = false; fail = true;
  await controller.update({ ...next, loginId: 'c'.repeat(64) }); assert.equal(calls, 3);
  assert.equal(controller.snapshot().status, 'unavailable'); assert.equal(controller.snapshot().result, null); assert.equal(controller.snapshot().checkedAt, null);
  controller = new Controller(options); await controller.update({ ...next, loginId: 'c'.repeat(64) }); assert.equal(calls, 3, 'Reload does not retry a failed login check'); assert.equal(controller.snapshot().status, 'unavailable');
  fail = false; await controller.update({ ...next, loginId: 'd'.repeat(64) }); assert.equal(calls, 4, 'A distinct successful login can check again after a prior failure');
  slow = true; const revoked = controller.update({ ...next, loginId: 'e'.repeat(64) }); await settleUntil(() => calls === 5);
  await controller.setConsent(false); release(); await revoked; assert.equal(controller.snapshot().result, null); assert.equal(saved, null);
  await controller.update({ ...next, loginId: 'f'.repeat(64) }); assert.equal(calls, 5, 'New login cannot resurrect revoked consent');
  slow = false; await controller.setConsent(true); await controller.run();
  const beforeSwitch = calls; await controller.update({ ...next, owner: 'another-fictional-account', loginId: 'g'.repeat(64) });
  assert.equal(calls, beforeSwitch); assert.equal(controller.snapshot().consent, false); assert.equal(controller.snapshot().result, null);
  // A login check racing with a list edit or another login cannot overwrite the newer result.
  for (const change of ['inputs', 'login', 'profile']) {
    const releases = []; let count = 0;
    const racer = new Controller({ request: payload => { count++; return new Promise(resolve => releases.push(() => resolve(review(payload)))); } });
    await racer.update({ ...context, storageAllowed: false }); await racer.setConsent(true);
    const first = racer.run(); assert.equal(count, 1);
    const changed = change === 'inputs' ? { ...context, payload: { ...context.payload, medications: [{ name: 'paracetamol', dose: '500 mg' }] } }
      : change === 'profile' ? { ...context, profileIdentity: 'another-fictional-profile' } : { ...context, loginId: 'b'.repeat(64) };
    const second = racer.update({ ...changed, storageAllowed: false });
    if (change === 'profile') { await second; assert.equal(count, 1); }
    else { await settleUntil(() => count === 2); releases[1](); await second; }
    releases[0](); await first;
    if (change === 'profile') assert.equal(racer.snapshot().result, null);
    else { assert.equal(racer.snapshot().status, 'complete'); assert.equal(racer.snapshot().result.resolved.length, change === 'inputs' ? 1 : 2); }
  }

  // The auth marker is stable for a durable session, differs on a new login, and is not a credential.
  const original = Object.fromEntries(['identityFromRequest', 'configured', 'storageConfigured', 'rateLimit', 'verifyGoogleCredential', 'createSession', 'activateSession', 'sessionCookie'].map(key => [key, core[key]]));
  try {
    let session = { sid: 'fictional-private-session-a', email: 'fictional@example.invalid', name: 'Fictional' };
    Object.assign(core, { identityFromRequest: async () => session, configured: () => true, storageConfigured: () => true,
      rateLimit: async () => ({ allowed: true }), verifyGoogleCredential: async () => ({ ...session }),
      createSession: () => (session = { ...session, sid: 'fictional-private-session-b' }), activateSession: async () => true, sessionCookie: () => {} });
    const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
    const first = response(), repeated = response(), login = response();
    await auth({ method: 'GET' }, first); await auth({ method: 'GET' }, repeated);
    assert.match(first.body.medicationLoginId, /^[a-f0-9]{64}$/); assert.equal(first.body.medicationLoginId, repeated.body.medicationLoginId);
    assert.ok(!JSON.stringify(first.body).includes(session.sid));
    await auth({ method: 'POST', body: { credential: 'fictional-not-a-google-credential' } }, login);
    assert.notEqual(login.body.medicationLoginId, first.body.medicationLoginId); assert.equal(login.code, 200);
  } finally { Object.assign(core, original); }

  // Duplicate Google callback events coalesce; an older session GET cannot undo a successful login.
  const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
  let finishGet, finishPost, posts = 0; const rendered = [];
  const sandbox = vm.createContext({ accountSessionRevision: 0, accountSessionReady: false, entitlementReady: false, authUser: null, googleCredentialInFlight: false,
    renderAccountSession: user => rendered.push(user?.email || ''), refreshMedicationCheckContext: async () => {}, loadEntitlement: async () => {},
    closeGoogleSignIn() {}, showToast() {}, setGoogleSigninStatus() {},
    fetch: async (url, options) => { assert.equal(url, '/api/auth/google'); if (options.method === 'POST') { posts++; return new Promise(resolve => { finishPost = resolve; }); } return new Promise(resolve => { finishGet = resolve; }); } });
  vm.runInContext(source.slice(source.indexOf('  async function loadAccountSession('), source.indexOf('  async function loadEntitlement(')) + source.slice(source.indexOf('  async function handleGoogleCredential('), source.indexOf('  function openGoogleSignIn(')), sandbox);
  const oldGet = sandbox.loadAccountSession();
  const login = sandbox.handleGoogleCredential({ credential: 'fictional-not-a-google-credential' });
  await sandbox.handleGoogleCredential({ credential: 'fictional-not-a-google-credential' }); assert.equal(posts, 1);
  finishPost({ ok: true, json: async () => ({ user: { email: 'new-fictional@example.invalid' }, medicationLoginId: 'b'.repeat(64) }) }); await login;
  finishGet({ ok: true, json: async () => ({ authenticated: true, user: { email: 'old-fictional@example.invalid' }, medicationLoginId: 'a'.repeat(64) }) }); await oldGet;
  assert.deepEqual(rendered, ['new-fictional@example.invalid']); assert.equal(sandbox.googleCredentialInFlight, false);
  // Sign-out during either auth POST or entitlement refresh must suppress late login rendering.
  for (const phase of ['auth', 'entitlement']) {
    rendered.length = 0; sandbox.authUser = { email: 'same-fictional@example.invalid' };
    let finishEntitlement; sandbox.loadEntitlement = () => new Promise(resolve => { finishEntitlement = resolve; });
    const pendingLogin = sandbox.handleGoogleCredential({ credential: 'fictional-not-a-google-credential' });
    if (phase === 'auth') sandbox.accountSessionRevision++;
    finishPost({ ok: true, json: async () => ({ user: { email: 'same-fictional@example.invalid' }, medicationLoginId: 'c'.repeat(64) }) });
    if (phase === 'entitlement') { await settleUntil(() => !!finishEntitlement); sandbox.accountSessionRevision++; finishEntitlement(); }
    await pendingLogin; assert.deepEqual(rendered, [], 'Late login cannot restore the account after sign-out');
  }
  console.log('Medication login verification passed: one check per session, new login refresh, prior warning while updating, fresh time, failure/reload, consent/account/profile isolation, stale-response races, non-credential marker and duplicate auth callbacks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
