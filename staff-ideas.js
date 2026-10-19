'use strict';

(() => {
  const panel = document.querySelector('#staff-ideas-panel');
  const form = document.querySelector('#staff-idea-form');
  const list = document.querySelector('#staff-idea-list');
  const status = document.querySelector('#staff-idea-status');
  if (!panel || !form || !list || !status) return;

  const ideas = [];
  const categories = new Set(['Product', 'Clarity', 'Accessibility', 'Reliability', 'Other']);

  function create(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function renderIdeas() {
    const cards = ideas.map((idea, index) => {
      const card = create('li', 'staff-idea-card');
      const header = create('div', 'staff-idea-card-header');
      header.append(create('span', 'staff-idea-category', idea.category));
      const remove = create('button', 'staff-idea-remove', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove idea: ${idea.title}`);
      remove.addEventListener('click', () => {
        ideas.splice(index, 1);
        renderIdeas();
        status.textContent = `Idea removed. ${ideas.length} idea${ideas.length === 1 ? '' : 's'} in this tab.`;
      });
      header.append(remove);
      card.append(header, create('h3', '', idea.title), create('p', '', idea.details));
      return card;
    });
    list.replaceChildren(...cards);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (ideas.length >= 30) {
      status.textContent = 'This temporary list is full. Remove an idea before adding another.';
      return;
    }
    const data = new FormData(form);
    const category = String(data.get('category') || '');
    const title = String(data.get('title') || '').trim();
    const details = String(data.get('details') || '').trim();
    if (!categories.has(category) || !title || !details) {
      status.textContent = 'Choose a category and complete both text fields.';
      return;
    }
    ideas.push({ category, title, details });
    renderIdeas();
    form.reset();
    form.querySelector('[name="title"]').focus();
    status.textContent = `Idea added. ${ideas.length} idea${ideas.length === 1 ? '' : 's'} in this tab; the list is temporary.`;
  });
})();
