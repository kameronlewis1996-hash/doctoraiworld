'use strict';
// Requires an already-running scripts/preview-managed-profiles.cjs on localhost
// and an installed agent-browser/Chromium. Only synthetic test routes are used.
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const browser = process.env.DOCTORAI_BROWSER_BIN || 'agent-browser';
const port = Number(process.env.PROFILE_PREVIEW_PORT) || 4183;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local test port.');
const origin = `http://127.0.0.1:${port}`;
const checks = [];
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
async function command(args, input) {
  const task = run(browser, [...args, '--json'], { timeout: 35000, maxBuffer: 1048576 });
  if (input !== undefined) task.child.stdin.end(input);
  const output = JSON.parse((await task).stdout.trim());
  if (!output.success) throw new Error(output.error || 'Browser command failed.');
  return output.data;
}
async function evaluate(fn, arg) { return (await command(['eval', '--stdin'], `(${fn.toString()})(${JSON.stringify(arg ?? null)})`)).result; }
async function reload() { await command(['reload']); await evaluate(async () => { for (let i = 0; i < 120; i++) { if (document.getElementById('last-synced').textContent.includes('Private data synced') || document.querySelector('.profile-trigger-name').textContent === 'Sign in') return; await new Promise(r => setTimeout(r, 50)); } throw new Error('Session/health did not resolve.'); }); }

(async () => {
  await command(['open', origin + '/health-hub#profile']);
  await evaluate(async () => { if ((await (await fetch('/__test/writes')).json()).synthetic !== true) throw Error('Not a synthetic fixture'); await fetch('/__test/account'); document.querySelector('[data-device-storage-session]').click(); localStorage.setItem('doctorai-health-hub-profile', ' { "notes": "Unlinked browser fixture" } '); await fetch('/__test/latency?getMs=2800'); });
  await command(['reload']);
  const delayed = await evaluate(async () => {
    const original = Storage.prototype.setItem; window.__healthWrites = [];
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('doctorai-health-hub-self-v2:') || /^doctorai-health-hub-(medications|profile|appointments|memory-details|timeline)$/.test(key)) window.__healthWrites.push(key); return original.call(this, key, value); };
    document.querySelector('[data-view="health"]').click(); document.querySelector('[data-modal="health"]').click(); const f = document.querySelector('[data-modal-form="health"]'); f.elements.notes.value = 'Synthetic edits during delayed GET'; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3100)); await fetch('/__test/latency');
    document.querySelector('[data-show-privacy]').click();
    return { healthWrites: window.__healthWrites.length, apiWrites: (await (await fetch('/__test/writes')).json()).writes.length, status: document.getElementById('last-synced').textContent, source: !!document.querySelector('[data-review-cache="device:0"]'), legacy: localStorage.getItem('doctorai-health-hub-profile') };
  });
  check(delayed.healthWrites === 0, 'Session-only delayed GET/manual edits make zero persistent health writes');
  check(delayed.apiWrites === 0, 'Unsynced edits during GET are not automatically uploaded');
  check(delayed.status.includes('kept in memory') && delayed.source, 'Actual memory-only notice and recovery/export entry are available');
  check(delayed.legacy === ' { "notes": "Unlinked browser fixture" } ', 'Delayed GET keeps unowned legacy bytes untouched');
  const recovered = await evaluate(() => { document.querySelector('[data-review-cache="device:0"]').click(); const f = document.querySelector('[data-modal-form="self-cache-recovery"]'); const fields = document.getElementById('modal-body').textContent; f.elements.confirmOwnRecords.checked = true; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return { fields, writes: window.__healthWrites.length, status: document.getElementById('last-synced').textContent }; });
  check(recovered.fields.includes('Synthetic edits during delayed GET') && recovered.fields.includes('Demo Owner'), 'Reviewed memory fallback contains the newest pending-GET edit under the named account');
  check(recovered.writes === 0 && recovered.status.includes('Session recovery draft'), 'Confirmed session-only recovery remains memory-only with accurate notice');
  const replacement = await evaluate(() => { document.querySelector('[data-close-privacy]').click(); document.querySelector('[data-modal="health"]').click(); const health = document.querySelector('[data-modal-form="health"]'); health.elements.notes.value = 'Newest manual session draft'; health.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); document.querySelector('[data-show-privacy]').click(); document.querySelector('[data-review-cache="device:0"]').click(); const f = document.querySelector('[data-modal-form="self-cache-recovery"]'); f.elements.confirmOwnRecords.checked = true; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return { writes: window.__healthWrites.length, backup: !!document.querySelector('[data-export-cache="device:1"]'), status: document.getElementById('last-synced').textContent }; });
  check(replacement.writes === 0 && replacement.backup, 'Replacement recovery preserves the prior draft in memory without a persistent write');
  const latest = await evaluate(async () => { const originalUrl = URL.createObjectURL, originalClick = HTMLAnchorElement.prototype.click; let blob; URL.createObjectURL = value => { blob = value; return 'blob:synthetic-memory-export'; }; HTMLAnchorElement.prototype.click = () => {}; document.querySelector('[data-export-cache="device:1"]').click(); const payload = JSON.parse(await blob.text()); URL.createObjectURL = originalUrl; HTMLAnchorElement.prototype.click = originalClick; return { notes: payload.state.profile.notes, writes: window.__healthWrites.length }; });
  check(latest.notes === 'Newest manual session draft' && latest.writes === 0, 'Explicit export retains the newest manual replacement-draft edits without browser persistence');
  await evaluate(async () => { document.querySelector('[data-return-account-records]').click(); await new Promise(r => setTimeout(r, 500)); });

  // Seed only synthetic old opt-in caches, then delete with storage now off.
  const seeded = await evaluate(async () => {
    const a = (await (await fetch('/api/auth/google')).json()).user.accountId; await fetch('/__test/account?other=1'); const b = (await (await fetch('/api/auth/google')).json()).user.accountId; await fetch('/__test/account');
    const cache = window.DoctorAISelfCache.create(localStorage); const value = name => ({ medications: [{ id: name, name: name + ' medicine' }], profile: { notes: name + ' note' } });
    for (const owner of [a, b]) { const name = owner === a ? 'Owned A deletion fixture' : 'Other B retained fixture'; cache.write(owner, value(name)); cache.write(owner, value(name + ' recovery'), { kind: 'recovery', beforeState: value(name + ' before') }); cache.preserve(owner, { ownerId: owner, profileId: 'self', state: value(name + ' preserved'), revision: null }); }
    window.__otherOwner = b; window.__otherBytes = Object.fromEntries(['record','recovery','preserved'].map(kind => [kind, localStorage.getItem(`doctorai-health-hub-self-v2:${b}:${kind}`)])); window.__healthWrites = []; window.__ownerRemovals = [];
    const remove = Storage.prototype.removeItem; Storage.prototype.removeItem = function(key) { if (key.startsWith('doctorai-health-hub-self-v2:')) window.__ownerRemovals.push(key); return remove.call(this, key); };
    return { ownerA: a, ownerB: b, choice: localStorage.getItem('doctorai-health-hub-device-storage-consent') };
  });
  check(seeded.choice === 'session' && seeded.ownerA !== seeded.ownerB, 'Deletion fixture has distinct synthetic owners and device storage off');
  const deletion = await evaluate(async () => { let confirmation; window.confirm = text => { confirmation = text; return true; }; document.querySelector('[data-delete-health]').click(); await new Promise(r => setTimeout(r, 700)); document.querySelector('[data-show-privacy]').click(); const a = (await (await fetch('/api/auth/google')).json()).user.accountId; return { confirmation, health: await (await fetch('/api/health/state')).json(), removals: window.__ownerRemovals, writes: window.__healthWrites.length, ownKeys: Object.keys(localStorage).filter(k => k.startsWith(`doctorai-health-hub-self-v2:${a}:`)), otherPreserved: Object.entries(window.__otherBytes).every(([kind, bytes]) => localStorage.getItem(`doctorai-health-hub-self-v2:${window.__otherOwner}:${kind}`) === bytes), draftExport: !!document.querySelector('[data-export-cache="draft"]'), preservedExport: !!document.querySelector('[data-export-cache="device:0"]'), legacy: localStorage.getItem('doctorai-health-hub-profile') }; });
  check(deletion.confirmation.includes('self browser cache, preserved copies and recovery drafts') && deletion.confirmation.includes('unlinked legacy/session copies are kept'), 'Future deletion confirmation accurately names owned backups and retained unlinked data');
  check(deletion.health.state === null && deletion.ownKeys.length === 0 && deletion.removals.length === 3, 'Confirmed synthetic self deletion removes account health and all three owned cache keys despite session-only mode');
  check(!deletion.draftExport && !deletion.preservedExport, 'Completed deletion removes in-memory/disk recovery exports and continuation');
  check(deletion.otherPreserved && deletion.legacy === ' { "notes": "Unlinked browser fixture" } ', 'Deletion leaves other-owner and unknown legacy bytes exact');
  check(deletion.writes === 0, 'Deletion creates no replacement plaintext health cache');
  await command(['reload']);
  const after = await evaluate(async () => { await new Promise(r=>setTimeout(r,500)); document.querySelector('[data-show-privacy]').click(); return { text: document.body.textContent, draft: !!document.querySelector('[data-export-cache="draft"]'), copy: !!document.querySelector('[data-export-cache="device:0"]') }; });
  check(!after.draft && !after.copy && !after.text.includes('Newest manual session draft') && !after.text.includes('Owned A deletion fixture'), 'Reload cannot resurrect/export deleted owner notes from backups or session drafts');
  console.log(JSON.stringify({ synthetic: true, checksPassed: checks.length, checks, externalStorageCalls: 0, realAiCalls: 0, realUserDataDeleted: false, authenticatedDeployment: false }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
