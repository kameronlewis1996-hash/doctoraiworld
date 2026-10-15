'use strict';

const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';

function isCcByRecord(source) {
  if (!source || typeof source !== 'object') return false;
  return /^CC BY 4\.0$/i.test(String(source.license || '').trim()) &&
    String(source.licenseUrl || '').trim().replace(/\/$/, '') === CC_BY_4_URL.replace(/\/$/, '') &&
    Boolean(String(source.publisher || '').trim()) &&
    /^https?:\/\//i.test(String(source.url || '').trim()) &&
    Boolean(String(source.title || '').trim()) &&
    /CC BY 4\.0/i.test(String(source.attribution || ''));
}

function decision(rule) {
  const source = rule && rule.source && typeof rule.source === 'object' ? rule.source : {};
  if (source.kind === 'internal-rule' && source.sourceStatus === 'not-externally-sourced' &&
      /^DoctorAI\b/i.test(String(source.publisher || '')) && String(source.currentnessNote || '').trim() &&
      (!Array.isArray(source.additionalSources) || source.additionalSources.length === 0)) {
    return { keep: true, reason: 'internal-doctorai-original', basis: 'internal DoctorAI authored rule' };
  }
  if (!isCcByRecord(source)) {
    const license = String(source.license || '').trim();
    if (!license) return { keep: false, reason: 'reuse-status-missing' };
    if (/\b(?:no\s+commercial\s+reuse\s+permission|(?:commercial\s+)?(?:reuse\s+)?(?:permission|rights|terms)\b[^.]{0,100}\b(?:not|never|unverified|no)\b[^.]{0,40}\b(?:verified|confirmed|granted|licensed|permitted)?)|\b(?:unverified|not confirmed|not verified|not licensed)\b/i.test(license)) {
      return { keep: false, reason: 'reuse-status-unverified-or-conditional' };
    }
    return { keep: false, reason: 'record-level-license-or-attribution-incomplete' };
  }
  const additional = Array.isArray(source.additionalSources) ? source.additionalSources : [];
  if (additional.some(item => !isCcByRecord(item))) {
    return { keep: false, reason: 'additional-source-rights-not-explicit' };
  }
  return { keep: true, reason: 'explicit-cc-by-4.0', basis: 'CC BY 4.0 with record-level attribution' };
}

function retainedAttribution(rule, result) {
  const source = Object.assign({}, rule.source || {});
  source.rightsBasis = result.basis;
  if (result.reason === 'internal-doctorai-original' && !source.attribution) {
    source.attribution = `${source.publisher}; internally authored DoctorAI class mapping with no external source.`;
  }
  return Object.assign({}, rule, { source });
}

module.exports = { CC_BY_4_URL, decision, isCcByRecord, retainedAttribution };
