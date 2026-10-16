(function () {
  'use strict';
  const core = window.DoctorAICompanionCore;
  if (!core) return;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const make = (tag, className, content) => { const node = document.createElement(tag); if (className) node.className = className; if (content !== undefined) node.textContent = content; return node; };
  const labels = { confirmed: 'Confirmed by you', requested: 'Requested by you', booked: 'Booked (your note)', awaiting: 'Awaiting clarification', completed: 'Completed (your note)' };
  const scopeLabels = { summary: 'Care summary', medicines: 'Medicine list', appointments: 'Appointments', steps: 'Next steps' };
  let storageAvailable = true;
  let state;
  let lastCalendarDate = core.localToday();

  function announce(message) { $('#demo-status').textContent = message; }
  function showError(selector, message) { const element = $(selector); element.textContent = message; element.hidden = !message; }
  function load() {
    try {
      const saved = sessionStorage.getItem(core.STORAGE_KEY);
      if (!saved) return core.initialState();
      const parsed = JSON.parse(saved);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.steps)) throw new Error('Invalid demo data');
      return core.normalizeState(parsed);
    } catch (_) {
      storageAvailable = false;
      announce('This browser could not restore the demo. Start with a fresh local preview.');
      return core.initialState();
    }
  }
  function persist() {
    try { sessionStorage.setItem(core.STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
    catch (_) { storageAvailable = false; announce('Changes work in this tab, but this browser could not keep them after a reload.'); }
  }
  function newId() { return window.crypto?.randomUUID?.() || 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
  function setTab(name) {
    const tab = ['plan', 'say', 'family'].includes(name) ? name : 'plan';
    $$('[data-companion-tab]').forEach(link => { if (link.dataset.companionTab === tab) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    $$('[data-companion-panel]').forEach(panel => { panel.hidden = panel.dataset.companionPanel !== tab; });
  }
  function focusMovedStep(id) { $$('[data-step-progress]').find(control => control.dataset.stepProgress === id)?.focus(); }
  function refreshCalendar() {
    const today = core.localToday();
    if (today === lastCalendarDate) return;
    lastCalendarDate = today;
    renderSteps(); renderFamily();
    announce('Dates in the local plan have been refreshed. There are no background reminders.');
  }
  function route() {
    const hash = location.hash.slice(1);
    setTab(hash === 'step-form' ? 'plan' : hash);
  }
  function renderStep(step) {
    const card = make('article', 'step-card');
    const top = make('div', 'step-card-top');
    const heading = make('div');
    const marker = make('span', 'step-status ' + (step.sample ? 'step-sample' : ''), step.sample ? 'Fictional example · ' + (step.status === 'draft' ? 'Draft' : labels[step.status]) : (step.status === 'draft' ? 'Draft · review needed' : labels[step.status]));
    const title = make('h4', '', step.title);
    heading.append(marker, title);
    top.append(heading);
    if (step.dueDate) top.append(make('span', 'step-date ' + (core.dateState(step).startsWith('Overdue') ? 'step-date-late' : ''), core.dateState(step)));
    card.append(top);
    if (step.source) { const source = make('p', 'step-source'); source.append(make('strong', '', 'From your note: '), document.createTextNode(step.source)); card.append(source); }
    const controls = make('div', 'step-controls');
    if (step.status === 'draft') {
      const confirm = make('button', 'companion-button companion-button-primary', 'Confirm wording'); confirm.type = 'button'; confirm.dataset.confirmStep = step.id; controls.append(confirm);
    } else {
      const statusLabel = make('label', 'step-progress-label', 'Progress');
      const select = make('select', 'step-progress'); select.dataset.stepProgress = step.id; select.setAttribute('aria-label', 'Progress for ' + step.title);
      for (const status of ['confirmed', 'requested', 'booked', 'awaiting', 'completed']) { const option = make('option', '', labels[status]); option.value = status; select.append(option); }
      select.value = step.status;
      statusLabel.append(select); controls.append(statusLabel);
      const include = make('label', 'step-include'); const input = make('input'); input.type = 'checkbox'; input.checked = step.includeInBrief; input.dataset.stepInclude = step.id; include.append(input, document.createTextNode('Include in brief')); controls.append(include);
    }
    const edit = make('button', 'companion-button companion-button-quiet', 'Edit'); edit.type = 'button'; edit.dataset.editStep = step.id;
    const remove = make('button', 'companion-button companion-button-quiet', 'Remove'); remove.type = 'button'; remove.dataset.removeStep = step.id; remove.setAttribute('aria-label', 'Remove ' + step.title);
    controls.append(edit, remove); card.append(controls);
    return card;
  }
  function renderSteps() {
    const groups = core.buckets(state.steps);
    for (const [group, target, empty] of [
      ['draft', '#draft-steps', 'No drafts waiting for review.'],
      ['waiting', '#waiting-steps', 'Nothing marked as waiting yet.'],
      ['plan', '#plan-steps', 'Confirm a draft to start your plan.']
    ]) {
      const host = $(target); host.replaceChildren();
      if (groups[group].length) groups[group].forEach(step => host.append(renderStep(step)));
      else host.append(make('p', 'step-empty', empty));
    }
    $('#draft-count').textContent = groups.draft.length;
    $('#review-count').textContent = groups.draft.length;
    $('#waiting-count').textContent = groups.waiting.length;
    $('#waiting-list-count').textContent = groups.waiting.length;
    $('#done-count').textContent = groups.completed.length;
    $('#plan-count').textContent = groups.plan.length;
  }
  function renderQuestions() {
    const host = $('#question-list'); host.replaceChildren(); $('#question-count').textContent = state.questions.length;
    if (!state.questions.length) { host.append(make('p', 'step-empty', 'Nothing saved yet. Write a draft above and choose “Save to visit brief”.')); return; }
    state.questions.forEach(item => {
      const row = make('article', 'question-row'); const content = make('p', '', item.text);
      const remove = make('button', 'companion-button companion-button-quiet', 'Remove'); remove.type = 'button'; remove.dataset.removeQuestion = item.id; remove.setAttribute('aria-label', 'Remove saved wording');
      row.append(content, remove); host.append(row);
    });
  }
  function renderFamily() {
    const family = state.family;
    if (family.previewApproved && core.familyIsExpired(family)) { family.previewApproved = false; family.reviewed = false; family.history.push('Sample preview expired. No access was granted.'); persist(); }
    $('#family-recipient').value = family.recipient;
    $('#family-expiry').value = family.expiry;
    $('#family-verify').checked = family.identityChecklist;
    $$('[name="family-scope"]').forEach(input => { input.checked = family.scopes.includes(input.value); });
    const preview = $('#family-share-preview'); preview.replaceChildren();
    if (!family.scopes.length) preview.append(make('p', '', 'Select sample categories to see the fictional preview.'));
    else {
      const person = core.RECIPIENTS[family.recipient];
      preview.append(make('p', 'preview-recipient', person.name + ' · ' + person.contact + ' · fictional contact'));
      const list = make('ul'); family.scopes.forEach(scope => list.append(make('li', '', scopeLabels[scope] + ' — fictional preview only'))); preview.append(list);
    }
    const stateText = family.previewApproved ? 'Sample approval shown. No invitation was sent and no one has access.' : (family.reviewed ? 'Sample access reviewed. Simulate approval if you want to see the next state.' : 'No preview approved. No one has access.');
    $('#family-state').textContent = stateText;
    $('[data-approve-family]').disabled = !family.reviewed || !core.familyCanReview(family) || family.previewApproved;
    $('[data-revoke-family]').hidden = !family.previewApproved;
    const history = $('#family-history-list'); history.replaceChildren();
    if (!family.history.length) history.append(make('li', '', 'No preview activity yet. No real access events exist.'));
    else family.history.forEach(event => history.append(make('li', '', event)));
  }
  function renderAll() { renderSteps(); renderQuestions(); renderFamily(); }
  function resetStepForm() {
    $('#step-form').reset(); $('#step-edit-id').value = ''; $('#step-submit').textContent = 'Save draft for review'; $('[data-cancel-step-edit]').hidden = true; showError('#step-error', '');
  }
  function saveStep(event) {
    event.preventDefault(); showError('#step-error', '');
    try {
      const id = $('#step-edit-id').value || newId();
      const old = state.steps.find(item => item.id === id);
      const step = core.makeStep({ title: $('#step-title').value, source: $('#step-source').value, dueDate: $('#step-date').value, sample: false }, id);
      if (old) state.steps = state.steps.map(item => item.id === id ? step : item);
      else state.steps.unshift(step);
      persist(); renderSteps(); resetStepForm(); announce(old ? 'Edited step returned to draft for your review.' : 'Draft saved. Review its wording before confirming.');
    } catch (error) { showError('#step-error', error.message); $('#step-title').focus(); }
  }
  function startEdit(id) {
    const step = state.steps.find(item => item.id === id); if (!step) return;
    location.hash = 'step-form'; setTab('plan');
    $('#step-edit-id').value = id; $('#step-title').value = step.title; $('#step-source').value = step.source; $('#step-date').value = step.dueDate;
    $('#step-submit').textContent = 'Save changes as draft'; $('[data-cancel-step-edit]').hidden = false;
    $('#step-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#step-title').focus({ preventScroll: true });
  }
  function updateFamilyDraft() {
    const family = state.family;
    if (family.reviewed || family.previewApproved) family.history.push('Sample choices changed. Review required again; no access was granted.');
    family.recipient = $('#family-recipient').value;
    family.scopes = $$('[name="family-scope"]:checked').map(input => input.value);
    family.expiry = $('#family-expiry').value;
    family.identityChecklist = $('#family-verify').checked;
    family.reviewed = false; family.previewApproved = false;
    showError('#family-error', ''); persist(); renderFamily();
  }
  function reviewFamily(event) {
    event.preventDefault(); showError('#family-error', '');
    const family = state.family;
    if (!family.scopes.length) { showError('#family-error', 'Choose at least one sample category.'); return; }
    if (!family.expiry || !core.validDate(family.expiry) || family.expiry <= core.localToday()) { showError('#family-error', 'Choose a future expiry date for the sample.'); return; }
    if (!family.identityChecklist) { showError('#family-error', 'A real invitation would first need identity verification. Tick the checklist to continue the simulation.'); return; }
    family.reviewed = true; family.previewApproved = false;
    family.history.push('Fictional contact and read-only scopes reviewed in this demo.');
    persist(); renderFamily(); announce('Sample access reviewed. No invitation or permission has been created.');
  }
  function addExample() {
    const already = state.steps.some(step => step.sample);
    if (already) { location.hash = 'plan'; announce('The fictional example is already in your drafts.'); return; }
    const step = core.makeStep({ title: 'Ask when a test result may be available', source: 'Fictional example: I want to remember to ask the clinic about timing.', dueDate: '', sample: true }, newId());
    state.steps.unshift(step); persist(); renderSteps(); location.hash = 'plan'; announce('Fictional example added as a draft. It is not a real care instruction.');
  }
  function buildWording(event) {
    event.preventDefault(); showError('#say-error', '');
    try {
      const result = core.buildMessage({ concern: $('#say-concern').value, audience: $('#say-audience').value, tone: $('#say-tone').value, context: $('#say-context').value, question: $('#say-question').value });
      $('#say-output').value = result; state.messageDraft = result; persist(); announce('Editable draft ready. Review each line before you use it.'); $('#say-output').focus();
    } catch (error) { showError('#say-error', error.message); $('#say-concern').focus(); }
  }
  function renderBrief() {
    const stepHost = $('#brief-steps'); const questionHost = $('#brief-questions'); stepHost.replaceChildren(); questionHost.replaceChildren();
    const included = state.steps.filter(step => step.status !== 'draft' && step.includeInBrief);
    if (!included.length) stepHost.append(make('p', '', 'No confirmed steps selected.'));
    else included.forEach(step => { const row = make('div', 'brief-item'); row.append(make('strong', '', step.title), make('small', '', (step.sample ? 'Fictional example · ' : '') + labels[step.status] + (step.dueDate ? ' · Your date: ' + step.dueDate : ''))); if (step.source) row.append(make('p', '', 'Your source note: ' + step.source)); stepHost.append(row); });
    if (!state.questions.length) questionHost.append(make('p', '', 'No wording saved.'));
    else state.questions.forEach(item => questionHost.append(make('p', 'brief-item', item.text)));
  }
  function openBrief() { renderBrief(); const dialog = $('#brief-dialog'); if (!dialog.open) dialog.showModal(); }
  function clearLocalDemo(fromAccount = false) {
    state = core.initialState();
    let cleared = false;
    try {
      const empty = JSON.stringify(state);
      sessionStorage.removeItem(core.STORAGE_KEY);
      if (sessionStorage.getItem(core.STORAGE_KEY) !== null) sessionStorage.setItem(core.STORAGE_KEY, empty);
      const remaining = sessionStorage.getItem(core.STORAGE_KEY);
      cleared = remaining === null || remaining === empty;
    } catch (_) { cleared = false; }
    resetStepForm(); $('#say-form').reset(); $('#say-output').value = ''; renderAll();
    announce(cleared ? (fromAccount ? 'An account change cleared this local preview. No sharing was active.' : 'The local demo has been cleared.') : 'The current view was reset, but browser storage could not be cleared. Clear this site’s browser data before using this tab again.');
  }

  state = load();
  $('#say-output').value = state.messageDraft;
  if (!storageAvailable) $('#demo-boundary').append(document.createTextNode(' Browser storage is unavailable, so changes may be lost on reload.'));
  renderAll(); route();
  window.addEventListener('hashchange', route);
  $('.companion-hero-actions a[href="#step-form"]').addEventListener('click', () => requestAnimationFrame(() => $('#step-title').focus({ preventScroll: true })));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCalendar(); });
  window.addEventListener('focus', refreshCalendar);
  window.setInterval(refreshCalendar, 60000);
  try { const channel = new BroadcastChannel('doctorai-companion-demo-v1'); channel.addEventListener('message', event => { if (event.data?.type === 'clear') clearLocalDemo(true); }); } catch (_) { /* Browser-tab reset remains available. */ }
  $('#step-form').addEventListener('submit', saveStep);
  $('[data-cancel-step-edit]').addEventListener('click', resetStepForm);
  $('[data-load-example]').addEventListener('click', addExample);
  document.addEventListener('click', event => {
    const action = event.target.closest('button[data-confirm-step],button[data-edit-step],button[data-remove-step],button[data-remove-question]');
    if (!action) return;
    const id = action.dataset.confirmStep || action.dataset.editStep || action.dataset.removeStep || action.dataset.removeQuestion;
    if (action.dataset.confirmStep) { state.steps = state.steps.map(step => step.id === id ? core.setStepStatus(step, 'confirmed') : step); persist(); renderSteps(); focusMovedStep(id); announce('Wording confirmed by you. This is not clinical validation.'); }
    else if (action.dataset.editStep) startEdit(id);
    else if (action.dataset.removeStep) { const group = action.closest('.step-groups > section')?.querySelector('h3'); state.steps = state.steps.filter(step => step.id !== id); persist(); renderSteps(); if (group) { group.tabIndex = -1; group.focus({ preventScroll: true }); } announce('Step removed from this demo.'); }
    else { state.questions = state.questions.filter(item => item.id !== id); persist(); renderQuestions(); const heading = $('#questions-title'); heading.tabIndex = -1; heading.focus({ preventScroll: true }); announce('Saved wording removed.'); }
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-step-progress]')) {
      const { stepProgress: id } = event.target.dataset;
      state.steps = state.steps.map(step => step.id === id ? core.setStepStatus(step, event.target.value) : step);
      persist(); renderSteps(); focusMovedStep(id); announce('Progress updated from your own note.');
    }
    if (event.target.matches('[data-step-include]')) { const id = event.target.dataset.stepInclude; state.steps = state.steps.map(step => step.id === id ? { ...step, includeInBrief: event.target.checked } : step); persist(); announce('Visit brief selection updated.'); }
  });
  $('#say-form').addEventListener('submit', buildWording);
  $('#say-output').addEventListener('input', () => { state.messageDraft = $('#say-output').value.slice(0, 1500); persist(); });
  $('[data-save-question]').addEventListener('click', () => { const text = $('#say-output').value.trim(); if (!text) { announce('Write and review a draft before saving it to the brief.'); $('#say-output').focus(); return; } state.questions.unshift({ id: newId(), text: text.slice(0, 1500) }); persist(); renderQuestions(); announce('Your exact edited wording was saved to the visit brief.'); });
  $('[data-copy-message]').addEventListener('click', async () => {
    const output = $('#say-output'); if (!output.value.trim()) { announce('There is no draft to copy yet.'); output.focus(); return; }
    try { await navigator.clipboard.writeText(output.value); announce('Draft copied. You choose where to use it.'); }
    catch (_) { output.select(); announce('Copy was unavailable. The draft is selected so you can copy it manually.'); }
  });
  $('#family-form').addEventListener('change', updateFamilyDraft);
  $('#family-form').addEventListener('submit', reviewFamily);
  $('[data-approve-family]').addEventListener('click', () => { if (!state.family.reviewed || !core.familyCanReview(state.family)) return; state.family.previewApproved = true; state.family.history.push('Sample approval simulated. No invitation sent or access granted.'); persist(); renderFamily(); $('[data-revoke-family]').focus({ preventScroll: true }); announce('Simulation approved. No one has actual access.'); });
  $('[data-revoke-family]').addEventListener('click', () => { state.family.previewApproved = false; state.family.reviewed = false; state.family.history.push('Sample preview revoked. No real permission existed.'); persist(); renderFamily(); $('#family-form button[type="submit"]').focus({ preventScroll: true }); announce('Sample preview revoked. No real permission existed.'); });
  $('[data-preview-brief]').addEventListener('click', openBrief);
  $$('[data-close-brief]').forEach(button => button.addEventListener('click', () => $('#brief-dialog').close()));
  $('[data-print-brief]').addEventListener('click', () => { renderBrief(); window.print(); });
  $('[data-clear-demo]').addEventListener('click', () => {
    if (!window.confirm('Clear all notes and simulated Family Care choices from this browser tab?')) return;
    clearLocalDemo();
  });
})();
