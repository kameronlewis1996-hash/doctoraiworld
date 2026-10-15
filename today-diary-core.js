// Deterministic, user-triggered private diary question entries.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DoctorAITodayDiary = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function normaliseQuestion(value) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300); }
  function createQuestion(question, existing, date, id, now) {
    const text = normaliseQuestion(question);
    if (!text) return { error: 'empty' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { error: 'date' };
    if (!id || !Number.isFinite(now)) return { error: 'identity' };
    const duplicate = (Array.isArray(existing) ? existing : []).some(item => item?.source === 'user-question' && item.date === date && normaliseQuestion(item.description).toLocaleLowerCase('en') === text.toLocaleLowerCase('en'));
    if (duplicate) return { error: 'duplicate' };
    return { entry: { id: 'question-' + id, source: 'user-question', type: 'question', date, title: 'Question saved by you', description: text, createdAt: now } };
  }
  return { normaliseQuestion, createQuestion };
});
