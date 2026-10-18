(() => {
  const tablist = document.querySelector('[data-staff-tabs]');
  const reviewPanel = document.querySelector('#staff-review-panel');
  const reviewStatus = document.querySelector('#staff-review-status');
  const reviewContent = document.querySelector('#staff-review-content');
  if (!tablist || !reviewPanel || !reviewStatus || !reviewContent) return;

  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  let loaded = false;

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function selectTab(index, moveFocus = false) {
    const nextIndex = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === nextIndex;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[tabIndex].hidden = !selected;
    });
    if (moveFocus) tabs[nextIndex].focus();
    if (tabs[nextIndex].id === 'staff-medication-review-tab' && !loaded) loadReview();
  }

  tablist.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    selectTab(tabs.indexOf(tab));
  });

  tablist.addEventListener('keydown', event => {
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); selectTab(currentIndex + 1, true); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); selectTab(currentIndex - 1, true); }
    else if (event.key === 'Home') { event.preventDefault(); selectTab(0, true); }
    else if (event.key === 'End') { event.preventDefault(); selectTab(tabs.length - 1, true); }
  });

  function addList(parent, items) {
    const list = create('ul');
    items.forEach(item => list.append(create('li', '', item)));
    parent.append(list);
  }

  function buildPreview() {
    const card = create('section', 'staff-review-card review-preview');
    card.setAttribute('aria-labelledby', 'review-preview-heading');
    card.append(create('h2', '', 'Alert colour preview'));
    card.querySelector('h2').id = 'review-preview-heading';
    card.append(create('p', '', 'Switch between display-only states. These fictional examples do not run the checker, change medicines, or save health information.'));

    const controls = create('div', 'review-preview-controls');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Choose a fictional alert state');
    const output = create('div', 'review-state-output');
    output.dataset.severity = 'review';
    output.setAttribute('role', 'status');
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-atomic', 'true');
    const outputDot = create('span', 'review-state-dot');
    outputDot.setAttribute('aria-hidden', 'true');
    const outputCopy = create('p');
    const outputHeading = create('strong');
    const outputDescription = create('span');
    outputCopy.append(outputHeading, outputDescription);
    output.append(outputDot, outputCopy);

    const states = {
      limited: { severity: 'limited', title: 'No matching alert in this limited check', description: 'This fixture does not establish that a medicine combination is safe.' },
      review: { severity: 'review', title: 'Needs review', description: 'Some evidence or medicine details are incomplete. This is a display-only state.' },
      high: { severity: 'high', title: 'Contact a healthcare professional', description: 'Illustrative high-alert wording only. It does not assess a person or provide emergency triage.' }
    };

    function activate(button, state) {
      controls.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      output.dataset.severity = state.severity;
      outputHeading.textContent = state.title;
      outputDescription.textContent = state.description;
    }

    Object.entries(states).forEach(([key, state]) => {
      const button = create('button', 'review-state-button');
      button.type = 'button';
      button.dataset.reviewSeverity = key;
      button.setAttribute('aria-pressed', 'false');
      const dot = create('span', 'review-state-dot');
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot, document.createTextNode(key === 'limited' ? 'Limited check' : key === 'review' ? 'Needs review' : 'High alert'));
      button.addEventListener('click', () => activate(button, state));
      controls.append(button);
      if (key === 'review') activate(button, state);
    });

    card.append(controls, output);
    return card;
  }

  function renderPacket(packet) {
    const grid = create('div', 'staff-review-grid');
    const summary = create('section', 'staff-review-card');
    summary.setAttribute('aria-labelledby', 'review-release-heading');
    const summaryHeading = create('h2', '', packet.title || 'Medication safety review');
    summaryHeading.id = 'review-release-heading';
    summary.append(summaryHeading, create('p', '', packet.release.summary));
    const counts = create('div', 'review-status-count');
    packet.release.active.forEach(item => counts.append(create('span', '', item)));
    counts.append(create('span', '', `${packet.release.inactiveCandidateCount} candidates inactive`));
    summary.append(counts);

    const candidate = create('section', 'staff-review-card review-candidate');
    candidate.setAttribute('aria-labelledby', 'review-candidate-heading');
    candidate.append(create('span', 'review-candidate-label', packet.candidate.status));
    const candidateHeading = create('h2', '', 'NSAID duplicate-use candidate');
    candidateHeading.id = 'review-candidate-heading';
    candidate.append(candidateHeading, create('p', '', packet.candidate.scope));
    candidate.append(create('h3', '', 'What the cited source says'), create('p', '', packet.candidate.source.summary));
    candidate.append(create('p', 'review-caveat', `${packet.candidate.source.label}. ${packet.candidate.source.reviewed}`));
    const source = create('a', 'review-source', 'Open the cited Medsafe data sheet');
    const sourceUrl = new URL(packet.candidate.source.url);
    if (sourceUrl.protocol === 'https:' && sourceUrl.hostname === 'medsafe.govt.nz') {
      source.href = sourceUrl.href;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      candidate.append(source);
    }
    const blockers = create('details', 'review-compact-details');
    blockers.append(create('summary', '', 'Why this candidate is not active'));
    addList(blockers, packet.candidate.blockers);
    candidate.append(blockers);

    const requirements = create('section', 'staff-review-card');
    requirements.setAttribute('aria-labelledby', 'review-gates-heading');
    const requirementsHeading = create('h2', '', 'Before any rule could be considered');
    requirementsHeading.id = 'review-gates-heading';
    requirements.append(requirementsHeading);
    addList(requirements, packet.requirements);

    const catalogue = create('section', 'staff-review-card');
    catalogue.setAttribute('aria-labelledby', 'review-catalogue-heading');
    const catalogueHeading = create('h2', '', 'Catalogue & scan limits');
    catalogueHeading.id = 'review-catalogue-heading';
    catalogue.append(catalogueHeading, create('p', '', packet.catalogue.summary));
    const safeguards = create('details', 'review-compact-details');
    safeguards.append(create('summary', '', 'Identity and scan safeguards'));
    addList(safeguards, [...packet.catalogue.safeguards, packet.catalogue.ocr]);
    catalogue.append(safeguards);

    grid.append(summary, candidate, requirements, catalogue, buildPreview());
    const footnote = create('p', 'staff-review-footer', packet.notice);
    grid.append(footnote);
    reviewContent.replaceChildren(grid);
    reviewContent.hidden = false;
  }

  async function loadReview() {
    loaded = true;
    reviewStatus.classList.remove('error');
    reviewStatus.textContent = 'Loading the admin-only review packet…';
    try {
      const response = await fetch('/api/staff/medication-review', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const result = await response.json();
      if (!response.ok || !result.packet) throw new Error(result.error || 'Review packet could not be loaded.');
      renderPacket(result.packet);
      reviewStatus.hidden = true;
    } catch (error) {
      loaded = false;
      reviewStatus.classList.add('error');
      reviewStatus.textContent = error instanceof Error ? error.message : 'Review packet could not be loaded.';
      const retry = create('button', 'review-retry', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', loadReview, { once: true });
      reviewStatus.append(document.createTextNode(' '), retry);
    }
  }
})();
