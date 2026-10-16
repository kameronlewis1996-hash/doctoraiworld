/* Local-only companion prototype rules. This module never reads hub state or calls an API. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoctorAICompanionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STEP_STATUSES = Object.freeze(['draft', 'confirmed', 'requested', 'booked', 'awaiting', 'completed']);
  const FAMILY_SCOPES = Object.freeze(['summary', 'medicines', 'appointments', 'steps']);
  const RECIPIENTS = Object.freeze({
    alex: Object.freeze({ name: 'Alex Taylor', contact: 'alex@example.test' }),
    jordan: Object.freeze({ name: 'Jordan Patel', contact: 'jordan@example.test' })
  });
  const STORAGE_KEY = 'doctorai-companion-demo:v1';

  function cleanText(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
  function localToday(at = new Date()) {
    return [at.getFullYear(), String(at.getMonth() + 1).padStart(2, '0'), String(at.getDate()).padStart(2, '0')].join('-');
  }
  function validDate(value) {
    if (value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }
  function initialState() {
    return { version: 1, steps: [], questions: [], messageDraft: '', family: {
      recipient: 'alex', scopes: [], expiry: '', identityChecklist: false,
      reviewed: false, previewApproved: false, history: []
    } };
  }
  function normalizeState(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.steps) || !Array.isArray(raw.questions)) return initialState();
    const state = initialState();
    state.steps = raw.steps.slice(0, 100).map(item => {
      if (!item || typeof item !== 'object') return null;
      const title = cleanText(item.title, 160);
      if (!title) return null;
      return {
        id: cleanText(item.id, 80), title, source: cleanText(item.source, 600),
        dueDate: validDate(item.dueDate || '') ? (item.dueDate || '') : '',
        status: STEP_STATUSES.includes(item.status) ? item.status : 'draft',
        sample: item.sample === true, includeInBrief: item.includeInBrief !== false
      };
    }).filter(item => item && item.id);
    state.questions = raw.questions.slice(0, 40).map(item => ({ id: cleanText(item?.id, 80), text: cleanText(item?.text, 1500) })).filter(item => item.id && item.text);
    state.messageDraft = cleanText(raw.messageDraft, 1500);
    const family = raw.family || {};
    state.family.recipient = Object.hasOwn(RECIPIENTS, family.recipient) ? family.recipient : 'alex';
    state.family.scopes = Array.isArray(family.scopes) ? [...new Set(family.scopes.filter(scope => FAMILY_SCOPES.includes(scope)))].slice(0, 4) : [];
    state.family.expiry = validDate(family.expiry || '') ? (family.expiry || '') : '';
    state.family.identityChecklist = family.identityChecklist === true;
    state.family.reviewed = family.reviewed === true;
    state.family.previewApproved = family.previewApproved === true && state.family.reviewed;
    state.family.history = Array.isArray(family.history) ? family.history.slice(-12).map(item => cleanText(item, 120)).filter(Boolean) : [];
    return state;
  }
  function makeStep(fields, id) {
    const title = cleanText(fields.title, 160);
    if (!title) throw new Error('Write one action before saving a draft.');
    const dueDate = fields.dueDate || '';
    if (!validDate(dueDate)) throw new Error('Choose a valid date or leave it blank.');
    return { id, title, source: cleanText(fields.source, 600), dueDate, status: 'draft', sample: fields.sample === true, includeInBrief: true };
  }
  function setStepStatus(step, next) {
    if (!STEP_STATUSES.includes(next) || next === 'draft') throw new Error('Choose a valid step status.');
    if (step.status === 'draft' && next !== 'confirmed') throw new Error('Review and confirm the draft before changing its progress.');
    return { ...step, status: next };
  }
  function buckets(steps) {
    return {
      draft: steps.filter(step => step.status === 'draft'),
      waiting: steps.filter(step => step.status === 'requested' || step.status === 'awaiting'),
      plan: steps.filter(step => !['draft', 'requested', 'awaiting'].includes(step.status)),
      completed: steps.filter(step => step.status === 'completed')
    };
  }
  function dateState(step, today = localToday()) {
    if (!step.dueDate || step.status === 'completed') return '';
    if (step.dueDate < today) return 'Overdue in this plan';
    if (step.dueDate === today) return 'Check back today';
    return 'Check back ' + step.dueDate;
  }
  function familyCanReview(family, today = localToday()) {
    return !!(RECIPIENTS[family.recipient] && family.scopes.length && family.scopes.every(scope => FAMILY_SCOPES.includes(scope)) && validDate(family.expiry) && family.expiry > today && family.identityChecklist);
  }
  function familyIsExpired(family, today = localToday()) { return !!(family.expiry && validDate(family.expiry) && family.expiry <= today); }
  function buildMessage(fields) {
    const concern = cleanText(fields.concern, 700);
    if (!concern) throw new Error('Write your concern in your own words first.');
    const audience = ['health professional', 'pharmacist', 'clinic team'].includes(fields.audience) ? fields.audience : 'health professional';
    const opener = { plain: 'I want to talk about:', gentle: 'I would like to talk about:', direct: 'I need to discuss:' }[fields.tone] || 'I want to talk about:';
    const lines = ['For my ' + audience + ':', '', opener + ' ' + concern];
    const context = cleanText(fields.context, 350);
    const question = cleanText(fields.question, 350);
    if (context) lines.push('', 'Context I want to include: ' + context);
    if (question) lines.push('', 'My question: ' + question);
    return lines.join('\n');
  }
  return { STORAGE_KEY, STEP_STATUSES, FAMILY_SCOPES, RECIPIENTS, localToday, validDate, initialState, normalizeState, makeStep, setStepStatus, buckets, dateState, familyCanReview, familyIsExpired, buildMessage };
});
