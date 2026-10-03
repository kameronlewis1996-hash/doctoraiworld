(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoctorAISelfCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const prefix = 'doctorai-health-hub-';
  const fields = { medications: 'medications', appointments: 'appointments', providers: 'providers', timeline: 'timeline', documents: 'documents', measurements: 'measurements', tasks: 'tasks', profile: 'profile', 'memory-enabled': 'memoryEnabled', 'memory-details': 'memoryDetails', 'updated-at': 'updatedAt' };
  const validOwner = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  const validRevision = value => value === null || validOwner(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  const recordList = ['medications', 'appointments', 'providers', 'timeline', 'documents', 'measurements', 'tasks'];
  const validState = value => value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(value).length <= 240000
    && Object.keys(value).every(key => Object.values(fields).includes(key) && key !== 'updatedAt')
    && recordList.every(key => value[key] === undefined || (Array.isArray(value[key]) && value[key].every(item => item && typeof item === 'object' && !Array.isArray(item))))
    && (value.memoryDetails === undefined || (Array.isArray(value.memoryDetails) && value.memoryDetails.every(item => typeof item === 'string')))
    && (value.memoryEnabled === undefined || typeof value.memoryEnabled === 'boolean')
    && (value.profile === undefined || (value.profile && typeof value.profile === 'object' && !Array.isArray(value.profile)
      && ['name', 'bloodType', 'allergies', 'conditions', 'notes'].every(key => value.profile[key] === undefined || typeof value.profile[key] === 'string')));

  function create(storage) {
    const get = key => { try { return storage.getItem(key); } catch { return null; } };
    const key = (owner, kind) => validOwner(owner) && ['record', 'recovery'].includes(kind) ? `${prefix}self-v2:${owner}:${kind}` : null;
    const read = (owner, kind = 'record') => {
      const target = key(owner, kind); if (!target) return null;
      try {
        const record = JSON.parse(get(target));
        return record?.v === 2 && record.ownerId === owner && record.profileId === 'self' && record.kind === kind && validState(record.state) && validRevision(record.revision) && (kind !== 'recovery' || validState(record.beforeState)) ? copy(record) : null;
      } catch { return null; }
    };
    const write = (owner, state, { kind = 'record', revision = null, updatedAt = Date.now(), beforeState = {}, pendingRecovery = true, dirty = false } = {}) => {
      const target = key(owner, kind);
      if (!target || !validState(state) || !validRevision(revision) || (kind === 'recovery' && !validState(beforeState))) return false;
      const record = { v: 2, ownerId: owner, profileId: 'self', kind, state, revision, updatedAt, dirty: Boolean(dirty) };
      if (kind === 'recovery') { record.beforeState = beforeState; record.pendingRecovery = pendingRecovery; }
      try { storage.setItem(target, JSON.stringify(record)); return true; } catch { return false; }
    };
    const legacy = () => {
      const rawEntries = {}; const state = {}; const invalidFields = [];
      let updatedAt = 0;
      for (const [name, field] of Object.entries(fields)) {
        const raw = get(prefix + name); if (raw === null) continue;
        rawEntries[prefix + name] = raw;
        try { const value = JSON.parse(raw); if (field === 'updatedAt') updatedAt = Number(value) || 0; else state[field] = value; } catch { invalidFields.push(name); }
      }
      return { rawEntries, state, updatedAt, exists: Object.keys(rawEntries).length > 0, recoverable: invalidFields.length === 0 && validState(state), invalidFields };
    };
    const preserved = owner => {
      if (!validOwner(owner)) return [];
      try { const stored = JSON.parse(get(`${prefix}self-v2:${owner}:preserved`)); return stored?.v === 2 && stored.ownerId === owner && Array.isArray(stored.copies) && stored.copies.every(record => record.ownerId === owner && record.profileId === 'self' && validState(record.state) && validRevision(record.revision)) ? copy(stored.copies) : []; } catch { return []; }
    };
    const preserve = (owner, record) => {
      if (!validOwner(owner) || record?.ownerId !== owner || !validState(record.state) || !validRevision(record.revision)) return false;
      const copies = preserved(owner);
      // A malformed earlier backup is retained rather than overwritten.
      if (get(`${prefix}self-v2:${owner}:preserved`) !== null && !copies.length) {
        try { const old = JSON.parse(get(`${prefix}self-v2:${owner}:preserved`)); if (old?.v !== 2 || old.ownerId !== owner || !Array.isArray(old.copies) || old.copies.length) return false; } catch { return false; }
      }
      const entry = copy(record);
      if (!copies.some(value => JSON.stringify(value) === JSON.stringify(entry))) copies.push(entry);
      try { storage.setItem(`${prefix}self-v2:${owner}:preserved`, JSON.stringify({ v: 2, ownerId: owner, copies })); return true; } catch { return false; }
    };
    // Called only after explicit, owner-scoped health deletion succeeds.
    // Never enumerate storage or touch another owner/unlinked legacy bytes.
    const clearOwner = owner => {
      if (!validOwner(owner)) return false;
      let complete = true;
      for (const kind of ['record', 'recovery', 'preserved']) {
        const target = `${prefix}self-v2:${owner}:${kind}`;
        try { storage.removeItem(target); if (storage.getItem(target) !== null) complete = false; } catch { complete = false; }
      }
      return complete;
    };
    return { read, write, legacy, preserved, preserve, clearOwner };
  }
  return { create, validOwner, validState };
});
