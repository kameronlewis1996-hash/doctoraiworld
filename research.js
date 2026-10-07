(() => {
  const results = document.querySelector('#research-results');
  const updated = document.querySelector('#research-updated');
  const heading = document.querySelector('#research-heading');
  const input = document.querySelector('#research-topic');
  const search = document.querySelector('#research-search');
  const searchStatus = document.querySelector('#research-search-status');
  const logo = document.querySelector('#research-logo');
  const tier = document.querySelector('#research-tier');
  const highlightGrid = document.querySelector('#highlight-grid');
  const discussionList = document.querySelector('#discussion-list');
  const discussionTitle = document.querySelector('#discussion-title');
  const discussionBody = document.querySelector('#discussion-body');
  const discussionPost = document.querySelector('#discussion-post');
  const discussionStatus = document.querySelector('#discussion-status');
  const discussionKey = 'doctorai-research-discussions-v1';
  let exploreLoaded = false;
  let latestSearchRequest = 0;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
  const cleanTopic = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const cleanAbstract = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const shortText = (value, length = 190) => { const text = cleanAbstract(value); return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, '')}…` : text; };
  const dateOnly = date => date.toISOString().slice(0, 10);
  const shiftDays = (date, amount) => { const shifted = new Date(date); shifted.setUTCDate(shifted.getUTCDate() + amount); return shifted; };
  const currentDate = new Date();
  const today = dateOnly(currentDate);
  const monthStart = `${today.slice(0, 8)}01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const setBrand = pro => {
    const brand = window.DOCTORAI_BRANDING || { publicLogo: '/doctorai-public-logo-transparent.png?v=10', headLogo: '/doctorai-head-logo-transparent.png?v=10' };
    document.body.dataset.subscription = pro ? 'pro' : 'free';
    if (logo) {
      logo.onerror = () => { logo.onerror = null; logo.src = brand.headLogo; logo.alt = 'DoctorAI logo'; };
      logo.src = brand.publicLogo;
      logo.alt = 'DoctorAI logo';
    }
    if (tier) {
      tier.textContent = pro ? 'Pro evidence library' : 'Evidence library';
      tier.classList.toggle('pro', false);
    }
  };

  const fetchWithTimeout = async (url, options = {}, timeout = 10_000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  const normalise = item => ({
    id: item.id || '',
    source: item.source || '',
    title: item.title || 'Untitled research record',
    abstract: cleanAbstract(item.abstractText) || 'Abstract unavailable. Open the original source for the full record.',
    journal: item.journalTitle || 'Medical research',
    date: item.firstPublicationDate || item.firstPubDate || 'Date unavailable',
    authors: item.authorString || 'Authors unavailable',
    openAccess: item.isOpenAccess === 'Y',
    citations: Number(item.citedByCount || 0),
    url: item.doi ? `https://doi.org/${encodeURIComponent(item.doi)}` : `https://europepmc.org/article/${encodeURIComponent(item.source || 'MED')}/${encodeURIComponent(item.id || '')}`
  });

  async function fetchPapers(topic, start, end, pageSize = 30) {
    const readJson = async response => {
      if (!response.ok) throw new Error('Research updates are unavailable.');
      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType && !contentType.includes('json')) throw new Error('Research source returned a non-JSON response.');
      return response.json();
    };
    const response = await fetchWithTimeout('/api/research', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ topic, start, end, pageSize })
    });
    const payload = await readJson(response);
    return (payload.results || payload.resultList?.result || []).map(normalise);
  }

  const pickBest = items => items.slice().sort((a, b) => {
    const score = item => Math.log1p(item.citations) * 2 + Math.min(item.abstract.length / 900, 2) + (item.openAccess ? .75 : 0) + (item.authors !== 'Authors unavailable' ? .2 : 0);
    return score(b) - score(a) || String(b.date).localeCompare(String(a.date));
  })[0];
  const paperKey = paper => paper?.url || `${paper?.source || ''}:${paper?.id || ''}:${paper?.title || ''}`;

  const highlightMarkup = paper => {
    if (!paper) return '<div class="highlight-state">No matching paper was indexed for this window yet. Try the Explore tab for a broader search.</div>';
    const access = paper.openAccess ? ' · Open access' : '';
    return `<h4 class="highlight-paper-title">${escape(paper.title)}</h4><p class="highlight-paper-meta">${escape(paper.journal)} · ${escape(paper.date)}${access}</p><p class="highlight-paper-copy">${escape(shortText(paper.abstract))}</p><a class="highlight-paper-link" href="${escape(paper.url)}" target="_blank" rel="noopener">Read the original paper →</a>`;
  };

  async function loadHighlights() {
    highlightGrid.setAttribute('aria-busy', 'true');
    const ranges = [
      { key: 'day', start: dateOnly(shiftDays(currentDate, -6)), end: today, fallbackStart: dateOnly(shiftDays(currentDate, -30)) },
      { key: 'month', start: monthStart, end: today },
      { key: 'year', start: yearStart, end: today }
    ];
    try {
      const pools = await Promise.all(ranges.map(async range => {
        let papers = await fetchPapers('', range.start, range.end);
        let fallback = false;
        if (!papers.length && range.fallbackStart) { papers = await fetchPapers('', range.fallbackStart, range.end); fallback = true; }
        return { ...range, papers, fallback };
      }));
      const used = new Set();
      const picks = pools.map(pool => {
        const unused = pool.papers.filter(paper => !used.has(paperKey(paper)));
        const paper = pickBest(unused);
        if (paper) used.add(paperKey(paper));
        return { ...pool, paper };
      });
      picks.forEach(pick => {
        const slot = document.querySelector(`#highlight-${pick.key}`);
        if (slot) slot.innerHTML = highlightMarkup(pick.paper);
        const card = document.querySelector(`[data-period-card="${pick.key}"]`);
        const windowLabel = card?.querySelector('.period-pill');
        if (windowLabel && pick.fallback) windowLabel.textContent = 'Recent';
      });
    } catch (_) {
      ['day', 'month', 'year'].forEach(key => { const slot = document.querySelector(`#highlight-${key}`); if (slot) slot.innerHTML = '<div class="highlight-state">The live index is taking a moment to respond. Open Explore to try again.</div>'; });
    } finally {
      highlightGrid.setAttribute('aria-busy', 'false');
    }
  }

  const relatedFallbackTopic = topic => {
    const terms = cleanTopic(topic).toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2);
    const suggested = [
      { terms: ['ozempic', 'glp', 'semaglutide', 'tirzepatide'], label: 'GLP-1 medicines' },
      { terms: ['weight', 'diabetes', 'obesity'], label: 'weight loss and diabetes' },
      { terms: ['cosmetic', 'plastic', 'surgery', 'aesthetic'], label: 'cosmetics and plastic surgery' },
      { terms: ['mental', 'wellbeing', 'wellness', 'anxiety', 'depression', 'sleep'], label: 'mental health and wellbeing' },
      { terms: ['medicine', 'medicines', 'drug', 'treatment', 'therapy'], label: 'new medicines' }
    ];
    const matched = suggested.find(candidate => candidate.terms.some(term => terms.includes(term)));
    if (matched) return matched.label;
    return terms.slice(0, 2).join(' ');
  };

  const render = (items, topic = '', options = {}) => {
    heading.textContent = options.fallback ? `Related research for “${topic}”` : topic ? `Research results for “${topic}”` : 'Latest research';
    results.setAttribute('aria-busy', 'false');
    if (!items.length) { results.innerHTML = '<div class="state-card">No matching publications were found. Try a broader phrase such as “sleep”, “prevention” or “blood pressure”.</div>'; return; }
    const fallbackNotice = options.fallback ? `<div class="state-card research-fallback">No recent exact matches were indexed for “${escape(topic)}”. These are ${options.fallbackTopic ? `related results for “${escape(options.fallbackTopic)}”` : 'recent broader results'} to help you continue exploring.</div>` : '';
    results.innerHTML = fallbackNotice + items.slice(0, 12).map(item => `<article class="paper-card"><span class="paper-label">${escape(item.journal)} · ${escape(item.date)}</span><h3>${escape(item.title)}</h3><div class="paper-meta">${escape(item.authors)}${item.openAccess ? '<span class="oa">Open access</span>' : ''}</div><p>${escape(item.abstract)}</p><a href="${escape(item.url)}" target="_blank" rel="noopener">Read original source →</a></article>`).join('');
  };

  const renderError = topic => {
    results.setAttribute('aria-busy', 'false');
    const query = encodeURIComponent(topic || 'medical research');
    results.innerHTML = `<div class="state-card error">The live research index is taking a moment to respond.<br><br><a href="https://europepmc.org/search?query=${query}" target="_blank" rel="noopener">Open the source search directly →</a></div>`;
    updated.textContent = 'Live updates unavailable';
  };

  async function load(topic = '') {
    const requestId = ++latestSearchRequest;
    const safeTopic = cleanTopic(topic);
    results.setAttribute('aria-busy', 'true');
    results.innerHTML = '<div class="state-card">Finding recent indexed research…</div>';
    updated.textContent = 'Checking the live research index…';
    searchStatus.textContent = safeTopic ? `Searching for “${safeTopic}”…` : 'Loading recent publications…';
    search.disabled = true;
    search.setAttribute('aria-busy', 'true');
    try {
      let items = await fetchPapers(safeTopic, '2025-01-01', today, 30);
      let fallbackTopic = '';
      let usedFallback = false;
      if (!items.length && safeTopic) {
        usedFallback = true;
        fallbackTopic = relatedFallbackTopic(safeTopic);
        items = await fetchPapers(fallbackTopic, '2025-01-01', today, 30);
        if (!items.length && fallbackTopic) {
          fallbackTopic = '';
          items = await fetchPapers('', '2025-01-01', today, 30);
        }
      }
      items = items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (requestId !== latestSearchRequest) return;
      render(items, safeTopic, { fallback: usedFallback, fallbackTopic });
      updated.textContent = `Updated ${new Date().toLocaleString()} · Source: Europe PMC`;
      searchStatus.textContent = usedFallback
        ? `No exact recent match was found. Showing ${Math.min(items.length, 12)} related result${items.length === 1 ? '' : 's'}.`
        : safeTopic ? `${Math.min(items.length, 12)} recent result${items.length === 1 ? '' : 's'} found.` : 'Showing recent indexed publications.';
    } catch (_) {
      if (requestId !== latestSearchRequest) return;
      renderError(safeTopic);
      searchStatus.textContent = 'Try again shortly, or use the source search link below.';
    } finally {
      if (requestId === latestSearchRequest) {
        search.disabled = false;
        search.removeAttribute('aria-busy');
        exploreLoaded = true;
      }
    }
  }

  const researchTabNames = ['highlights', 'explore', 'discuss'];
  const activateTab = (name, options = {}) => {
    const next = researchTabNames.includes(name) ? name : 'highlights';
    document.querySelectorAll('[data-research-tab]').forEach(tab => { const active = tab.dataset.researchTab === next; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    document.querySelectorAll('[data-research-panel]').forEach(panel => { const active = panel.dataset.researchPanel === next; panel.hidden = !active; panel.classList.toggle('active', active); });
    if (options.updateHash !== false && location.hash !== `#${next}`) history.pushState({ researchTab: next }, '', `#${next}`);
    if (options.focus) document.querySelector(`[data-research-tab="${next}"]`)?.focus();
    if (next === 'explore' && !exploreLoaded) load();
  };

  const seededDiscussions = [
    { topic: 'Reading research', title: 'What makes a health study useful?', body: 'Compare the question, participants, time period and limitations before deciding what a result means.' },
    { topic: 'Questions to ask', title: 'What would you ask a clinician about this finding?', body: 'Turn a headline into one clear question you can take to a qualified healthcare professional.' },
    { topic: 'Evidence in context', title: 'Does this apply to everyone?', body: 'A result may be promising without being universal. Look for who was included and what was not measured.' }
  ];
  const readDiscussions = () => { try { return JSON.parse(localStorage.getItem(discussionKey) || '[]'); } catch (_) { return []; } };
  const renderDiscussions = () => {
    const saved = readDiscussions();
    const custom = saved.map(item => `<article class="discussion-card"><span class="discussion-topic">Your prompt</span><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p><button type="button" data-topic="${escape(item.topic || '')}">Explore related research →</button></article>`).join('');
    const seeded = seededDiscussions.map(item => `<article class="discussion-card"><span class="discussion-topic">${escape(item.topic)}</span><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p><button type="button" data-topic="${escape(item.topic)}">Explore related research →</button></article>`).join('');
    discussionList.innerHTML = custom + seeded;
  };

  document.querySelectorAll('[data-research-tab]').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.researchTab));
    tab.addEventListener('keydown', event => {
      const index = researchTabNames.indexOf(tab.dataset.researchTab);
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % researchTabNames.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + researchTabNames.length) % researchTabNames.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = researchTabNames.length - 1;
      else return;
      event.preventDefault();
      activateTab(researchTabNames[nextIndex], { focus: true });
    });
  });
  window.addEventListener('hashchange', () => activateTab(location.hash.slice(1), { updateHash: false }));
  document.addEventListener('click', event => {
    const topicButton = event.target.closest('[data-topic]');
    if (!topicButton) return;
    const topic = topicButton.dataset.topic || '';
    activateTab('explore');
    input.value = topic;
    load(topic);
    document.querySelector('.research-meta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  search.addEventListener('click', () => load(input.value));
  input.addEventListener('keydown', event => { if (event.key === 'Enter') load(input.value); });
  document.querySelector('#refresh-highlights').addEventListener('click', loadHighlights);
  discussionPost.addEventListener('click', () => {
    const title = cleanTopic(discussionTitle.value);
    const body = String(discussionBody.value || '').trim().slice(0, 500);
    if (!title || !body) { discussionStatus.textContent = 'Add a title and a question first.'; return; }
    try {
      const saved = readDiscussions();
      saved.unshift({ title, body, topic: title, createdAt: Date.now() });
      localStorage.setItem(discussionKey, JSON.stringify(saved.slice(0, 6)));
      discussionTitle.value = '';
      discussionBody.value = '';
      discussionStatus.textContent = 'Saved privately on this device.';
      renderDiscussions();
    } catch (_) { discussionStatus.textContent = 'Private saving is unavailable in this browser.'; }
  });

  setBrand(false);
  const initialResearchTab = location.hash.slice(1);
  if (initialResearchTab && !researchTabNames.includes(initialResearchTab)) history.replaceState({ researchTab: 'highlights' }, '', '#highlights');
  activateTab(initialResearchTab, { updateHash: false });
  renderDiscussions();
  loadHighlights();
  fetch('/api/stripe/entitlement', { headers: { accept: 'application/json' } }).then(response => response.ok ? response.json() : null).then(payload => setBrand(Boolean(payload?.active))).catch(() => {});
})();
