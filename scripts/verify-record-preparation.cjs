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
  declaration('escapeHTML'), declaration('upcomingAppointments'),
  between('  const symptomImpactLabels =', '  const symptomLogDescription ='),
  between('  let careSummaryDraft =', '  function openPersonalOverview('),
  between('  function renderAppointments(', '  function renderProfileShortcuts('),
  between('  function openAppointmentModal(', '  function openProviderModal('),
  between('  function openCareSummary(', '  function printCareSummary('),
  between('  function handleModalSubmit(', '  function renderLocalMedicationDatabaseResult('),
  between('  async function handleClick(', '  function setupQuickAccessOrbit(')
].join('\n');

const now = Date.UTC(2026, 9, 14, 0, 0, 0);
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
    els: { appointmentsCount: {}, upcomingAppointments: {}, pastAppointments: {} },
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

(async () => {
  await verifyAppointments();
  verifySymptomBrief();
  console.log('Record preparation passed: actual appointment edit/add/cancel/stale/validation/delete flows, escaped prefill, legacy notes, identity/status/metadata/history preservation; selected structured symptom details, agenda order, date exclusion, escaping and legacy description handling. Fictional data only; no browser, real storage or network.');
})().catch(error => { console.error(error); process.exitCode = 1; });
