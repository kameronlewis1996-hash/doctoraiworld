// User-selected terminology entry. Search results are labels, never diagnoses or safety rules.
(() => {
  'use strict';
  const terms = window.DoctorAITerminology;
  if (!terms) return;
  let active = null;
  const makeId = () => (typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  function mount(root, profile) {
    const form = root.querySelector('[data-modal-form="health"]');
    if (!form) return;
    const oldConditions = form.elements.conditions?.closest('label');
    const oldAllergies = form.elements.allergies?.closest('label');
    const insertBefore = oldConditions || oldAllergies;
    const block = document.createElement('div');
    block.className = 'term-profile-form';
    block.innerHTML = `<p class="modal-help">Search and choose a term, or choose Other / unsure and write your own. These are labels for details you report; they do not diagnose or add clinical warnings.</p>
      <section class="term-profile-section" aria-labelledby="term-conditions-heading"><h3 id="term-conditions-heading">Conditions & history</h3><p>Choose current, historical, or unsure for each entry.</p>
        <div class="term-picker" data-term-picker="condition"><label for="term-condition-search">Search condition</label><div class="term-picker-input"><input id="term-condition-search" type="text" role="combobox" aria-autocomplete="list" aria-controls="term-condition-options" aria-expanded="false" autocomplete="off" maxlength="120" placeholder="Search a condition"><button type="button" data-term-other="condition">Other / unsure</button></div><div id="term-condition-options" class="term-options" role="listbox" hidden></div></div>
        <label class="term-choice-label" for="term-condition-status">When did this apply?</label><select id="term-condition-status"><option value="current">Current</option><option value="historical">Historical</option><option value="unsure">Unsure</option></select><button type="button" class="secondary-button" data-term-add="condition">Add condition</button><p class="term-picker-message" data-term-message="condition" role="status" aria-live="polite"></p><ul class="term-saved-list" data-term-list="condition"></ul>
      </section>
      <section class="term-profile-section" aria-labelledby="term-allergies-heading"><h3 id="term-allergies-heading">Allergies & reactions</h3><p>Record the substance, what happened, and how sure you are. A possible reaction is not automatically a confirmed allergy.</p>
        <div class="term-picker" data-term-picker="substance"><label for="term-substance-search">Search substance</label><div class="term-picker-input"><input id="term-substance-search" type="text" role="combobox" aria-autocomplete="list" aria-controls="term-substance-options" aria-expanded="false" autocomplete="off" maxlength="120" placeholder="Search a substance"><button type="button" data-term-other="substance">Other / unsure</button></div><div id="term-substance-options" class="term-options" role="listbox" hidden></div></div>
        <div class="term-picker" data-term-picker="reaction"><label for="term-reaction-search">Search reaction (optional)</label><div class="term-picker-input"><input id="term-reaction-search" type="text" role="combobox" aria-autocomplete="list" aria-controls="term-reaction-options" aria-expanded="false" autocomplete="off" maxlength="120" placeholder="What happened?"><button type="button" data-term-other="reaction">Other / unsure</button></div><div id="term-reaction-options" class="term-options" role="listbox" hidden></div></div>
        <label class="term-choice-label" for="term-allergy-certainty">How sure are you?</label><select id="term-allergy-certainty"><option value="confirmed">Confirmed allergy (as recorded by you)</option><option value="suspected">Possible reaction</option><option value="unsure">Unsure</option></select><button type="button" class="secondary-button" data-term-add="allergy">Add allergy or reaction</button><p class="term-picker-message" data-term-message="allergy" role="status" aria-live="polite"></p><ul class="term-saved-list" data-term-list="allergy"></ul>
      </section><p class="modal-help">Earlier text entries appear as unreviewed. They stay in the existing allergy checks until you remove or update them. Only confirmed new allergies are included in those existing checks; other entries remain visible for your care conversation.</p>`;
    if (insertBefore) insertBefore.before(block);
    oldConditions?.remove(); oldAllergies?.remove();
    const draft = {
      form,
      conditions: terms.conditionEntries(profile),
      allergies: terms.allergyEntries(profile)
    };
    active = draft;

    function renderList(kind) {
      const list = block.querySelector(`[data-term-list="${kind}"]`);
      const entries = kind === 'condition' ? draft.conditions : draft.allergies;
      list.replaceChildren();
      if (!entries.length) {
        const li = document.createElement('li'); li.className = 'term-list-empty'; li.textContent = 'Nothing added yet.'; list.append(li); return;
      }
      entries.forEach((entry, index) => {
        const li = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = kind === 'condition'
          ? `${entry.label} · ${entry.source === 'legacy' ? 'older entry, review status' : entry.status} · ${entry.id}`
          : `${entry.substance}${entry.reaction ? ' · ' + entry.reaction : ''} · ${entry.certainty === 'legacy' ? 'older entry, review certainty' : entry.certainty} · ${entry.id}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${kind === 'condition' ? entry.label : entry.substance}`);
        remove.addEventListener('click', () => { entries.splice(index, 1); renderList(kind); });
        li.append(text, remove); list.append(li);
      });
    }
    renderList('condition'); renderList('allergy');

    function picker(kind) {
      const host = block.querySelector(`[data-term-picker="${kind}"]`);
      const input = host.querySelector('input');
      const options = host.querySelector('[role="listbox"]');
      let entries = [];
      let selected = null;
      let custom = false;
      let matches = [];
      let activeIndex = -1;
      const close = () => { options.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); activeIndex = -1; };
      const choose = entry => { selected = entry; custom = false; input.value = entry.label; close(); block.querySelector(`[data-term-message="${kind === 'condition' ? 'condition' : 'allergy'}"]`).textContent = `${entry.label} selected. Choose Add to include it.`; };
      const render = () => {
        matches = terms.search(entries, input.value);
        options.replaceChildren();
        matches.forEach((entry, index) => {
          const option = document.createElement('div'); option.setAttribute('role', 'option'); option.id = `${kind}-option-${index}`; option.setAttribute('aria-selected', String(index === activeIndex)); option.textContent = entry.label + (entry.aliases.length ? ` · also ${entry.aliases.join(', ')}` : '');
          option.addEventListener('pointerdown', event => { event.preventDefault(); choose(entry); input.focus(); });
          option.addEventListener('click', () => { choose(entry); input.focus(); });
          options.append(option);
        });
        options.hidden = !matches.length;
        input.setAttribute('aria-expanded', String(Boolean(matches.length)));
      };
      input.addEventListener('focus', render);
      input.addEventListener('input', () => { selected = null; render(); });
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { close(); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!matches.length) render();
          if (!matches.length) return;
          event.preventDefault();
          activeIndex = event.key === 'ArrowDown' ? Math.min(activeIndex + 1, matches.length - 1) : Math.max(activeIndex - 1, 0);
          input.setAttribute('aria-activedescendant', `${kind}-option-${activeIndex}`);
          [...options.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === activeIndex)));
          options.hidden = false; input.setAttribute('aria-expanded', 'true');
        } else if (event.key === 'Enter' && !options.hidden && activeIndex >= 0) {
          event.preventDefault(); choose(matches[activeIndex]);
        }
      });
      input.addEventListener('blur', () => window.setTimeout(close, 120));
      host.querySelector('[data-term-other]').addEventListener('click', () => {
        selected = null; custom = true; close(); input.focus();
        block.querySelector(`[data-term-message="${kind === 'condition' ? 'condition' : 'allergy'}"]`).textContent = 'Other / unsure selected. Write your own words, then choose Add.';
      });
      return {
        setEntries(value) { entries = value; if (document.activeElement === input) render(); },
        read() {
          if (selected && terms.normalise(input.value) === terms.normalise(selected.label)) return { id: selected.id, label: selected.label, source: selected.id.split(':')[0] };
          const label = input.value.replace(/\s+/g, ' ').trim().slice(0, 120);
          return custom && label ? { id: `custom:${makeId()}`, label, source: 'user' } : null;
        },
        hasText() { return Boolean(input.value.trim()); },
        clear() { input.value = ''; selected = null; custom = false; close(); },
        focus() { input.focus(); }
      };
    }
    const condition = picker('condition'), substance = picker('substance'), reaction = picker('reaction');
    terms.load().then(catalogues => {
      if (active !== draft || !form.isConnected) return;
      condition.setEntries(catalogues.conditions.entries);
      substance.setEntries(catalogues.allergies.substances);
      reaction.setEntries(catalogues.allergies.reactions);
    }).catch(() => {
      if (active === draft) block.querySelector('[data-term-message="condition"]').textContent = 'Local suggestions are unavailable. Choose Other / unsure to enter your own words.';
    });
    block.querySelector('[data-term-add="condition"]').addEventListener('click', () => {
      const value = condition.read();
      const message = block.querySelector('[data-term-message="condition"]');
      if (!value) { message.textContent = 'Choose a suggestion explicitly, or choose Other / unsure and enter your own words.'; condition.focus(); return; }
      if (draft.conditions.some(item => item.id === value.id || terms.normalise(item.label) === terms.normalise(value.label))) { message.textContent = 'That condition is already in your list.'; return; }
      draft.conditions.push({ ...value, status: block.querySelector('#term-condition-status').value });
      condition.clear(); renderList('condition'); message.textContent = 'Added to this form. Save your health profile to keep it.';
    });
    block.querySelector('[data-term-add="allergy"]').addEventListener('click', () => {
      const value = substance.read();
      const reactionValue = reaction.read();
      const message = block.querySelector('[data-term-message="allergy"]');
      if (!value || (reaction.hasText() && !reactionValue)) { message.textContent = 'Choose each suggestion explicitly, or choose Other / unsure for your own words.'; (value ? reaction : substance).focus(); return; }
      const reactionLabel = reactionValue?.label || '';
      if (draft.allergies.some(item => terms.normalise(item.substance) === terms.normalise(value.label) && terms.normalise(item.reaction) === terms.normalise(reactionLabel))) { message.textContent = 'That substance and reaction are already in your list.'; return; }
      draft.allergies.push({ id: value.id, substance: value.label, reactionId: reactionValue?.id || '', reaction: reactionLabel, certainty: block.querySelector('#term-allergy-certainty').value, source: value.source });
      substance.clear(); reaction.clear(); renderList('allergy'); message.textContent = 'Added to this form. Save your health profile to keep it.';
    });
    draft.collect = () => {
      if (condition.hasText() || substance.hasText() || reaction.hasText()) {
        block.querySelector('[data-term-message="condition"]').textContent = 'Choose Add for typed details, or clear them before saving your profile.';
        (condition.hasText() ? condition : substance.hasText() ? substance : reaction).focus();
        return null;
      }
      return { conditions: draft.conditions.map(item => ({ ...item })), allergies: draft.allergies.map(item => ({ ...item })) };
    };
  }
  function collect() { return active?.form?.isConnected ? active.collect() : null; }
  window.DoctorAITermProfile = { mount, collect };
})();
