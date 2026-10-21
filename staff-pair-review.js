(() => {
  const staffContent = document.querySelector('#staff-content');
  const tab = document.querySelector('#staff-pair-review-tab');
  const status = document.querySelector('#pair-review-status');
  const counts = document.querySelector('#pair-review-counts');
  const form = document.querySelector('#pair-review-search');
  const queryField = document.querySelector('#pair-review-query');
  const statusFilter = document.querySelector('#pair-review-status-filter');
  const results = document.querySelector('#pair-review-results');
  const pagination = document.querySelector('#pair-review-pagination');
  const pageLabel = document.querySelector('#pair-review-page');
  const previous = document.querySelector('#pair-review-previous');
  const next = document.querySelector('#pair-review-next');
  if (!staffContent || !tab || !status || !counts || !form || !queryField || !statusFilter || !results || !pagination || !pageLabel || !previous || !next) return;

  const pageSize = 25;
  let loaded = false;
  let offset = 0;
  let filteredCount = 0;
  let requestId = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function labelForStatus(value) {
    return ({
      evidence_candidate: 'Demo state: candidate',
      no_interaction_found_in_specified_sources: 'Demo state: no finding',
      blocked: 'Demo state: blocked',
      conflicting_evidence: 'Demo state: conflict'
    })[value] || 'Demo state: unassigned';
  }

  function renderCounts(statusCounts) {
    const labels = [
      ['evidence_candidate', 'Demo candidate'],
      ['no_interaction_found_in_specified_sources', 'Demo no-finding'],
      ['blocked', 'Demo blocked'],
      ['conflicting_evidence', 'Demo conflict']
    ];
    counts.replaceChildren(...labels.map(([key, label]) => {
      const card = element('div', 'pair-review-count');
      card.append(element('strong', '', String(statusCounts[key] || 0)), element('span', '', label));
      return card;
    }));
  }

  function renderCase(item) {
    const card = element('article', 'pair-review-case');
    const header = element('div', 'pair-review-case-header');
    const heading = element('h3', '', `${item.memberNames[0]} + ${item.memberNames[1]}`);
    const badge = element('span', `pair-review-badge status-${item.status}`, labelForStatus(item.status));
    header.append(heading, badge);
    card.append(header);
    card.append(element('p', 'pair-review-case-id', item.caseId));
    card.append(element('p', 'pair-review-finding', item.scopeStatus));
    card.append(element('p', 'pair-review-caveat', item.dispositionCaveat));
    card.append(element('p', 'pair-review-gates', 'Rights, currentness, clinical review and government review: demo only; not assessed.'));
    if (item.blockers?.length) {
      const details = element('details', 'pair-review-details');
      details.append(element('summary', '', `Demo notes (${item.blockers.length})`));
      const list = element('ul');
      item.blockers.forEach(note => list.append(element('li', '', note)));
      details.append(list);
      card.append(details);
    }
    card.append(element('p', 'pair-review-inert', 'Synthetic demonstration only. Not clinical research. Not for patient use. No active rules changed.'));
    return card;
  }

  function updatePagination() {
    const pages = Math.max(1, Math.ceil(filteredCount / pageSize));
    const current = Math.min(pages, Math.floor(offset / pageSize) + 1);
    pageLabel.textContent = `Page ${current} of ${pages} · ${filteredCount} synthetic sample records`;
    previous.disabled = offset === 0;
    next.disabled = offset + pageSize >= filteredCount;
    pagination.hidden = filteredCount === 0;
  }

  async function loadPage() {
    const thisRequest = ++requestId;
    status.classList.remove('error');
    status.textContent = 'Loading fictional demo records.';
    results.replaceChildren();
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    const q = queryField.value.trim();
    if (q) params.set('q', q);
    if (statusFilter.value) params.set('status', statusFilter.value);
    try {
      const response = await fetch(`/api/staff/pair-review?${params}`, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json();
      if (thisRequest !== requestId) return;
      if (!response.ok || result.metadata?.demoOnly !== true || !Array.isArray(result.cases)) throw new Error(result.error || 'Synthetic preview could not be loaded.');
      filteredCount = result.metadata.filteredCount;
      renderCounts(result.statusCounts || {});
      if (result.cases.length) results.replaceChildren(...result.cases.map(renderCase));
      else results.append(element('p', 'pair-review-empty', 'No fictional records match this search.'));
      updatePagination();
      status.textContent = 'Synthetic preview loaded. No research was performed.';
      loaded = true;
    } catch (error) {
      if (thisRequest !== requestId) return;
      loaded = false;
      status.classList.add('error');
      status.textContent = error instanceof Error ? error.message : 'Synthetic preview could not be loaded.';
      pagination.hidden = true;
    }
  }

  function loadIfSelected() {
    if (!staffContent.hidden && tab.getAttribute('aria-selected') === 'true' && !loaded) loadPage();
  }

  form.addEventListener('submit', event => { event.preventDefault(); offset = 0; loadPage(); });
  previous.addEventListener('click', () => { if (offset >= pageSize) { offset -= pageSize; loadPage(); } });
  next.addEventListener('click', () => { if (offset + pageSize < filteredCount) { offset += pageSize; loadPage(); } });
  const observer = new MutationObserver(loadIfSelected);
  observer.observe(staffContent, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(tab, { attributes: true, attributeFilter: ['aria-selected'] });
  loadIfSelected();
})();
