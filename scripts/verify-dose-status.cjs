'use strict';

// Invented fixtures only. No accounts, APIs or stored patient information are read.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const doses = require('../medication-dose-status.js');
let checks = 0;
const check = callback => { callback(); checks += 1; };
const now = new Date(2026, 9, 13, 12, 0, 0);

check(() => {
  for (const status of ['taken', 'missed', 'due']) {
    const legacy = { id: 'invented', status, frequency: 'Twice daily' };
    assert.equal(doses.summary(legacy, now).events.length, 0);
    assert.equal(doses.summary(legacy, now).label, 'No dose record today');
    assert.equal(doses.summary(legacy, now).legacyUndated, status !== 'due');
    assert.equal(legacy.status, status);
  }
});
check(() => {
  const medicine = { id: 'invented', status: 'taken', frequency: 'Twice daily' };
  const event = doses.record(medicine, 'taken', now);
  assert.equal(event.recordedAt, now.toISOString());
  assert.equal(event.localDate, '2026-10-13');
  assert.equal(event.utcOffsetMinutes, -now.getTimezoneOffset());
  assert.equal(event.source, 'self-reported');
  assert.equal(doses.summary(medicine, now).label, '1 taken record today');
  assert.equal(medicine.status, 'taken');
  const refreshed = JSON.parse(JSON.stringify(medicine));
  assert.equal(doses.summary(refreshed, now).taken, 1);
  const tomorrow = new Date(2026, 9, 14, 0, 0, 0);
  assert.equal(doses.summary(refreshed, tomorrow).events.length, 0);
  assert.equal(refreshed.doseEvents.length, 1, 'Midnight does not erase history');
});
check(() => {
  const medicine = { id: 'invented', frequency: 'Twice daily' };
  doses.record(medicine, 'taken', new Date(2026, 9, 13, 8));
  doses.record(medicine, 'missed', new Date(2026, 9, 13, 10));
  doses.record(medicine, 'taken', new Date(2026, 9, 13, 11));
  const summary = doses.summary(medicine, now);
  assert.equal(summary.taken, 2);
  assert.equal(summary.missed, 1);
  assert.equal(summary.label, '2 taken · 1 missed records today');
  assert.doesNotMatch(summary.label, /complete|all.*taken|of.*taken|due/i);
  assert.equal(doses.undoLatestToday(medicine, now), true);
  assert.equal(doses.summary(medicine, now).latest.action, 'missed');
  assert.equal(doses.summary(medicine, now).taken, 1);
  assert.equal(doses.summary(medicine, now).missed, 1);
  assert.equal(doses.undoLatestToday(medicine, new Date(2026, 9, 14)), false);
  assert.equal(medicine.doseEvents.length, 2);
});
check(() => {
  const medicine = { doseEvents: [
    { action: 'taken', recordedAt: 'invalid' },
    { action: 'taken', recordedAt: '2026-10-13' },
    { action: 'unknown', recordedAt: now.toISOString() },
    { action: 'taken', recordedAt: new Date(now.getTime() + 60000).toISOString() },
    null
  ] };
  assert.equal(doses.summary(medicine, now).events.length, 0);
  assert.equal(doses.record(medicine, 'unknown', now), null);
  assert.equal(doses.record(medicine, 'taken', new Date('invalid')), null);
});
check(() => {
  // Both entry and review use the current local calendar, including DST boundaries.
  const script = `
    const assert = require('node:assert/strict');
    const d = require(${JSON.stringify(path.resolve(__dirname, '../medication-dose-status.js'))});
    const m = {};
    const before = new Date(2026, 8, 27, 23, 59, 59);
    d.record(m, 'taken', before);
    assert.equal(d.summary(m, before).taken, 1);
    assert.equal(d.summary(m, new Date(2026, 8, 28, 0, 0, 0)).taken, 0);
    assert.equal(d.localDate(new Date('2026-10-13T11:30:00Z')), process.env.TZ === 'Pacific/Auckland' ? '2026-10-14' : '2026-10-13');
    const events = {doseEvents:[{action:'taken', recordedAt:'2026-10-13T11:00:00Z', localDate:'2026-10-13', timeZone:'UTC'}]};
    assert.equal(d.summary(events, new Date('2026-10-13T12:00:00Z')).taken, 1);
    assert.equal(d.summary(events, new Date('2026-10-14T12:00:00Z')).taken, 0);
    if (process.env.TZ === 'Pacific/Auckland') {
      const crossing = {};
      const beforeDST = new Date(2026, 8, 27, 1, 30);
      const afterDST = new Date(2026, 8, 27, 3, 30);
      assert.notEqual(beforeDST.getTimezoneOffset(), afterDST.getTimezoneOffset());
      d.record(crossing, 'taken', beforeDST);
      assert.equal(d.summary(crossing, afterDST).taken, 1, 'DST does not reset the calendar day');
      assert.equal(d.summary(crossing, new Date(2026, 8, 28)).taken, 0);
    }
  `;
  for (const TZ of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
    execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, stdio: 'pipe' });
  }
});
check(() => {
  // Same saved instant is reassigned to the local review day after travel.
  const priorTZ = process.env.TZ;
  try {
    const medicine = { doseEvents: [{ action: 'taken', recordedAt: '2026-10-13T10:30:00Z', localDate: '2026-10-13', timeZone: 'UTC' }] };
    const review = new Date('2026-10-13T12:00:00Z');
    process.env.TZ = 'UTC';
    assert.equal(doses.summary(medicine, review).taken, 1);
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(doses.summary(medicine, review).taken, 0, 'Crossing local midnight cannot carry a record into the next day');
  } finally { if (priorTZ === undefined) delete process.env.TZ; else process.env.TZ = priorTZ; }
});
check(() => {
  // Verify live UI rollover updates without issuing an AI request or saving a reset.
  const source = fs.readFileSync(path.resolve(__dirname, '../health-hub.js'), 'utf8');
  const start = source.indexOf('  let medicationDayKey =');
  const end = source.indexOf('  function openTodayPlan()', start);
  assert.ok(start >= 0 && end > start);
  const clock = { value: new Date(2026, 9, 13, 23, 59, 59) };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.value.getTime()])); } }
  let renders = 0;
  const routine = { innerHTML: '' }, plan = { textContent: '' };
  const medicine = {};
  doses.record(medicine, 'taken', clock.value);
  const context = {
    Date: ClockDate, doseStatus: doses, els: { modal: { open: true } },
    $: selector => selector === '#today-routine-medications' ? routine : plan,
    updateDate: () => {}, renderTodayOverview: () => { renders += 1; }, renderTodayMedications: () => {}, renderMedicationLibrary: () => {},
    currentRoutineMedications: () => [medicine], todayMedicineMarkup: (medicines, date) => doses.summary(medicines[0], date).label,
    todayMedicinePlanText: (medicines, date) => `${doses.summary(medicines[0], date).events.length} dated actions`,
    window: { clearTimeout: () => {}, setTimeout: callback => { context.pendingMidnight = callback; return 1; } }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nthis.refresh = refreshMedicationDay; this.schedule = scheduleMedicationDayRefresh;', context);
  assert.equal(context.refresh(), true);
  assert.equal(routine.innerHTML, '1 taken record today');
  assert.equal(context.refresh(), false);
  assert.equal(renders, 1);
  context.schedule();
  clock.value = new Date(2026, 9, 14, 0, 0, 0);
  context.pendingMidnight();
  assert.equal(routine.innerHTML, 'No dose record today');
  assert.equal(plan.textContent, '0 dated actions');
  assert.equal(medicine.doseEvents.length, 1);
  assert.equal(renders, 2);
  assert.match(source, /addEventListener\('focus'.*refreshMedicationDay/);
  assert.match(source, /addEventListener\('pageshow'.*refreshMedicationDay/);
  assert.match(source, /if \(!document.hidden\).*refreshMedicationDay/);
});
check(() => {
  // Exercise rendered status text against undated and multi-dose fixtures.
  const source = fs.readFileSync(path.resolve(__dirname, '../health-hub.js'), 'utf8');
  const start = source.indexOf('  function renderTodayMedications()');
  const end = source.indexOf('  function savedSupplyAmount(', start);
  assert.ok(start >= 0 && end > start);
  const legacy = { id: 'fictional-legacy', name: 'Fictional medicine', status: 'taken', frequency: 'Twice daily' };
  const medicine = { id: 'fictional-dated', name: 'Fictional repeated medicine', frequency: 'Twice daily' };
  doses.record(medicine, 'taken');
  doses.record(medicine, 'missed');
  const list = { innerHTML: '' };
  const context = {
    doseStatus: doses, state: { medications: [legacy, medicine] }, els: { medicationToday: list },
    escapeHTML: value => String(value ?? ''), medicationSafetyMarkup: () => '', iconMarkup: () => ''
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nrenderTodayMedications();', context);
  assert.match(list.innerHTML, /No dose record today/);
  assert.match(list.innerHTML, /Older status has no date/);
  assert.match(list.innerHTML, /1 taken · 1 missed records today/);
  assert.match(list.innerHTML, /other doses may remain/i);
  assert.match(list.innerHTML, /data-med-undo="fictional-dated"/);
  assert.doesNotMatch(list.innerHTML, /class="medication-row taken"|Taken today|Due undefined/);
});

check(() => {
  const medicine = { id: 'fictional-capacity', name: 'Fictional medicine' };
  const health = { medications: [{ ...medicine }], profile: { notes: 'x'.repeat(220000) }, timeline: [] };
  const original = JSON.stringify(health);
  const result = doses.recordGuarded(medicine, 'taken', health, now);
  assert.equal(result.reason, 'capacity');
  assert.equal(result.event, null);
  assert.equal(medicine.doseEvents, undefined, 'Rejected action cannot alter medication');
  assert.equal(JSON.stringify(health), original, 'Existing saved state stays untouched');
  const small = { medications: [{ ...medicine }], profile: {}, timeline: [] };
  assert.ok(doses.recordGuarded(medicine, 'taken', small, now).event);
  assert.equal(medicine.doseEvents.length, 1);
  assert.equal(small.medications[0].doseEvents, undefined, 'Capacity calculation works against an exported clone');
});
check(() => {
  // Reproduce extended use: five twice-daily medicines, with no automatic loss.
  const medications = Array.from({ length: 5 }, (_, index) => ({ id: `invented-${index}` }));
  for (let day = 0; day < 130; day += 1) {
    const when = new Date(2026, 4, day + 1, 8);
    for (const medication of medications) {
      doses.record(medication, 'taken', when);
      doses.record(medication, 'taken', new Date(when.getTime() + 12 * 60 * 60 * 1000));
    }
  }
  const health = { medications, profile: {}, timeline: [] };
  const original = JSON.stringify(health);
  assert.ok(original.length > 220000);
  assert.equal(doses.recordGuarded(medications[0], 'missed', health, now).reason, 'capacity');
  assert.equal(JSON.stringify(health), original);
  const plan = doses.pruneBefore(medications[0], doses.localDate(now), now);
  assert.equal(plan.removed, 260);
  assert.equal(medications[0].doseEvents.length, 260, 'Prune preview must not delete anything');
  medications[0].doseEvents = plan.events; // Explicitly accepted cleanup.
  assert.ok(doses.recordGuarded(medications[0], 'taken', health, now).event);
  assert.ok(JSON.stringify(health).length <= 220000);
});
check(() => {
  const medicine = { id: 'fictional-retention', doseEvents: [] };
  const older = doses.record(medicine, 'taken', new Date(2026, 9, 10, 8));
  const cutoffDay = doses.record(medicine, 'missed', new Date(2026, 9, 12, 8));
  const today = doses.record(medicine, 'taken', now);
  const future = doses.record(medicine, 'taken', new Date(2026, 9, 14, 8));
  const undated = { action: 'taken', recordedAt: 'unknown' };
  medicine.doseEvents.push(undated);
  const original = JSON.stringify(medicine);
  const preview = doses.pruneBefore(medicine, '2026-10-12', now);
  assert.equal(preview.removed, 1);
  assert.deepEqual(preview.events, [cutoffDay, today, future, undated]);
  assert.ok(!preview.events.includes(older));
  assert.equal(JSON.stringify(medicine), original, 'Preview leaves history intact');
  for (const invalid of ['2026-10-14', '2026-02-30', '', 'not-a-date']) {
    const rejected = doses.pruneBefore(medicine, invalid, now);
    assert.ok(rejected.error);
    assert.equal(rejected.removed, 0);
    assert.deepEqual(rejected.events, medicine.doseEvents);
  }
  assert.ok(doses.pruneBefore(medicine, '2026-10-13', now).events.includes(today));
});
check(() => {
  const source = fs.readFileSync(path.resolve(__dirname, '../health-hub.js'), 'utf8');
  const start = source.indexOf('  function pruneDoseHistory(');
  const end = source.indexOf('  function recordMedicationDose(', start);
  const medicine = { id: 'fictional-cleanup', name: 'Fictional medicine' };
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  doses.record(medicine, 'taken', yesterday);
  doses.record(medicine, 'taken', today);
  let saves = 0, confirmations = 0, accepted = false;
  const context = {
    doseStatus: doses, state: { medications: [medicine] }, showToast: () => {},
    window: { confirm: () => { confirmations += 1; return accepted; } },
    saveState: () => { saves += 1; }, renderTodayMedications: () => {}, renderTodayOverview: () => {}, renderMedicationLibrary: () => {}, openDoseHistory: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nthis.prune = pruneDoseHistory;', context);
  const form = { dataset: { medicationId: medicine.id } }, values = { cutoff: doses.localDate(today) };
  context.prune(form, values);
  assert.equal(confirmations, 0, 'Checkbox is required before removal');
  assert.equal(medicine.doseEvents.length, 2);
  values.confirmPrune = 'on';
  context.prune(form, values);
  assert.equal(confirmations, 1);
  assert.equal(medicine.doseEvents.length, 2, 'Cancelling confirmation keeps history');
  accepted = true;
  context.prune(form, values);
  assert.equal(saves, 1);
  assert.equal(medicine.doseEvents.length, 1);
  assert.equal(doses.summary(medicine, new Date()).taken, 1, 'Today survives accepted cleanup');
});
check(() => {
  const source = fs.readFileSync(path.resolve(__dirname, '../health-hub.js'), 'utf8');
  const start = source.indexOf('  function recordMedicationDose(');
  const end = source.indexOf('  function savedSupplyAmount(', start);
  const medicine = { id: 'fictional-guard-ui', name: 'Fictional medicine' };
  let saves = 0, manager = null;
  const context = {
    doseStatus: doses, serialiseHealthState: () => ({ medications: [{ ...medicine }], profile: { notes: 'x'.repeat(220000) } }),
    openDoseHistory: (id, capacityReached) => { manager = { id, capacityReached }; },
    saveState: () => { saves += 1; }, showToast: () => {}, renderTodayMedications: () => {}, renderTodayOverview: () => {}, renderMedicationLibrary: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nthis.record = recordMedicationDose;', context);
  context.record(medicine, 'taken');
  assert.equal(saves, 0, 'No oversized cloud or local save is attempted');
  assert.equal(medicine.doseEvents, undefined);
  assert.deepEqual(manager, { id: medicine.id, capacityReached: true });
});

check(() => {
  const source = fs.readFileSync(path.resolve(__dirname, '../health-hub.js'), 'utf8');
  const start = source.indexOf('  function renderMedicationLibrary(');
  const end = source.indexOf('  function renderMedicationClashPanel(', start);
  const medicine = { id: 'fictional-manage', name: 'Fictional medicine' };
  const library = { innerHTML: '', querySelectorAll: () => [] };
  const context = {
    doseStatus: doses, state: { medications: [medicine] }, els: { medicationLibrary: library },
    medicationSafetyMarkup: () => '', escapeHTML: value => String(value ?? ''), savedSupplyAmount: () => null,
    iconMarkup: () => '', renderMedicationClashPanel: () => {}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nrenderMedicationLibrary();', context);
  assert.match(library.innerHTML, /data-manage-dose-records="fictional-manage"/);
  assert.match(library.innerHTML, /aria-label="Manage dose records for Fictional medicine"/);
  assert.match(library.innerHTML, />Manage dose records<\/button>/);
});
check(() => {
  const source = fs.readFileSync(path.resolve(__dirname, '../health-hub.js'), 'utf8');
  const start = source.indexOf('  function openDoseHistory(');
  const end = source.indexOf('  function pruneDoseHistory(', start);
  const medicine = { id: 'fictional-history-form', name: 'Fictional medicine' };
  const current = new Date(), prior = new Date(current); prior.setDate(prior.getDate() - 1);
  doses.record(medicine, 'taken', prior);
  doses.record(medicine, 'taken', current);
  const listeners = {};
  const form = { elements: {
    cutoff: { value: doses.localDate(current), addEventListener: (type, callback) => { listeners.cutoff = callback; } },
    confirmPrune: { checked: false, addEventListener: (type, callback) => { listeners.confirm = callback; } }
  } };
  const count = { textContent: '' }, button = { disabled: false };
  let html = '';
  const context = {
    doseStatus: doses, state: { medications: [medicine] }, escapeHTML: value => String(value ?? ''),
    setModal: (title, eyebrow, content) => { html = content; },
    $: selector => selector === '[data-modal-form="dose-history"]' ? form : selector === '[data-dose-prune-count]' ? count : button
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nthis.open = openDoseHistory;', context);
  context.open(medicine.id, true);
  assert.match(html, /This dose was not recorded/);
  assert.match(html, /data-export-health/);
  assert.match(html, /data-modal-form="dose-history"/);
  assert.match(html, /data-medication-id="fictional-history-form"/);
  assert.match(count.textContent, /1 older record would be removed\. 1 would be kept/);
  assert.equal(button.disabled, true);
  form.elements.confirmPrune.checked = true;
  listeners.confirm();
  assert.equal(button.disabled, false);
  listeners.cutoff();
  assert.equal(form.elements.confirmPrune.checked, false, 'Changing cutoff requires a new confirmation');
  assert.equal(button.disabled, true);
  assert.equal(medicine.doseEvents.length, 2, 'Opening management never removes history');
});
check(() => {
  const source = fs.readFileSync(path.resolve(__dirname, '../health-hub.js'), 'utf8');
  const clickStart = source.indexOf('    const manageDoseRecords =');
  const clickEnd = source.indexOf('    const medToggle =', clickStart);
  let opened = '', prevented = false;
  const context = {
    openDoseHistory: id => { opened = id; },
    event: { target: { closest: () => ({ dataset: { manageDoseRecords: 'fictional-click' } }) }, preventDefault: () => { prevented = true; } }
  };
  vm.createContext(context);
  vm.runInContext(`(function(){${source.slice(clickStart, clickEnd)}})();`, context);
  assert.equal(opened, 'fictional-click');
  assert.equal(prevented, true);

  const submitStart = source.indexOf('  function handleModalSubmit(event) {');
  const submitEnd = source.indexOf("    if (form.dataset.modalForm === 'today-checkin')", submitStart);
  let submitted = null;
  const form = { dataset: { modalForm: 'dose-history', medicationId: 'fictional-submit' } };
  class InventedFormData { entries() { return [['cutoff', '2026-10-13'], ['confirmPrune', 'on']][Symbol.iterator](); } }
  const submission = {
    FormData: InventedFormData,
    pruneDoseHistory: (target, values) => { submitted = { id: target.dataset.medicationId, values }; },
    event: { target: { matches: () => false, closest: () => form }, preventDefault: () => {} }
  };
  vm.createContext(submission);
  vm.runInContext(source.slice(submitStart, submitEnd) + '\n}\nhandleModalSubmit(event);', submission);
  assert.equal(submitted.id, 'fictional-submit');
  assert.equal(submitted.values.cutoff, '2026-10-13');
  assert.equal(submitted.values.confirmPrune, 'on');
});

console.log(`Dose status verification passed (${checks} scenarios, including legacy data, repeat doses, midnight, DST, timezone changes, capacity and explicit history cleanup).`);
