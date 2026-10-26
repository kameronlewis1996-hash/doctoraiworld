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

  // Organizational suggestions only. No note text leaves this function, no clinical inference.
  function buildTodaySuggestion(input = {}) {
    const { ready, today, profile = {}, timeline = [], appointments = [], tasks = [] } = input;
    if (!ready || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return null;
    const list = value => Array.isArray(value) ? value : [];
    const nonempty = value => typeof value === 'string' && value.trim().length > 0;
    const day = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '';
    if (list(tasks).some(task => task?.source === 'today-focus' && day(task.date) === today)) return null;
    const saved = list(timeline).filter(item => item && day(item.date) && item.date <= today);
    const questions = saved.some(item => item.source === 'user-question' && nonempty(item.description));
    const observations = saved.some(item => item.type === 'symptom' && (nonempty(item.name) || nonempty(item.notes) || nonempty(item.description)));
    const notes = nonempty(profile?.notes) || saved.some(item => item.type === 'note' && (nonempty(item.description) || nonempty(item.notes)));
    if (!questions && !observations && !notes) return null;
    const upcoming = list(appointments).some(item => item && day(item.date) && item.date >= today);
    if (upcoming) return { id: 'prepare-visit', label: 'Choose one saved note or question for my next visit brief.', reason: 'Based on your saved notes and an upcoming appointment.', action: 'visit-prep' };
    if (questions) return { id: 'review-question', label: 'Review one question I have saved for a care conversation.', reason: 'Based on a question saved in your diary.', action: 'symptoms' };
    if (observations) return { id: 'brief-check-in', label: 'Write a brief update about how today feels.', reason: 'Based on an observation saved in your symptom diary.', action: 'symptoms' };
    return { id: 'review-notes', label: 'Review my saved health notes and note anything I want to discuss.', reason: 'Based on the health notes you saved in My Health.', action: 'health' };
  }

  return { normaliseQuestion, createQuestion, buildTodaySuggestion };
});
