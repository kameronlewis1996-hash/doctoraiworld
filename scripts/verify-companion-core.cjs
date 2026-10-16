const assert = require('node:assert/strict');
const core = require('../next-steps-core.js');

const date = '2026-10-16';
const draft = core.makeStep({ title: '  Ask the clinic what happens next  ', source: '  My own visit note  ', dueDate: '2026-10-17' }, 'one');
assert.deepEqual({ title: draft.title, source: draft.source, status: draft.status, dueDate: draft.dueDate }, {
  title: 'Ask the clinic what happens next', source: 'My own visit note', status: 'draft', dueDate: '2026-10-17'
});
assert.throws(() => core.makeStep({ title: '', source: '' }, 'bad'), /Write one action/);
assert.throws(() => core.makeStep({ title: 'Ask a question', dueDate: '2026-02-30' }, 'bad'), /valid date/);
assert.throws(() => core.setStepStatus(draft, 'booked'), /Review and confirm/);
const confirmed = core.setStepStatus(draft, 'confirmed');
const requested = core.setStepStatus(confirmed, 'requested');
const completed = core.setStepStatus(confirmed, 'completed');
assert.equal(core.dateState(requested, date), 'Check back 2026-10-17');
assert.equal(core.dateState({ ...requested, dueDate: '2026-10-15' }, date), 'Overdue in this plan');
assert.equal(core.dateState(completed, date), '');
assert.equal(core.dateState(core.makeStep({ title: 'No fabricated date' }, 'two'), date), '');
assert.deepEqual(Object.fromEntries(Object.entries(core.buckets([draft, requested, completed])).map(([key, value]) => [key, value.length])), { draft: 1, waiting: 1, plan: 1, completed: 1 });

const state = core.normalizeState({ version: 1, steps: [draft, { ...draft, id: 'unsafe', status: 'clinical-approved', dueDate: 'invalid' }], questions: [{ id: 'q', text: 'My own question' }], family: { recipient: 'unknown', scopes: ['summary', 'billing', 'summary'], expiry: '2026-10-20', identityChecklist: false, reviewed: true, previewApproved: true, history: [] } });
assert.equal(state.steps[1].status, 'draft');
assert.equal(state.steps[1].dueDate, '');
assert.deepEqual(state.family.scopes, ['summary']);
assert.equal(state.family.recipient, 'alex');
assert.equal(core.familyCanReview(state.family, date), false);
state.family.identityChecklist = true;
assert.equal(core.familyCanReview(state.family, date), true);
assert.equal(core.familyCanReview({ ...state.family, expiry: date }, date), false);
assert.equal(core.familyIsExpired({ ...state.family, expiry: date }, date), true);
assert.equal(core.familyCanReview({ ...state.family, scopes: ['billing'] }, date), false);

const words = core.buildMessage({ concern: 'I have a question about the plan', audience: 'pharmacist', tone: 'gentle', context: 'This is my own note', question: 'What should I ask next?' });
assert.match(words, /^For my pharmacist:\n\nI would like to talk about: I have a question about the plan/);
assert.match(words, /Context I want to include: This is my own note/);
assert.match(words, /My question: What should I ask next\?/);
assert.doesNotMatch(words, /diagnos|urgent|safe|confirmed/i);
assert.throws(() => core.buildMessage({ concern: '' }), /own words/);
assert.equal(core.normalizeState({ version: 2 }).steps.length, 0);
console.log('Companion core: draft review, user dates, status buckets, simulated scopes and manual wording passed.');
