'use strict';

(() => {
  const panel = document.querySelector('#staff-ideas-panel');
  const staffContent = document.querySelector('#staff-content');
  const form = document.querySelector('#staff-idea-form');
  const list = document.querySelector('#staff-idea-list');
  const status = document.querySelector('#staff-idea-status');
  const filter = document.querySelector('#staff-idea-filter');
  const clearButton = document.querySelector('#staff-idea-clear');
  if (!panel || !staffContent || !form || !list || !status || !filter || !clearButton) return;

  const storagePrefix = 'doctorai-staff-ideas-v1:';
  const categories = new Set(['Product', 'Clarity', 'Accessibility', 'Reliability', 'Other']);
  const maximumIdeas = 30;
  let ideas = [];
  let storageKey = '';
  let storageAvailable = false;
  let storedValueExists = false;
  let activeEmail = '';
  let staffAccessVerified = false;
  let loadGeneration = 0;
  let nextId = 0;

  function create(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function ideaCount(count) {
    return `${count} idea${count === 1 ? '' : 's'}`;
  }

  function announce(message) {
    status.textContent = message;
  }

  function visibleIdeas() {
    return filter.value === 'all' ? ideas : ideas.filter(idea => idea.category === filter.value);
  }

  function updateControls() {
    clearButton.disabled = !ideas.length && (!storageKey || !storedValueExists);
  }

  function persistIdeas() {
    if (!storageKey || !storageAvailable) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, ideas }));
      storedValueExists = true;
      return true;
    } catch {
      storageAvailable = false;
      return false;
    }
  }

  function renderIdeas() {
    const shown = visibleIdeas();
    const cards = shown.map(idea => {
      const card = create('li', 'staff-idea-card');
      const header = create('div', 'staff-idea-card-header');
      header.append(create('span', 'staff-idea-category', idea.category));
      const remove = create('button', 'staff-idea-remove', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove idea: ${idea.title}`);
      remove.addEventListener('click', () => {
        const visibleIndex = visibleIdeas().findIndex(item => item.id === idea.id);
        ideas = ideas.filter(item => item.id !== idea.id);
        const saved = persistIdeas();
        renderIdeas();
        const nextRemove = list.querySelectorAll('button')[Math.min(visibleIndex, Math.max(visibleIdeas().length - 1, 0))];
        (nextRemove || filter).focus();
        announce(saved ? `Idea removed and saved. ${ideaCount(ideas.length)} total.` : `Idea removed for this page, but browser storage failed. ${ideaCount(ideas.length)} remain in this tab only.`);
      });
      header.append(remove);
      card.append(header, create('h3', '', idea.title), create('p', '', idea.details));
      return card;
    });
    list.replaceChildren(...cards);
    updateControls();
    if (shown.length === 0) {
      const empty = create('li', 'staff-ideas-empty', ideas.length ? 'No ideas in this category.' : 'No saved ideas yet. Add a short product or workflow idea above.');
      empty.setAttribute('role', 'note');
      list.append(empty);
    }
  }

  function validStoredIdea(value) {
    return value && typeof value === 'object'
      && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100
      && categories.has(value.category)
      && typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 80
      && typeof value.details === 'string' && value.details.trim().length > 0 && value.details.length <= 600;
  }

  async function makeStorageKey(email) {
    if (!window.crypto?.subtle || typeof TextEncoder !== 'function') throw new Error('Secure browser hashing is unavailable.');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('The verified staff account is missing.');
    const bytes = new TextEncoder().encode(normalizedEmail);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    return `${storagePrefix}${hash}`;
  }

  async function loadForVerifiedStaff(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail === activeEmail) return;
    activeEmail = normalizedEmail;
    const generation = ++loadGeneration;
    storageKey = '';
    storageAvailable = false;
    storedValueExists = false;
    ideas = [];
    renderIdeas();
    try {
      const key = await makeStorageKey(normalizedEmail);
      if (generation !== loadGeneration || activeEmail !== normalizedEmail) return;
      storageKey = key;
      const raw = localStorage.getItem(storageKey);
      storedValueExists = raw !== null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.version !== 1 || !Array.isArray(saved.ideas)) throw new Error('Saved ideas have an unsupported format.');
        ideas = saved.ideas.filter(validStoredIdea).slice(0, maximumIdeas).map(idea => ({
          id: idea.id, category: idea.category, title: idea.title.trim(), details: idea.details.trim()
        }));
      }
      storageAvailable = true;
      renderIdeas();
      announce(ideas.length ? `${ideaCount(ideas.length)} loaded from this browser for this signed-in staff account. They are not synced to other devices.` : 'No saved ideas in this browser for this staff account. New ideas will be saved on this device.');
    } catch {
      storageAvailable = false;
      renderIdeas();
      announce(storageKey ? 'Saved ideas could not be read. Clear saved ideas or check this browser’s storage settings.' : 'Browser-only saving is unavailable in this browser. Ideas will remain in this tab only.');
    }
  }

  staffContent.addEventListener('staffaccessgranted', event => {
    staffAccessVerified = true;
    loadForVerifiedStaff(event.detail?.email);
  });
  if (staffContent.dataset.staffAdminEmail) {
    staffAccessVerified = true;
    loadForVerifiedStaff(staffContent.dataset.staffAdminEmail);
  }

  filter.addEventListener('change', () => {
    renderIdeas();
    announce(`Showing ${ideaCount(visibleIdeas().length)} of ${ideaCount(ideas.length)}.`);
  });

  clearButton.addEventListener('click', () => {
    if (!ideas.length && (!storageKey || !storedValueExists)) return;
    if (!window.confirm('Clear all saved ideas for this staff account from this browser?')) return;
    try {
      if (storageKey) localStorage.removeItem(storageKey);
      ideas = [];
      storedValueExists = false;
      renderIdeas();
      announce(storageKey ? 'Saved ideas cleared from this browser for this staff account.' : 'Ideas cleared for this page. Browser saving is unavailable.');
    } catch {
      announce('This browser could not clear its saved ideas. Remove this site’s browser data to delete them.');
    }
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (staffContent.hidden || !staffAccessVerified) {
      announce('Ideas can only be opened after staff access is verified.');
      return;
    }
    if (ideas.length >= maximumIdeas) {
      announce(`This list is limited to ${maximumIdeas} ideas. Remove one before adding another.`);
      return;
    }
    const data = new FormData(form);
    const category = String(data.get('category') || '');
    const title = String(data.get('title') || '').trim();
    const details = String(data.get('details') || '').trim();
    if (!categories.has(category) || !title || !details) {
      announce('Choose a category and complete both text fields.');
      return;
    }
    const id = `${Date.now()}-${++nextId}`;
    ideas.push({ id, category, title: title.slice(0, 80), details: details.slice(0, 600) });
    const saved = persistIdeas();
    renderIdeas();
    form.reset();
    form.querySelector('[name="title"]').focus();
    announce(saved ? `Idea saved on this browser. ${ideaCount(ideas.length)} total.` : `Idea added for this page, but browser storage failed. It will not survive reload. ${ideaCount(ideas.length)} in this tab.`);
  });
})();
