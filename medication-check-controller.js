/* Consented, account-scoped medication checks. No shared cache or background polling. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoctorAIMedicationCheck = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const MAX_AGE = 24 * 60 * 60 * 1000;
  const digest = async text => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), value => value.toString(16).padStart(2, '0')).join('');
  const issues = result => (result?.alerts || []).filter(alert => ['interaction', 'allergy', 'contraindication', 'duplicate-ingredient'].includes(alert.type));
  class Controller {
    constructor({ request, load = () => null, save = () => {}, remove = () => {}, onChange = () => {}, hash = digest, now = Date.now }) {
      Object.assign(this, { request, load, save, remove, onChange, hash, now });
      this.generation = 0; this.requestId = 0; this.view = { status: 'not_checked', consent: false, active: false, result: null, checkedAt: null };
      this.restored = false; this.contextKey = ''; this.attemptedKey = ''; this.pending = null;
    }
    snapshot() { return { ...this.view }; }
    emit() { this.onChange(this.snapshot()); }
    cancel() { this.requestId += 1; this.abort?.abort(); this.pending = null; this.abort = null; }
    persist() {
      if (!this.context?.storageAllowed) { this.remove(); return; }
      if (!this.ownerHash || !this.profileHash || !this.view.consent) { this.remove(); return; }
      try { this.save({ version: 1, ownerHash: this.ownerHash, profileHash: this.profileHash, consent: true, active: this.view.active,
        signature: this.signature, rulesVersion: this.context.rulesVersion, checkedAt: this.view.checkedAt, result: this.view.result }); } catch { /* A storage failure cannot turn an unchecked list into success. */ }
    }
    async update(context) {
      const contextKey = JSON.stringify([context.owner, context.profileIdentity, context.payload, context.allowed, context.rulesVersion, context.storageAllowed]);
      if (contextKey === this.contextKey && !(this.view.status === 'complete' && this.now() - this.view.checkedAt >= MAX_AGE)) return this.snapshot();
      const previousOwner = this.context?.owner; const previousProfile = this.context?.profileIdentity;
      const scopeChanged = previousOwner && (previousOwner !== context.owner || previousProfile !== context.profileIdentity);
      this.contextKey = contextKey; this.context = context;
      const generation = ++this.generation; this.cancel(); this.attemptedKey = '';
      this.view = { ...this.view, status: context.allowed ? 'not_checked' : 'unavailable', result: null, checkedAt: null, error: context.allowed ? '' : 'Sign in with active Pro access and wait for private account data before checking.' };
      if (scopeChanged && (this.restored || this.view.consent || this.view.active)) { this.view.consent = false; this.view.active = false; this.remove(); }
      this.emit();
      if (!context.owner) return this.snapshot();
      let ownerHash, profileHash, signature;
      try {
        [ownerHash, profileHash, signature] = await Promise.all([this.hash(context.owner), this.hash(context.profileIdentity || ''), this.hash(JSON.stringify([context.payload, context.rulesVersion]))]);
      } catch { if (generation === this.generation) { this.view.status = 'unavailable'; this.view.error = 'Secure check tracking is unavailable in this browser. No check was sent.'; this.emit(); } return this.snapshot(); }
      if (generation !== this.generation) return this.snapshot();
      this.ownerHash = ownerHash; this.profileHash = profileHash; this.signature = signature;
      if (!this.restored && context.allowed && context.rulesVersion) {
        this.restored = true;
        const saved = context.storageAllowed ? this.load() : null;
        if (saved?.version === 1 && saved.ownerHash === ownerHash && saved.profileHash === profileHash && saved.consent === true) {
          this.view.consent = true; this.view.active = saved.active === true;
          if (saved.signature === signature && saved.rulesVersion === context.rulesVersion && this.validResult(saved.result) && Number.isFinite(saved.checkedAt) && saved.checkedAt <= this.now() && this.now() - saved.checkedAt < MAX_AGE) {
            this.view.status = 'complete'; this.view.result = saved.result; this.view.checkedAt = saved.checkedAt;
          }
        } else if (saved) this.remove();
      }
      if (!context.allowed || !context.rulesVersion) {
        if (context.allowed && !context.rulesVersion) { this.view.status = 'unavailable'; this.view.error = 'The current rules version could not be verified. No check was sent.'; }
        this.emit(); return this.snapshot();
      }
      this.persist(); this.emit();
      if (this.view.consent && this.view.active && this.view.status !== 'complete' && context.payload.medications.length) await this.run(false);
      return this.snapshot();
    }
    validResult(result) {
      return !!result && ['red', 'orange', 'unknown'].includes(result.status) && Array.isArray(result.alerts) && Array.isArray(result.resolved)
        && result.coverage && result.coverage.requested === this.context.payload.medications.length
        && result.resolved.length === this.context.payload.medications.length
        && result.resolved.every((item, index) => item.name === this.context.payload.medications[index].name)
        && result.ruleset?.version === this.context.rulesVersion;
    }
    async setConsent(allowed) {
      this.cancel(); this.view.consent = allowed === true && !!this.context?.owner;
      if (!this.view.consent) { ++this.generation; this.view.active = false; this.view.result = null; this.view.checkedAt = null; this.view.status = 'not_checked'; this.attemptedKey = ''; }
      this.persist(); this.emit(); // Selecting the checkbox alone never sends terms.
    }
    async run(manual = true) {
      if (this.pending) return this.pending;
      if (!this.view.consent || !this.context?.allowed || !this.context.rulesVersion || !this.signature) return this.snapshot();
      const payload = this.context.payload;
      if (!payload.medications.length || payload.medications.length > 30 || payload.medications.some(item => !item.name)) {
        this.view.status = 'not_checked'; this.view.result = null; this.view.checkedAt = null; this.view.error = 'Use 1–30 saved medicines with a name for every entry. No partial list was checked.'; this.persist(); this.emit(); return this.snapshot();
      }
      if (!manual && this.attemptedKey === this.signature) return this.snapshot();
      this.view.active = true; this.attemptedKey = this.signature;
      const requestId = ++this.requestId; const generation = this.generation;
      const owner = this.context.owner; const signature = this.signature;
      this.abort = new AbortController(); const abort = this.abort; const signal = abort.signal;
      this.view.status = 'pending'; this.view.result = null; this.view.checkedAt = null; this.view.error = ''; this.persist(); this.emit();
      const timer = setTimeout(() => abort.abort(), 20000);
      const operation = (async () => {
        try {
          const result = await this.request({ ...payload, consent: true }, signal);
          if (requestId !== this.requestId || generation !== this.generation || owner !== this.context.owner || signature !== this.signature || !this.view.consent) return this.snapshot();
          if (!this.validResult(result)) throw new Error('The check returned incomplete or outdated rules. Reload and retry. No current check is available.');
          this.view.status = 'complete'; this.view.result = result; this.view.checkedAt = this.now();
        } catch (error) {
          if (requestId !== this.requestId || generation !== this.generation) return this.snapshot();
          this.view.status = 'unavailable'; this.view.result = null; this.view.checkedAt = null;
          this.view.error = error?.name === 'AbortError' ? 'The check timed out. No current result is available.' : String(error?.message || 'No medication check was returned.');
        } finally {
          clearTimeout(timer);
          if (requestId === this.requestId && generation === this.generation) { this.pending = null; this.abort = null; this.persist(); this.emit(); }
        }
        return this.snapshot();
      })();
      this.pending = operation;
      return operation;
    }
  }
  return { Controller, issues, MAX_AGE };
});
