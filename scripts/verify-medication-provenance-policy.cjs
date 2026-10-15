'use strict';

const assert = require('node:assert/strict');
const { decision } = require('./medication-provenance-policy.cjs');

const licensed = { source: {
  publisher: 'Example Journal', url: 'https://example.org/article', title: 'Article title',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Author et al. CC BY 4.0.'
} };
assert.equal(decision(licensed).keep, true);
assert.equal(decision({ source: { ...licensed.source, attribution: '' } }).reason, 'record-level-license-or-attribution-incomplete');
assert.equal(decision({ source: { ...licensed.source, additionalSources: [{ publisher: 'Medsafe', url: 'https://example.org/sheet', license: 'Medsafe data sheet; commercial reuse permission for sponsor-published data sheets has not been verified.' }] } }).reason, 'additional-source-rights-not-explicit');
assert.equal(decision({ source: { license: 'Independently summarized; no source wording copied; no commercial reuse permission verified.' } }).reason, 'reuse-status-unverified-or-conditional');
assert.equal(decision({ source: { license: 'Independently summarized; no source wording copied.' } }).reason, 'record-level-license-or-attribution-incomplete');
assert.equal(decision({ source: { url: 'https://example.org/public' } }).reason, 'reuse-status-missing');
assert.equal(decision({ source: {
  kind: 'internal-rule', sourceStatus: 'not-externally-sourced', publisher: 'DoctorAI internal rules',
  currentnessNote: 'Internal class mapping; no external source attached.'
} }).reason, 'internal-doctorai-original');

console.log('Medication provenance policy verification passed.');
