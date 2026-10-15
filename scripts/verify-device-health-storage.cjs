'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../health-hub.js'), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Actual browser implementation exists: ${start}`);
  return source.slice(from, to);
};
const storageSource = section('  const storagePrefix =', '  const clone =');
const choiceSource = section('  function setDeviceStorage(', '  const saveState =');
const deletionSource = section('  async function deleteHealthData()', '  function handleModalSubmit(');
const controllerRemove = source.match(/    remove: (\(\) => \{ try \{ if \(medicationCheckStorageKey\) localStorage.removeItem\(medicationCheckStorageKey\); \} catch \{\} medicationCheckStorageKey = ''; \}),/);
assert.ok(controllerRemove && source.includes("medicationCheckStorageKey = localStorageKey('medication-check')"), 'The actual medication-check controller remembers the owner-scoped key before removal.');

const prefix = 'doctorai-health-hub-';
const scopeA = 'a'.repeat(64);
const scopeB = 'b'.repeat(64);
const healthKeys = [
  prefix + 'medications',
  prefix + 'profile',
  prefix + 'account-' + scopeA + '-medications',
  prefix + 'account-' + scopeA + '-medication-check',
  prefix + 'account-' + scopeB + '-allergies', // Unknown keys must be preserved.
  prefix + 'account-' + scopeB + '-medication-check',
  prefix + 'account-' + scopeB + '-profile'
];
const preferenceKey = prefix + 'profile-shortcuts';
const foreignKey = 'another-app-medications';
function fixture({ consent = 'yes', signedIn = false, failRemove = '', failConsent = false, confirmed = true, cloudFailure = false } = {}) {
  const memory = new Map([[prefix + 'device-storage-consent', consent], [preferenceKey, '["ask"]'], [foreignKey, 'private-to-another-app']]);
  for (const key of healthKeys) memory.set(key, JSON.stringify({ fictional: key }));
  const calls = { confirmations: [], statuses: [], toasts: [], fetches: [], close: 0, drafts: 0, chats: 0, consents: [], saves: 0, renders: 0 };
  const localStorage = {
    get length() { return memory.size; },
    key(index) { return [...memory.keys()][index] ?? null; },
    getItem(key) { return memory.get(key) ?? null; },
    setItem(key, value) { if (failConsent && key === prefix + 'device-storage-consent') throw new Error('Fictional storage refusal'); memory.set(key, String(value)); },
    removeItem(key) { if (key === failRemove) throw new Error('Fictional removal refusal'); memory.delete(key); }
  };
  const state = {
    medications: [{ name: 'Fictional medicine' }], appointments: [{ id: 'fictional-appointment' }], providers: [],
    timeline: [], documents: [], measurements: [], tasks: [], profile: { name: 'Fictional patient' },
    memoryEnabled: true, memoryDetails: [{ text: 'Fictional note' }]
  };
  const context = vm.createContext({
    localStorage, state, clone: value => JSON.parse(JSON.stringify(value)),
    emptyProfile: { name: '', bloodType: '', allergies: '', conditions: '', notes: '' },
    localStateUpdatedAt: 42, cloudSyncBusy: false, cloudSyncTimer: 1, cloudSyncEnabled: true,
    cloudSyncDirty: true, cloudSyncRevision: 3, accountSessionRevision: 2,
    authUser: signedIn ? { email: 'fictional@example.invalid', sub: 'fictional-account' } : null,
    storageConsent: { hidden: false },
    window: { clearTimeout() {}, confirm(message) { calls.confirmations.push(message); return confirmed; } },
    renderStorageStatus() {}, saveState() { calls.saves++; },
    setSyncStatus(message) { calls.statuses.push(message); },
    showToast(message) { calls.toasts.push(message); },
    refreshMedicationCheckContext: async () => {}, renderHomePrescriptionAlert() {},
    medicationCheckController: { async setConsent(value) { calls.consents.push(value); } },
    discardPreparationDrafts() { calls.drafts++; }, clearChat() { calls.chats++; },
    renderAll() { calls.renders++; }, closePrivacy() { calls.close++; },
    async fetch(url, options = {}) {
      calls.fetches.push([url, options.method || 'GET']);
      if (cloudFailure && url === '/api/health/state') return { ok: false, status: 503 };
      if (url === '/api/documents' && !options.method) return { ok: true, json: async () => ({ documents: [{ id: 'fictional-file' }] }) };
      return { ok: true, status: 200 };
    }
  });
  context.accountSyncScope = () => context.authUser ? `${context.accountSessionRevision}:${context.authUser.sub}:${context.authUser.email}` : '';
  vm.runInContext(storageSource + choiceSource + deletionSource + `
    let medicationCheckStorageKey = '';
    const removeMedicationCheck = ${controllerRemove[1]};
    this.api = { setDeviceStorage, deleteHealthData, removeMedicationCheck, deviceHealthStorageKeys, removeDeviceHealthData, read,
      status: () => ({ deviceStorageChoice, localStorageAllowed, localStorageRemovalFailed, cacheSize: sessionHealthStateCache.size }) };
  `, context, { timeout: 1000, filename: 'health-hub-device-storage.js' });
  return { context, memory, calls, state, api: context.api };
}

(async () => {
  const session = fixture();
  session.api.setDeviceStorage(false);
  assert.equal(session.calls.confirmations.length, 1, 'Existing saved health records require an explicit removal confirmation.');
  assert.match(session.calls.confirmations[0], /Signed-in account copies remain/, 'The prompt distinguishes browser removal from account deletion.');
  assert.equal(session.memory.get(prefix + 'device-storage-consent'), 'session');
  for (const key of healthKeys.filter(key => !key.endsWith('-allergies'))) assert.equal(session.memory.has(key), false, `${key} was removed from the browser.`);
  assert.ok(session.memory.has(prefix + 'account-' + scopeB + '-allergies'), 'Unrecognised namespaced fields are not removed.');
  assert.equal(session.memory.get(preferenceKey), '["ask"]', 'Non-health preferences remain.');
  assert.equal(session.memory.get(foreignKey), 'private-to-another-app', 'Another app is untouched.');
  assert.deepEqual(session.state.medications, [{ name: 'Fictional medicine' }], 'Session-only keeps the current in-memory view.');
  assert.equal(session.api.status().localStorageAllowed, false);
  assert.equal(session.api.status().localStorageRemovalFailed, false);

  const cancelled = fixture({ confirmed: false });
  cancelled.api.setDeviceStorage(false);
  assert.equal(cancelled.memory.get(prefix + 'device-storage-consent'), 'yes', 'Cancel preserves the prior storage choice.');
  assert.ok(cancelled.memory.has(prefix + 'medications'));
  assert.deepEqual(cancelled.calls.toasts, []);

  const failed = fixture({ failRemove: prefix + 'account-' + scopeB + '-profile' });
  failed.api.setDeviceStorage(false);
  assert.equal(failed.api.status().localStorageAllowed, false, 'A failed cleanup prevents new device writes.');
  assert.equal(failed.api.status().localStorageRemovalFailed, true, 'Removal failure remains visible in app state.');
  assert.ok(failed.memory.has(prefix + 'account-' + scopeB + '-profile'), 'The synthetic removal refusal leaves a detectable old record.');
  assert.equal(failed.memory.get(prefix + 'device-storage-consent'), 'session-cleanup-incomplete', 'The browser keeps a persistent cleanup warning.');
  assert.match(failed.calls.toasts.at(-1), /could not confirm removal/i, 'The user is not told that removal succeeded.');
  failed.api.setDeviceStorage(true);
  assert.equal(failed.api.status().localStorageAllowed, false, 'Device saving cannot resume while the old record still resists removal.');
  assert.equal(failed.calls.saves, 0);
  const reload = fixture({ consent: 'session-cleanup-incomplete' });
  assert.equal(reload.api.status().localStorageRemovalFailed, true, 'The cleanup warning survives a browser reload.');
  assert.deepEqual(Array.from(reload.api.read('medications', [])), [], 'Old health data is hidden after a failed cleanup and reload.');

  const scoped = fixture();
  vm.runInContext(`medicationCheckStorageKey = '${prefix}account-${scopeA}-medication-check'; localHealthAccountScope = '${scopeB}';`, scoped.context);
  scoped.api.removeMedicationCheck();
  assert.equal(scoped.memory.has(prefix + 'account-' + scopeA + '-medication-check'), false, 'Account switching removes the prior account check, not the newly active account check.');
  assert.ok(scoped.memory.has(prefix + 'account-' + scopeB + '-medication-check'), 'Account switching preserves the new account check.');

  const deletion = fixture({ consent: 'session' });
  vm.runInContext('sessionHealthStateCache.set("account:fictional@example.invalid", { medications: [{ name: "old" }] });', deletion.context);
  await deletion.api.deleteHealthData();
  assert.equal(deletion.calls.consents[0], false, 'Delete revokes and clears the previous medication-check result.');
  assert.equal(deletion.api.status().cacheSize, 0, 'Deleted data cannot return from the in-memory account cache.');
  assert.equal(deletion.state.medications.length, 0);
  assert.equal(deletion.state.profile.name, '');
  for (const key of healthKeys.filter(key => !key.endsWith('-allergies'))) assert.equal(deletion.memory.has(key), false, 'Delete clears browser health records even when device writes are disabled.');
  assert.equal(deletion.calls.close, 1);
  assert.equal(deletion.calls.drafts, 1, 'Temporary visit preparation is cleared as well.');
  assert.equal(deletion.calls.fetches.length, 0, 'Anonymous deletion makes no account request.');

  const account = fixture({ signedIn: true });
  await account.api.deleteHealthData();
  assert.deepEqual(account.calls.fetches, [['/api/documents', 'GET'], ['/api/documents?id=fictional-file', 'DELETE'], ['/api/health/state', 'DELETE']], 'Account deletion removes uploaded files and private state.');
  assert.equal(account.context.accountSessionRevision, 3, 'An in-flight earlier account-state load is invalidated.');
  assert.equal(account.context.cloudSyncEnabled, true);
  assert.equal(account.calls.saves, 0, 'Deletion cannot re-upload the old browser record.');

  const cloud = fixture({ signedIn: true, cloudFailure: true });
  await cloud.api.deleteHealthData();
  assert.ok(cloud.memory.has(prefix + 'medications'), 'Cloud failure retains the browser copy for retry or export.');
  assert.equal(cloud.state.medications.length, 1);
  assert.equal(cloud.context.cloudSyncEnabled, false, 'Sync is paused after incomplete cloud deletion.');
  assert.match(cloud.calls.toasts.at(-1), /Deletion could not finish/);

  const switched = fixture({ signedIn: true });
  let finishInventory;
  switched.context.fetch = () => new Promise(resolve => { finishInventory = resolve; });
  const pendingDeletion = switched.api.deleteHealthData();
  assert.equal(typeof finishInventory, 'function');
  switched.context.authUser = { email: 'next@example.invalid', sub: 'next-account' };
  switched.context.accountSessionRevision += 1;
  switched.state.medications = [{ name: 'Next account fictional medicine' }];
  finishInventory({ ok: true, json: async () => ({ documents: [{ id: 'prior-account-file' }] }) });
  await pendingDeletion;
  assert.equal(switched.state.medications[0].name, 'Next account fictional medicine', 'A late delete response cannot clear the next account.');
  assert.ok(switched.memory.has(prefix + 'medications'), 'A late delete response cannot purge the next account browser copy.');
  assert.match(switched.calls.toasts.at(-1), /account changed during deletion/i);

  const blocked = fixture({ signedIn: true, failRemove: prefix + 'account-' + scopeB + '-profile' });
  await blocked.api.deleteHealthData();
  assert.equal(blocked.api.status().localStorageRemovalFailed, true);
  assert.equal(blocked.api.status().localStorageAllowed, false);
  assert.equal(blocked.memory.get(prefix + 'device-storage-consent'), 'session-cleanup-incomplete');
  assert.equal(blocked.context.cloudSyncEnabled, false, 'Incomplete browser cleanup cannot re-upload old records in this session.');
  assert.equal(blocked.calls.close, 0, 'The privacy dialog remains open on cleanup failure.');
  assert.match(blocked.calls.toasts.at(-1), /old browser data may remain/i);

  const { Controller } = require('../medication-check-controller.js');
  const checks = new Map([['B', { version: 1, ownerHash: 'B', profileHash: 'profile-B', consent: true, active: false, signature: '', rulesVersion: 'synthetic-v1', checkedAt: null, result: null, lastLoginId: '', checkStatus: 'not_checked' }]]);
  let currentKey = 'A';
  let loadedKey = '';
  const controller = new Controller({
    hash: async text => text,
    load: () => { loadedKey = currentKey; return checks.get(currentKey) || null; },
    save: value => { loadedKey = currentKey; checks.set(currentKey, value); },
    remove: () => { if (loadedKey) checks.delete(loadedKey); loadedKey = ''; },
    request: async () => { throw new Error('No synthetic request expected.'); }
  });
  const accountContext = owner => ({ owner, profileIdentity: 'profile-' + owner, allowed: true, storageAllowed: true, rulesVersion: 'synthetic-v1', payload: { medications: [], allergies: [], conditions: [] } });
  await controller.update(accountContext('A'));
  await controller.setConsent(true);
  assert.ok(checks.has('A'));
  currentKey = 'B';
  await controller.update(accountContext('B'));
  assert.equal(checks.has('A'), false, 'The previous account check is removed on owner change.');
  assert.ok(checks.has('B'), 'The new account check is not accidentally removed.');
  assert.equal(controller.snapshot().consent, true, 'The new account restores only its own earlier consent.');
  console.log('Device health storage verification passed (synthetic session choice, cancellation, owner-scoped check removal, account deletion, cloud failure and blocked browser cleanup).');
})().catch(error => { console.error(error); process.exitCode = 1; });
