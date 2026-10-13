(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DoctorAIDoseStatus = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Records describe the action the user reported, not a verified dose or regimen.
  const localDate = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const validEvent = event => event && ['taken', 'missed'].includes(event.action)
    && typeof event.recordedAt === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.recordedAt)
    && Number.isFinite(new Date(event.recordedAt).getTime());
  const todayEvents = (medication, now = new Date()) => {
    const today = localDate(now);
    if (!today) return [];
    return (Array.isArray(medication?.doseEvents) ? medication.doseEvents : [])
      .filter(event => validEvent(event) && new Date(event.recordedAt).getTime() <= new Date(now).getTime() && localDate(event.recordedAt) === today)
      .sort((left, right) => new Date(left.recordedAt) - new Date(right.recordedAt));
  };
  const summary = (medication, now = new Date()) => {
    const events = todayEvents(medication, now);
    const taken = events.filter(event => event.action === 'taken').length;
    const missed = events.filter(event => event.action === 'missed').length;
    const label = events.length
      ? [taken ? `${taken} taken` : '', missed ? `${missed} missed` : ''].filter(Boolean).join(' · ') + ` record${events.length === 1 ? '' : 's'} today`
      : 'No dose record today';
    return { taken, missed, events, latest: events.at(-1) || null, label,
      legacyUndated: !events.length && ['taken', 'missed'].includes(medication?.status) };
  };
  const makeEvent = (action, now) => {
    if (!['taken', 'missed'].includes(action) || !localDate(now)) return null;
    return {
      id: typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `dose-${now.getTime()}-${Math.random().toString(36).slice(2)}`,
      action, recordedAt: now.toISOString(), localDate: localDate(now),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', utcOffsetMinutes: -now.getTimezoneOffset(),
      source: 'self-reported'
    };
  };
  const record = (medication, action, now = new Date()) => {
    if (!medication) return null;
    const event = makeEvent(action, now);
    if (!event) return null;
    if (!Array.isArray(medication.doseEvents)) medication.doseEvents = [];
    medication.doseEvents.push(event);
    return event;
  };
  const recordGuarded = (medication, action, healthState, now = new Date(), maximumCharacters = 220000) => {
    const event = makeEvent(action, now);
    const index = healthState?.medications?.findIndex(item => String(item.id) === String(medication?.id));
    if (!event || !medication || index === undefined || index < 0) return { event: null, reason: 'invalid' };
    const events = [...(Array.isArray(medication.doseEvents) ? medication.doseEvents : []), event];
    const proposed = { ...healthState, medications: healthState.medications.map((item, position) => position === index ? { ...item, doseEvents: events } : item) };
    if (JSON.stringify(proposed).length > maximumCharacters) return { event: null, reason: 'capacity' };
    medication.doseEvents = events;
    return { event, reason: '' };
  };
  const pruneBefore = (medication, cutoff, now = new Date()) => {
    const events = Array.isArray(medication?.doseEvents) ? medication.doseEvents : [];
    const today = localDate(now);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(cutoff || '')) ? new Date(`${cutoff}T12:00:00`) : null;
    if (!today || !parsed || localDate(parsed) !== cutoff || cutoff > today) return { events: events.slice(), removed: 0, error: 'Choose today or an earlier valid date.' };
    const retained = events.filter(event => {
      if (!validEvent(event)) return true;
      const date = localDate(event.recordedAt);
      return date >= cutoff || date >= today;
    });
    return { events: retained, removed: events.length - retained.length, error: '' };
  };
  const undoLatestToday = (medication, now = new Date()) => {
    const latest = todayEvents(medication, now).at(-1);
    if (!latest) return false;
    const index = medication.doseEvents.lastIndexOf(latest);
    medication.doseEvents.splice(index, 1);
    return true;
  };
  return { localDate, todayEvents, summary, record, recordGuarded, pruneBefore, undoLatestToday };
});
