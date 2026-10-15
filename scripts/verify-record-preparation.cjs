'use strict';

// Run selected production functions with fictional records and an in-memory UI.
// This does not start the application, render a page, or access browser storage/network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const escaped = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const decode = value => String(value).replace(/&quot;|&#39;|&lt;|&gt;|&amp;/g, entity => ({ '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' })[entity]);
function between(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Production source fixture exists: ${start.trim()}`);
  return source.slice(first, last);
}
function declaration(name) {
  const line = source.match(new RegExp(`^  const ${name} = .+$`, 'm'))?.[0];
  assert.ok(line, `Production declaration exists: ${name}`);
  return line;
}
const production = [
  declaration('escapeHTML'),
  between('  function appointmentGroups(', '  function renderTodayOverview('),
  between('  const symptomImpactLabels =', '  const symptomLogDescription ='),
  between('  let careSummaryDraft =', '  function openPersonalOverview('),
  between('  function renderAppointments(', '  function renderProfileShortcuts('),
  between('  function openAppointmentModal(', '  function openProviderModal('),
  between('  function openCareSummary(', '  function printCareSummary('),
  between('  function handleModalSubmit(', '  function renderLocalMedicationDatabaseResult('),
  between('  async function handleClick(', '  function setupQuickAccessOrbit(')
].join('\n');

const now = new Date(2026, 9, 14, 12, 0, 0).getTime();
class FixtureDate extends Date {
  constructor(...values) { super(...(values.length ? values : [now])); }
  static now() { return now; }
}
class FixtureFormData {
  constructor(form) { this.values = { ...form.values, ...(form.elements.since ? { since: form.elements.since.value } : {}) }; }
  entries() { return Object.entries(this.values)[Symbol.iterator](); }
  get(name) { return this.values[name] ?? null; }
}
function appointmentForm(values, id = '') {
  const form = {
    values, dataset: { modalForm: 'appointment', editAppointmentId: id }, elements: {},
    matches: () => false,
    closest: selector => selector === '[data-modal-form]' ? form : null
  };
  for (const [name, value] of Object.entries(values)) form.elements[name] = { value, focused: false, focus() { this.focused = true; } };
  return form;
}
function appointmentRequestForm(values) {
  const form = { values, elements: { reason: { focused: false, focus() { this.focused = true; } } },
    matches: selector => selector === '[data-appointment-request-form]', closest: () => null };
  return form;
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
}
function prefilledForm(html) {
  const opening = attributes(html.match(/<form\b[^>]*>/)?.[0] || '');
  const values = {};
  for (const match of html.matchAll(/<input\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    if (attrs.name) values[attrs.name] = attrs.value || '';
  }
  for (const [, openingTag, text] of html.matchAll(/(<textarea\b[^>]*>)([\s\S]*?)<\/textarea>/g)) values[attributes(openingTag).name] = decode(text);
  return appointmentForm(values, opening['data-edit-appointment-id'] || '');
}
function briefForm(html) {
  const count = { textContent: '' }, emptyAll = { hidden: false };
  const fields = [...html.matchAll(/<fieldset>([\s\S]*?)<\/fieldset>/g)].map(([, body]) => {
    const choices = [...body.matchAll(/<label class="care-summary-choice"([^>]*)>([\s\S]*?)<\/label>/g)].map(([, extra, contents]) => {
      const attrs = attributes(extra), input = { checked: false, value: attributes(contents.match(/<input\b[^>]*>/)[0]).value };
      return { html: contents, hidden: false, dataset: { briefDate: attrs['data-brief-date'] },
        hasAttribute: name => Object.hasOwn(attrs, name), querySelector: selector => selector === 'input' ? input : null };
    });
    const empty = { hidden: false };
    return { choices, hidden: false, querySelector: selector => selector === '[data-brief-empty]' ? empty : selector === '.care-summary-choice:not([hidden])' ? choices.find(choice => !choice.hidden) || null : null };
  });
  const choices = fields.flatMap(field => field.choices);
  const since = attributes(html.match(/<input\b[^>]*name="since"[^>]*>/)[0]).value;
  const form = {
    values: { focus: '', questions: '', appointment: '' },
    elements: { since: { value: since, addEventListener() {} } }, choices,
    matches: selector => selector === '[data-care-summary-form]',
    querySelectorAll: selector => selector === 'fieldset' ? fields : selector === '.care-summary-choice' ? choices : selector === '.care-summary-choice:not([hidden]) input:checked' ? choices.filter(choice => !choice.hidden && choice.querySelector('input').checked).map(choice => choice.querySelector('input')) : [],
    querySelector: selector => selector === '[data-brief-count]' ? count : selector === '[data-brief-empty-all]' ? emptyAll : null
  };
  return form;
}
function fixture(initial = {}) {
  const state = { medications: [], appointments: [], providers: [], timeline: [], measurements: [], documents: [], tasks: [], profile: {}, ...clone(initial) };
  const observed = { modals: [], toasts: [], saves: [], renders: 0, closes: 0, routes: [], forbiddenCalls: 0, confirm: true };
  let activeBriefForm;
  const forbidden = () => { observed.forbiddenCalls++; throw new Error('Browser, network and real storage access are forbidden in this synthetic check.'); };
  const context = vm.createContext({
    state, Date: FixtureDate, FormData: FixtureFormData,
    els: { appointmentsCount: {}, upcomingAppointments: {}, pastAppointments: {}, modalBody: { append: item => observed.returnedForm = item } },
    document: { body: { classList: { contains: () => false } }, querySelector: () => null },
    window: { confirm: () => observed.confirm, fetch: forbidden, open: forbidden },
    fetch: forbidden, localStorage: { getItem: forbidden, setItem: forbidden }, sessionStorage: { getItem: forbidden, setItem: forbidden },
    iconMarkup: () => '<svg aria-hidden="true"></svg>',
    formatDate: value => `Formatted ${value}`, formatTime: value => value,
    appointmentParts: () => ({ day: '20', month: 'Oct', weekday: 'Tue' }),
    $: selector => selector === '[data-care-summary-form]' ? activeBriefForm : null,
    setModal: (title, eyebrow, html) => { observed.modals.push({ title, eyebrow, html }); if (html.includes('data-care-summary-form')) activeBriefForm = briefForm(html); },
    saveState: () => observed.saves.push(clone(state)), renderAll: () => observed.renders++,
    closeModal: () => observed.closes++, showToast: text => observed.toasts.push(text),
    showView: (...route) => observed.routes.push(route)
  });
  vm.runInContext(production, context, { timeout: 1000, filename: 'health-hub-selected-record-functions.js' });
  return { context, state, observed, modal: () => observed.modals.at(-1), brief: () => activeBriefForm };
}
function submit(context, form) {
  let prevented = false;
  context.handleModalSubmit({ target: form, preventDefault() { prevented = true; } });
  assert.ok(prevented, 'The real submit handler intercepts the fictional form.');
}
async function click(context, attribute, value = '') {
  const key = attribute.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const button = { dataset: { [key]: value } };
  await context.handleClick({ target: { closest: selector => selector === `[${attribute}]` ? button : null }, preventDefault() {} });
}

function verifyAppointmentDayRefresh() {
  const f = fixture({ appointments: [{ id: 'fictional-refresh-visit', title: 'Fictional visit', date: '2026-10-14', time: '09:00', status: 'upcoming' }] });
  const before = clone(f.state);
  const calls = { overview: 0, preview: 0, appointments: 0 };
  let clock = new Date(2026, 9, 14, 12, 0, 0).getTime();
  f.context.Date = class extends Date {
    constructor(...values) { super(...(values.length ? values : [clock])); }
  };
  f.context.renderTodayOverview = () => calls.overview++;
  f.context.renderTodayAppointment = () => calls.preview++;
  f.context.renderAppointments = () => calls.appointments++;
  // Invoke only the real controller; browser events and timer execution are not exercised.
  f.context.refreshAppointmentDateViews();
  assert.deepEqual(calls, { overview: 1, preview: 1, appointments: 1 }, 'The initial day refresh updates all three appointment surfaces.');
  clock = new Date(2026, 9, 14, 23, 59, 59).getTime();
  f.context.refreshAppointmentDateViews();
  assert.deepEqual(calls, { overview: 1, preview: 1, appointments: 1 }, 'Repeated refresh on the same local day does not rerender.');
  clock = new Date(2026, 9, 15, 0, 0, 0).getTime();
  f.context.refreshAppointmentDateViews();
  assert.deepEqual(calls, { overview: 2, preview: 2, appointments: 2 }, 'Advancing to the next local day refreshes overview, preview and appointment list once.');
  f.context.refreshAppointmentDateViews();
  assert.deepEqual(calls, { overview: 2, preview: 2, appointments: 2 }, 'The new local day is recorded before later refresh calls.');
  assert.deepEqual(clone(f.state), before, 'The date-view refresh does not rewrite saved records.');
  assert.equal(f.observed.saves.length, 0, 'The date-view refresh does not persist derived UI state.');
  assert.equal(f.observed.forbiddenCalls, 0);
}

async function verifyAppointmentDateGroups() {
  const records = [
    { id: 'future-later', title: 'Later fictional visit', date: '2026-10-20', time: '15:00', status: 'upcoming' },
    { id: 'previous-later-time', title: 'Yesterday later', date: '2026-10-13', time: '16:00', status: 'upcoming' },
    { id: 'date-invalid', title: 'Invalid <date> & details', date: '2026-02-30', time: '11:00', status: 'upcoming' },
    { id: 'previous-older', title: 'Older fictional visit', date: '2026-10-01', time: '09:00', status: 'upcoming' },
    { id: 'today-later', title: 'Today later', date: '2026-10-14', time: '18:00', status: 'past' },
    { id: 'date-missing', title: 'Missing fictional date', time: '08:00', status: 'past', opaqueMetadata: { retained: true } },
    { id: 'today-earlier', title: 'Today earlier', date: '2026-10-14', time: '07:00', status: 'upcoming' },
    { id: 'future-legacy-past', title: 'Future visit with stale status', date: '2026-10-16', time: '09:00', status: 'past' },
    { id: 'previous-earlier-time', title: 'Yesterday earlier', date: '2026-10-13', time: '08:00', status: 'upcoming' },
    { id: 'date-unknown', title: 'Unknown fictional date', date: 'not-a-date', time: '10:00', status: 'upcoming' }
  ];
  const history = [{ id: 'original-grouping-history', type: 'appointment', title: 'Original history must stay unchanged' }];
  const f = fixture({ appointments: records, timeline: history });
  const before = clone(f.state);
  const ids = entries => Array.from(entries, entry => entry.id);
  const groups = f.context.appointmentGroups(new FixtureDate(2026, 9, 14, 12));
  const expectedUpcoming = ['today-earlier', 'today-later', 'future-legacy-past', 'future-later'];
  const expectedPrevious = ['previous-later-time', 'previous-earlier-time', 'previous-older'];
  const expectedNeedsDate = ['date-invalid', 'date-missing', 'date-unknown'];
  assert.deepEqual(ids(groups.upcoming), expectedUpcoming, 'Today/future dates win over legacy status and sort by ascending date/time.');
  assert.deepEqual(ids(groups.previous), expectedPrevious, 'Past dates win over stale upcoming status and sort by descending date/time.');
  assert.deepEqual(ids(groups.needsDate), expectedNeedsDate, 'Missing, invalid and unknown dates form a separate group in saved order.');
  assert.deepEqual(ids(vm.runInContext('upcomingAppointments()', f.context)), expectedUpcoming, 'The existing next-appointment consumer returns only valid today/future appointments.');
  assert.equal(vm.runInContext('upcomingAppointments()[0].id', f.context), 'today-earlier', 'A stale past-dated upcoming record cannot become the next appointment.');
  assert.deepEqual(clone(f.state), before, 'Grouping preserves stored record order, fields, statuses and history.');

  f.context.renderAppointments();
  const current = f.context.els.upcomingAppointments.innerHTML;
  const previous = f.context.els.pastAppointments.innerHTML;
  const editIDs = html => [...html.matchAll(/data-edit-appointment="([^"]+)"/g)].map(([, id]) => decode(id));
  const deleteIDs = html => [...html.matchAll(/data-delete-appointment="([^"]+)"/g)].map(([, id]) => decode(id));
  assert.deepEqual(editIDs(current), [...expectedUpcoming, ...expectedNeedsDate], 'The current card renders the same upcoming order and all date-needed entries with Edit.');
  assert.deepEqual(deleteIDs(current), [...expectedUpcoming, ...expectedNeedsDate], 'Every upcoming/date-needed record retains its Delete action.');
  assert.deepEqual(editIDs(previous), expectedPrevious, 'Previous appointments remain visible and editable in reverse date/time order.');
  assert.deepEqual(deleteIDs(previous), expectedPrevious, 'Previous appointments retain their exact Delete actions.');
  assert.match(current, /needs? (?:a )?(?:valid )?date|date (?:needs? (?:review|confirmation)|to (?:check|confirm))/i, 'Date-needed records have a visible explanatory label.');
  assert.ok(current.includes(escaped(records[2].title)), 'Date-needed titles remain escaped.');
  assert.doesNotMatch(current, /Invalid <date>/, 'Invalid-date display cannot inject markup.');
  for (const id of expectedNeedsDate) assert.ok(!current.includes(`data-prepare-appointment="${id}"`), 'Date-needed entries cannot imply a scheduled next appointment.');
  assert.match(f.context.els.appointmentsCount.textContent, /^4\b/, 'Scheduled count includes only valid today/future dates.');
  assert.deepEqual(clone(f.state), before, 'Rendering does not rewrite saved status or history to produce its groups.');
  assert.equal(f.observed.saves.length, 0, 'Grouping/rendering does not save derived state.');

  f.context.openCareSummary();
  const appointmentSelect = f.modal().html.match(/<select name="appointment">([\s\S]*?)<\/select>/)?.[1];
  assert.ok(appointmentSelect, 'Visit brief still exposes the explicit appointment picker.');
  const optionValues = [...appointmentSelect.matchAll(/<option value="([^"]*)">/g)].map(([, value]) => value);
  assert.deepEqual(optionValues, ['', ...records.map((_, index) => String(index))], 'Brief choices retain all saved appointments, including previous and date-needed records.');
  for (const record of records) assert.ok(appointmentSelect.includes(escaped(record.title)), 'The selected-brief picker retains each saved appointment.');
  assert.deepEqual(clone(f.state), before);

  const boundary = fixture({ appointments: [{ id: 'day-boundary', title: 'Fictional boundary visit', date: '2026-10-14', time: '00:01', status: 'upcoming' }] });
  const lateToday = boundary.context.appointmentGroups(new FixtureDate(2026, 9, 14, 23, 59, 59));
  const nextDay = boundary.context.appointmentGroups(new FixtureDate(2026, 9, 15, 0, 0, 0));
  assert.deepEqual(ids(lateToday.upcoming), ['day-boundary'], 'An appointment remains in today’s group until the local day changes, even after its time.');
  assert.deepEqual(ids(lateToday.previous), []);
  assert.deepEqual(ids(nextDay.upcoming), [], 'The same record leaves upcoming at the next local day boundary.');
  assert.deepEqual(ids(nextDay.previous), ['day-boundary']);
  assert.equal(boundary.state.appointments[0].status, 'upcoming', 'Day-boundary grouping does not migrate stored status.');

  const move = fixture({ appointments: [{ id: 'date-edit-move', title: 'Fictional movable visit', date: '2026-10-13', time: '09:00', status: 'upcoming', opaqueMetadata: { retained: true } }], timeline: history });
  const edited = { title: 'Fictional movable visit', provider: 'Fictional clinic', date: '2026-10-20', time: '09:00', location: 'Room one', note: 'Fictional preparation' };
  assert.deepEqual(ids(move.context.appointmentGroups().previous), ['date-edit-move']);
  await click(move.context, 'data-edit-appointment', 'date-edit-move');
  assert.equal(prefilledForm(move.modal().html).values.date, '2026-10-13', 'A previous appointment opens its actual existing date for editing.');
  submit(move.context, appointmentForm(edited, 'date-edit-move'));
  assert.deepEqual(ids(move.context.appointmentGroups().upcoming), ['date-edit-move'], 'Editing the saved date moves that same appointment into upcoming.');
  assert.deepEqual(ids(move.context.appointmentGroups().previous), []);
  move.context.renderAppointments();
  assert.deepEqual(editIDs(move.context.els.upcomingAppointments.innerHTML), ['date-edit-move']);
  assert.deepEqual(editIDs(move.context.els.pastAppointments.innerHTML), []);
  submit(move.context, appointmentForm({ ...edited, date: '2026-10-12' }, 'date-edit-move'));
  assert.deepEqual(ids(move.context.appointmentGroups().upcoming), []);
  assert.deepEqual(ids(move.context.appointmentGroups().previous), ['date-edit-move'], 'Moving the date back moves the existing record into previous.');
  assert.equal(move.state.appointments.length, 1, 'Date corrections never create duplicate appointments.');
  assert.equal(move.state.appointments[0].status, 'upcoming');
  assert.deepEqual(move.state.appointments[0].opaqueMetadata, { retained: true });
  assert.deepEqual(clone(move.state.timeline.slice(2)), history, 'Date edits retain original history after their separate update events.');

  const repair = fixture({ appointments: [records[5]] });
  assert.deepEqual(ids(repair.context.appointmentGroups().needsDate), ['date-missing']);
  await click(repair.context, 'data-edit-appointment', 'date-missing');
  const repairedForm = prefilledForm(repair.modal().html);
  assert.equal(repairedForm.dataset.editAppointmentId, 'date-missing', 'Date-needed entries open their own edit form.');
  submit(repair.context, appointmentForm({ ...repairedForm.values, date: '2026-10-18', time: '08:00' }, 'date-missing'));
  assert.deepEqual(ids(repair.context.appointmentGroups().needsDate), []);
  assert.deepEqual(ids(repair.context.appointmentGroups().upcoming), ['date-missing'], 'A repaired valid date can become upcoming despite its preserved legacy past status.');
  assert.equal(repair.state.appointments[0].status, 'past');
  for (const item of [f, boundary, move, repair]) assert.equal(item.observed.forbiddenCalls, 0);
}

async function verifyAppointments() {
  const appointment = { id: 'fictional-appointment-1', title: 'Review "questions" <one>', provider: 'Fictional & clinic', date: '2026-10-20', time: '09:15', location: 'Room <two>', notes: '</textarea><script>fictional-marker</script>', status: 'upcoming', opaqueMetadata: { retained: 'private opaque value' }, createdAt: 12345 };
  const earlierHistory = [{ id: 'old-appointment-event', type: 'appointment', appointmentId: appointment.id, date: '2026-10-01', title: 'Original appointment added', description: 'Original event' }, { id: 'other-note', type: 'medication', title: 'Unrelated note' }];
  const f = fixture({ appointments: [appointment], timeline: earlierHistory });
  f.context.renderAppointments();
  assert.ok(f.context.els.upcomingAppointments.innerHTML.includes(`data-edit-appointment="${appointment.id}"`), 'Rendered Edit identifies the existing appointment.');
  assert.doesNotMatch(f.context.els.upcomingAppointments.innerHTML, /data-modal="appointment"[^>]*>Edit details/, 'Rendered Edit must not invoke the add action.');
  await click(f.context, 'data-edit-appointment', appointment.id);
  assert.match(f.modal().title, /Edit/);
  const edit = prefilledForm(f.modal().html);
  assert.equal(edit.dataset.editAppointmentId, appointment.id);
  for (const name of ['title', 'provider', 'date', 'time', 'location']) assert.equal(edit.values[name], appointment[name], `Edit prefills ${name}.`);
  assert.equal(edit.values.note, appointment.notes, 'Legacy notes prefill the editable note.');
  for (const raw of [appointment.title, appointment.provider, appointment.location, appointment.notes]) assert.ok(f.modal().html.includes(escaped(raw)), 'Saved prefill is HTML escaped.');
  assert.doesNotMatch(f.modal().html, /<script>/, 'Saved note cannot escape its textarea.');
  const beforeCancel = clone(f.state);
  await click(f.context, 'data-close-modal');
  assert.deepEqual(clone(f.state), beforeCancel, 'Cancel leaves the saved appointment and history unchanged.');
  assert.equal(f.observed.saves.length, 0, 'Opening or cancelling an edit does not save.');
  assert.equal(f.observed.closes, 1);

  const editedValues = { title: 'Follow-up questions', provider: 'Fictional second clinic', date: '2026-11-02', time: '14:30', location: 'Room three', note: 'Updated questions' };
  submit(f.context, appointmentForm(editedValues, appointment.id));
  assert.equal(f.state.appointments.length, 1, 'Editing updates one record without adding a duplicate.');
  const updated = f.state.appointments[0];
  for (const [name, value] of Object.entries(editedValues)) assert.equal(updated[name], value, `Editing saves ${name}.`);
  assert.equal(updated.id, appointment.id);
  assert.equal(updated.status, appointment.status);
  assert.equal(updated.createdAt, appointment.createdAt);
  assert.deepEqual(updated.opaqueMetadata, appointment.opaqueMetadata, 'Editing retains unknown stored metadata.');
  assert.equal(updated.notes, editedValues.note, 'Existing legacy notes do not resurrect obsolete text.');
  assert.equal(f.state.timeline.length, earlierHistory.length + 1);
  assert.deepEqual(clone(f.state.timeline.slice(1)), earlierHistory, 'Earlier history events remain unchanged.');
  const event = f.state.timeline[0];
  assert.equal(event.title, `${editedValues.title} updated`, 'History distinguishes an update from a new appointment.');
  assert.equal(event.appointmentId, appointment.id, 'The update event links to the exact appointment.');
  assert.equal(event.date, new FixtureDate().toLocaleDateString('en-CA'), 'Update history records the local edit day, not the future visit day.');
  assert.ok(event.description.includes(editedValues.provider) && event.description.includes(editedValues.date));
  assert.equal(f.observed.saves.length, 1);
  assert.deepEqual(f.observed.saves[0].appointments, clone(f.state.appointments), 'The edited record reaches the persistence boundary.');
  assert.equal(f.observed.closes, 2);
  assert.equal(f.observed.routes.at(-1)[0], 'appointments');

  const beforeStale = clone(f.state), savesBeforeStale = f.observed.saves.length, closesBeforeStale = f.observed.closes;
  submit(f.context, appointmentForm(editedValues, 'missing-fictional-id'));
  assert.deepEqual(clone(f.state), beforeStale, 'A stale edit ID cannot create or change any record.');
  assert.equal(f.observed.saves.length, savesBeforeStale);
  assert.equal(f.observed.closes, closesBeforeStale, 'A rejected stale edit remains open.');
  assert.match(f.observed.toasts.at(-1), /no longer/i);
  const modalCount = f.observed.modals.length;
  await click(f.context, 'data-edit-appointment', 'missing-fictional-id');
  assert.equal(f.observed.modals.length, modalCount, 'A stale Edit button cannot silently open an add form.');

  for (const [name, value] of [['title', ' '], ['date', '2026-02-30'], ['time', '25:60']]) {
    const invalid = appointmentForm({ ...editedValues, [name]: value }, appointment.id);
    submit(f.context, invalid);
    assert.deepEqual(clone(f.state), beforeStale, `Invalid ${name} leaves saved records intact.`);
    assert.ok(invalid.elements[name].focused, `Invalid ${name} receives focus.`);
  }

  await click(f.context, 'data-modal', 'appointment');
  const add = prefilledForm(f.modal().html);
  assert.equal(add.dataset.editAppointmentId, '', 'Add opens without an edit identity.');
  assert.ok(Object.values(add.values).every(value => value === ''), 'Add starts with blank fields.');
  submit(f.context, appointmentForm({ ...editedValues, title: 'New fictional visit', provider: '', location: '', note: '' }));
  assert.equal(f.state.appointments.length, 2, 'Adding retains the existing appointment and creates one new record.');
  const added = f.state.appointments[1];
  assert.notEqual(added.id, appointment.id);
  assert.equal(added.status, 'upcoming');
  assert.equal(added.provider, 'Provider to confirm');
  assert.equal(added.location, 'Location to confirm');
  assert.equal(f.state.timeline[0].title, 'New fictional visit added');
  assert.equal(f.state.timeline[0].appointmentId, added.id);
  assert.equal(f.state.timeline[0].date, editedValues.date);
  assert.equal(f.observed.forbiddenCalls, 0);

  const past = fixture({ appointments: [{ ...appointment, status: 'past', note: '', notes: 'Old legacy note' }] });
  past.context.openAppointmentModal(past.state.appointments[0]);
  assert.equal(prefilledForm(past.modal().html).values.note, '', 'An explicit empty note takes precedence over legacy notes.');
  submit(past.context, appointmentForm(editedValues, appointment.id));
  assert.equal(past.state.appointments[0].status, 'past', 'Editing a past appointment preserves its status.');

  const sameTitle = { id: 'fictional-appointment-2', title: appointment.title, date: '2026-10-22', time: '10:00', status: 'upcoming' };
  const events = [
    { id: 'linked-one', type: 'appointment', appointmentId: appointment.id, title: 'First linked event' },
    { id: 'linked-two', type: 'appointment', appointmentId: sameTitle.id, title: 'Second linked event' },
    { id: 'ambiguous-legacy', type: 'appointment', title: `${appointment.title} added` },
    { id: 'unrelated-type', type: 'medication', appointmentId: appointment.id, title: 'Unrelated event' }
  ];
  const deletion = fixture({ appointments: [appointment, sameTitle], timeline: events });
  deletion.observed.confirm = false;
  await click(deletion.context, 'data-delete-appointment', appointment.id);
  assert.deepEqual(clone(deletion.state.appointments), [appointment, sameTitle], 'Cancelled deletion retains both appointments.');
  assert.deepEqual(clone(deletion.state.timeline), events);
  deletion.observed.confirm = true;
  await click(deletion.context, 'data-delete-appointment', appointment.id);
  assert.deepEqual(clone(deletion.state.appointments), [sameTitle], 'Delete removes only the chosen appointment.');
  assert.deepEqual(clone(deletion.state.timeline), events.slice(1), 'Delete retains other links, ambiguous legacy events and unrelated event types.');
  assert.equal(deletion.observed.saves.length, 1);
  assert.equal(deletion.observed.forbiddenCalls, 0);
}

async function verifyLegacyNumericIDActions() {
  const symptom = { id: 17, type: 'symptom', name: 'Fictional numeric-ID symptom', date: '2026-10-13' };
  const firstAppointment = { id: 21, title: 'First fictional appointment', date: '2026-10-18', time: '08:00', status: 'upcoming' };
  const selectedAppointment = { id: 22, title: 'Selected fictional appointment', date: '2026-10-20', time: '09:00', status: 'upcoming' };
  const linkedAppointmentEvent = { id: 'numeric-appointment-event', type: 'appointment', appointmentId: 22, title: 'Fictional appointment event' };
  const f = fixture({ timeline: [symptom, linkedAppointmentEvent], appointments: [firstAppointment, selectedAppointment] });
  const openedSymptoms = [], preparedAppointments = [], symptomPrompts = [];
  f.context.openSymptomModal = entry => openedSymptoms.push(entry);
  f.context.prepareAppointment = appointment => preparedAppointments.push(appointment);
  f.context.fillChat = prompt => symptomPrompts.push(prompt);
  f.context.clearMedicationSafetyResults = () => {};

  await click(f.context, 'data-edit-symptom', '17');
  assert.equal(openedSymptoms[0]?.id, 17, 'A stringified symptom button ID finds the stored numeric ID for editing.');
  await click(f.context, 'data-prepare-symptom', '17');
  assert.match(symptomPrompts[0] || '', /Fictional numeric-ID symptom/, 'A stringified symptom button ID prepares the chosen numeric-ID diary entry.');
  await click(f.context, 'data-delete-symptom', '17');
  assert.deepEqual(clone(f.state.timeline), [linkedAppointmentEvent], 'Deleting a numeric-ID symptom removes only that selected entry.');

  f.context.renderAppointments();
  assert.ok(f.context.els.upcomingAppointments.innerHTML.includes('data-prepare-appointment="22"'), 'The selected numeric-ID appointment renders a prepare action.');
  await click(f.context, 'data-prepare-appointment', '22');
  assert.equal(preparedAppointments.at(-1)?.title, selectedAppointment.title, 'Prepare targets the chosen numeric-ID appointment, not an earlier one.');
  const preparedCount = preparedAppointments.length;
  await click(f.context, 'data-prepare-appointment', 'missing-fictional-appointment');
  assert.equal(preparedAppointments.length, preparedCount, 'A stale prepare action does not fall back to a different upcoming appointment.');

  await click(f.context, 'data-delete-appointment', '22');
  assert.deepEqual(clone(f.state.appointments), [firstAppointment], 'A stringified appointment button ID deletes only the selected numeric-ID record.');
  assert.deepEqual(clone(f.state.timeline), [], 'Deleting a numeric-ID appointment removes only its linked event.');
  assert.equal(f.observed.forbiddenCalls, 0);
}

function verifyProfileBrief() {
  const profile = {
    name: 'Fictional adult', bloodType: 'Fictional O positive',
    conditions: 'Fictional condition <script>blocked</script>',
    allergies: 'Fictional allergy & reaction', notes: 'Fictional profile note <two>'
  };
  const f = fixture({ profile });
  f.context.openCareSummary();
  const form = f.brief();
  const choices = form.choices.filter(choice => choice.html.includes('Fictional'));
  assert.equal(choices.length, 4, 'The optional profile group offers conditions, allergies, blood type and notes.');
  assert.ok(choices.every(choice => !choice.querySelector('input').checked), 'Profile information requires explicit selection.');
  form.elements.since.value = '2026-10-14';
  f.context.updateBriefPeriod(form);
  assert.ok(choices.every(choice => !choice.hidden), 'Profile details without record dates remain available after the date filter changes.');
  const condition = choices.find(choice => choice.html.includes('Conditions &amp; history'));
  condition.querySelector('input').checked = true;
  form.values.focus = 'Review this fictional history';
  submit(f.context, form);
  const html = f.modal().html;
  assert.ok(html.includes('Conditions &amp; history: Fictional condition &lt;script&gt;blocked&lt;/script&gt;'), 'The explicitly chosen profile detail reaches the reviewed brief with escaping.');
  for (const unselected of [profile.allergies, profile.bloodType, profile.notes, profile.name]) assert.ok(!html.includes(unselected), `Unselected profile detail is excluded: ${unselected}`);
  assert.equal(f.observed.saves.length, 0, 'Selecting profile context for a brief does not rewrite saved records.');
  assert.equal(f.observed.forbiddenCalls, 0);
}

function verifySymptomBrief() {
  const symptom = { id: 'fictional-symptom-one', type: 'symptom', source: 'symptom-diary', name: 'Fictional <symptom>', date: '2026-10-13', time: '07:45', severity: 4, duration: 'Ten minutes', location: 'Left <side>', frequency: 'Twice & briefly', quality: 'Pressure "feeling"', associatedSymptoms: 'Fictional companion', impact: 'some', interventions: 'Rested <script>fictional</script>', context: 'After a fictional task', triggers: 'A recorded context', notes: 'Question & detail', description: 'DERIVED_DIARY_DESCRIPTION_MUST_NOT_APPEAR', opaqueMetadata: { secret: 'OPAQUE_METADATA_MUST_NOT_APPEAR' }, internalSecret: 'UNKNOWN_FIELD_MUST_NOT_APPEAR' };
  const unchecked = { ...symptom, id: 'fictional-unchecked', date: '2026-10-12', name: 'UNCHECKED_SYMPTOM_MUST_NOT_APPEAR' };
  const old = { ...symptom, id: 'fictional-old', date: '2026-08-01', name: 'DATE_EXCLUDED_SYMPTOM_MUST_NOT_APPEAR' };
  const f = fixture({ timeline: [symptom, unchecked, old] });
  f.context.openCareSummary();
  const form = f.brief();
  assert.ok(form.choices.every(choice => !choice.querySelector('input').checked), 'Saved symptoms require explicit selection.');
  const selected = form.choices.find(choice => choice.html.includes(escaped(symptom.name)));
  const excluded = form.choices.find(choice => choice.html.includes(old.name));
  assert.ok(selected && !selected.hidden);
  assert.ok(excluded.hidden, 'The original date filter still excludes older records.');
  selected.querySelector('input').checked = true;
  excluded.querySelector('input').checked = true;
  form.values.focus = 'First concern';
  form.values.questions = 'First question\nSecond question';
  submit(f.context, form);
  const html = f.modal().html;
  for (const [label, value] of [['Where', symptom.location], ['Pattern', symptom.frequency], ['Feels like', symptom.quality], ['Alongside', symptom.associatedSymptoms], ['Impact', 'Some activities were harder'], ['Tried', symptom.interventions]]) assert.ok(html.includes(escaped(`${label}: ${value}`)), `Selected brief retains labelled ${label} detail.`);
  for (const value of [symptom.name, symptom.date, symptom.time, 'Intensity: 4/10', symptom.duration, symptom.context, symptom.triggers, symptom.notes]) assert.ok(html.includes(escaped(value)), 'Selected brief retains the original symptom information.');
  for (const sentinel of [unchecked.name, old.name, symptom.description, symptom.opaqueMetadata.secret, symptom.internalSecret]) assert.ok(!html.includes(sentinel), `Brief excludes unselected, filtered, derived or unknown information: ${sentinel}`);
  assert.doesNotMatch(html, /<script>/, 'Selected symptom details stay escaped in the reviewed output.');
  assert.ok(html.indexOf('What matters most') < html.indexOf('Questions to ask') && html.indexOf('Questions to ask') < html.indexOf('What I noticed'), 'Personal priorities precede the selected symptom records.');
  assert.ok(html.indexOf('First question') < html.indexOf('Second question'), 'Question order is retained.');
  assert.equal(f.observed.saves.length, 0, 'Preparing or reviewing a brief does not change saved health records.');
  assert.equal(f.observed.forbiddenCalls, 0);

  const legacy = fixture({ timeline: [
    { id: 'legacy-one', type: 'symptom', title: 'Legacy fictional symptom', date: '2026-10-12', notes: 'Existing note', description: 'Distinct legacy detail' },
    { id: 'legacy-two', type: 'symptom', title: 'Legacy matching symptom', date: '2026-10-11', notes: 'SAME_NOTE_TEXT', description: 'SAME_NOTE_TEXT' },
    { id: 'legacy-three', type: 'symptom', title: 'Legacy description-only symptom', date: '2026-10-10', description: 'Description-only fallback' }
  ] });
  legacy.context.openCareSummary();
  for (const choice of legacy.brief().choices) choice.querySelector('input').checked = true;
  submit(legacy.context, legacy.brief());
  const legacyHTML = legacy.modal().html;
  for (const text of ['Notes: Existing note', 'Saved description: Distinct legacy detail', 'Saved description: Description-only fallback']) assert.ok(legacyHTML.includes(text), 'Legacy symptom details survive brief preparation.');
  assert.equal(legacyHTML.split('SAME_NOTE_TEXT').length - 1, 1, 'Matching legacy descriptions are not repeated.');
  assert.equal(legacy.observed.forbiddenCalls, 0);
}

function verifyStructuredProfileAndDiaryQuestions() {
  const f = fixture({
    profile: {
      conditions: 'Current fictional condition only', allergies: 'Earlier compatibility allergy',
      conditionEntries: [
        { label: 'Current fictional condition', status: 'current', source: 'user' },
        { label: 'Historical fictional condition', status: 'historical', source: 'user' }
      ],
      allergyEntries: [
        { substance: 'Fictional pollen', reaction: 'Fictional rash', certainty: 'confirmed', source: 'user' },
        { substance: 'Fictional cream', reaction: 'Uncertain itch', certainty: 'suspected', source: 'user' }
      ]
    },
    timeline: [
      { id: 'fictional-q', type: 'question', source: 'user-question', date: '2026-10-13', description: 'Should I discuss my fictional sleep note?' },
      { id: 'fictional-old-q', type: 'question', source: 'user-question', date: '2026-08-01', description: 'OLD_QUESTION_MUST_NOT_APPEAR' }
    ]
  });
  f.context.openCareSummary();
  const form = f.brief();
  const condition = form.choices.find(choice => choice.html.includes('Historical fictional condition'));
  const allergy = form.choices.find(choice => choice.html.includes('Fictional cream'));
  const question = form.choices.find(choice => choice.html.includes('Should I discuss'));
  const oldQuestion = form.choices.find(choice => choice.html.includes('OLD_QUESTION'));
  assert.ok(condition && allergy && question && oldQuestion);
  assert.ok(!condition.querySelector('input').checked && !allergy.querySelector('input').checked && !question.querySelector('input').checked);
  assert.ok(oldQuestion.hidden, 'The default date window hides older diary questions.');
  condition.querySelector('input').checked = true;
  allergy.querySelector('input').checked = true;
  question.querySelector('input').checked = true;
  oldQuestion.querySelector('input').checked = true;
  submit(f.context, form);
  const html = f.modal().html;
  for (const text of ['Current fictional condition (current)', 'Historical fictional condition (historical)', 'Fictional pollen; reaction: Fictional rash (recorded as confirmed by you)', 'Fictional cream; reaction: Uncertain itch (possible reaction)', 'Should I discuss my fictional sleep note?']) assert.ok(html.includes(text), `Reviewed brief preserves selected status or question: ${text}`);
  assert.ok(!html.includes('OLD_QUESTION_MUST_NOT_APPEAR') && !html.includes('Earlier compatibility allergy'), 'Historical date filtering and structured profile precedence remain intact.');
  assert.equal(f.observed.saves.length, 0, 'Preparing a brief does not change saved health records.');
}

async function verifyAppointmentRequestDraft() {
  const f = fixture({ profile: { name: 'Fictional person' }, appointments: [{ id: 'fictional-visit', title: 'Existing fictional visit' }] });
  const before = clone(f.state);
  f.context.openAppointmentRequest();
  assert.match(f.modal().html, /does not send this draft, contact a clinic or book an appointment/i);
  assert.match(f.modal().html, /data-appointment-request-form/);
  const empty = appointmentRequestForm({ reason: '  ' });
  submit(f.context, empty);
  assert.ok(empty.elements.reason.focused, 'A blank reason returns focus to its field.');
  assert.match(f.observed.toasts.at(-1), /reason/i);
  assert.deepEqual(clone(f.state), before, 'Opening and validating a request changes no saved records.');
  const values = { clinic: 'Fictional clinic <script>', reason: 'Discuss my fictional concern & question', preferred: 'Tuesday afternoon', questions: 'What should I prepare?\nNo real patient data.' };
  const form = appointmentRequestForm(values);
  submit(f.context, form);
  assert.match(f.modal().html, /No appointment has been requested or booked/);
  assert.ok(f.modal().html.includes(escaped(values.clinic)) && !f.modal().html.includes('<script>'), 'Review escapes clinic supplied text.');
  const copied = [];
  f.context.navigator = { clipboard: { writeText: async text => { copied.push(text); } } };
  await click(f.context, 'data-copy-appointment-request');
  assert.equal(copied.length, 1, 'Copy runs only after the explicit button action.');
  assert.ok(copied[0].includes(values.reason) && copied[0].includes('No appointment is booked.'));
  assert.ok(!copied[0].includes('Fictional person') && !copied[0].includes('Existing fictional visit'), 'Unselected saved details are excluded.');
  await click(f.context, 'data-edit-appointment-request');
  assert.equal(f.observed.returnedForm, form, 'Back to edit restores the draft form without saving it.');
  assert.deepEqual(clone(f.state), before);
  assert.equal(f.observed.saves.length, 0);
  assert.equal(f.observed.forbiddenCalls, 0, 'Request preparation has no network or browser storage calls.');
}

(async () => {
  verifyAppointmentDayRefresh();
  await verifyAppointmentDateGroups();
  await verifyAppointments();
  await verifyLegacyNumericIDActions();
  verifyProfileBrief();
  verifySymptomBrief();
  verifyStructuredProfileAndDiaryQuestions();
  await verifyAppointmentRequestDraft();
  console.log('Record preparation passed: appointment day-refresh controller, date groups/ordering/day boundary/repair, record edit/add/cancel/stale/validation/delete flows, stringified legacy numeric IDs and exact appointment targeting, optional explicitly selected profile details, escaped prefill, history preservation, structured status and selected diary questions in visit briefs, and a reviewed appointment request draft with explicit copy and no booking or storage. Fictional data only; no browser, real storage or network. Browser timer execution remains unverified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
