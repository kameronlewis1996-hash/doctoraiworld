'use strict';

(() => {
  const scenarioOptions = [
    ['voltaren-ibuprofen', 'Voltaren suppository + ibuprofen (unassessed pair)'],
    ['warfarin-ibuprofen', 'Warfarin + ibuprofen (excluded pair rule)'],
    ['retained-warfarin-sulfamethoxazole', 'Retained positive: warfarin + Trisul'],
    ['retained-warfarin-sertraline', 'Retained positive: warfarin + sertraline'],
    ['duplicate-ibuprofen', 'Duplicate active ingredient: ibuprofen + Nurofen'],
    ['three-medicine-rule', 'Retained three-medicine rule'],
    ['unmatched-pair', 'Unmatched synthetic medicine pair'],
    ['no-medicines', 'No medicines']
  ];

  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  };

  function addTabWorkspace(content) {
    if (!content || content.dataset.testTabsReady === 'true') return;
    const resources = content.querySelector('.grid');
    if (!resources) return;

    content.dataset.testTabsReady = 'true';
    const originalChildren = Array.from(content.childNodes);
    const tabs = document.createElement('div');
    tabs.className = 'staff-test-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Staff workspace');

    const resourceTab = document.createElement('button');
    resourceTab.type = 'button';
    resourceTab.id = 'staff-resources-tab';
    resourceTab.setAttribute('role', 'tab');
    resourceTab.setAttribute('aria-controls', 'staff-resources-panel');
    resourceTab.setAttribute('aria-selected', 'true');
    resourceTab.tabIndex = 0;
    resourceTab.textContent = 'Staff resources';

    const resourcesPanel = document.createElement('div');
    resourcesPanel.id = 'staff-resources-panel';
    resourcesPanel.className = 'staff-test-panel';
    resourcesPanel.setAttribute('role', 'tabpanel');
    resourcesPanel.setAttribute('aria-labelledby', resourceTab.id);
    resourcesPanel.tabIndex = 0;
    resourcesPanel.append(...originalChildren);

    const labTab = document.createElement('button');
    labTab.type = 'button';
    labTab.id = 'staff-medication-tests-tab';
    labTab.setAttribute('role', 'tab');
    labTab.setAttribute('aria-controls', 'staff-medication-tests-panel');
    labTab.setAttribute('aria-selected', 'false');
    labTab.tabIndex = -1;
    labTab.textContent = 'Medication clash testing';

    const panel = document.createElement('section');
    panel.id = 'staff-medication-tests-panel';
    panel.className = 'staff-test-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', labTab.id);
    panel.tabIndex = 0;
    panel.hidden = true;

    panel.append(
      text('h2', 'Medication clash test lab'),
      text('p', 'Run fixed, fictional scenarios through the deployed local rule engine. These checks do not read or save anyone’s health records.', 'staff-test-intro')
    );
    const warning = text('p', 'Testing only. The engine has very limited coverage. “Unknown” and “unassessed” do not mean safe. No unreviewed clinical rule is activated here.', 'staff-test-warning');
    warning.setAttribute('role', 'note');
    panel.append(warning);

    const controls = document.createElement('div');
    controls.className = 'staff-test-controls';
    const label = document.createElement('label');
    label.htmlFor = 'staff-medication-scenario';
    label.append(text('span', 'Choose a synthetic scenario'));
    const select = document.createElement('select');
    select.id = 'staff-medication-scenario';
    for (const [id, title] of scenarioOptions) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = title;
      select.append(option);
    }
    label.append(select);

    const run = document.createElement('button');
    run.type = 'button';
    run.textContent = 'Run scenario';
    const runAll = document.createElement('button');
    runAll.type = 'button';
    runAll.className = 'secondary';
    runAll.textContent = 'Run all scenarios';
    controls.append(label, run, runAll);

    const status = text('p', 'Ready. Choose a synthetic scenario to run.', 'staff-test-status');
    status.id = 'staff-medication-test-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const results = document.createElement('div');
    results.className = 'staff-test-results';
    results.id = 'staff-medication-test-results';
    panel.append(controls, status, results);
    content.prepend(tabs);
    tabs.append(resourceTab, labTab);
    content.append(resourcesPanel, panel);

    new MutationObserver(records => {
      for (const node of records.flatMap(record => Array.from(record.addedNodes))) {
        if (node !== tabs && node !== resourcesPanel && node !== panel && node.parentNode === content) resourcesPanel.append(node);
      }
    }).observe(content, { childList: true });

    const setTab = (selected, focus = false) => {
      const isLab = selected === labTab;
      resourceTab.setAttribute('aria-selected', String(!isLab));
      labTab.setAttribute('aria-selected', String(isLab));
      resourceTab.tabIndex = isLab ? -1 : 0;
      labTab.tabIndex = isLab ? 0 : -1;
      resourcesPanel.hidden = isLab;
      panel.hidden = !isLab;
      if (focus) selected.focus();
      if (isLab) history.replaceState(null, '', `${location.pathname}${location.search}#medication-tests`);
      else if (location.hash === '#medication-tests') history.replaceState(null, '', `${location.pathname}${location.search}`);
    };
    resourceTab.addEventListener('click', () => setTab(resourceTab));
    labTab.addEventListener('click', () => setTab(labTab));
    tabs.addEventListener('keydown', event => {
      const buttons = [resourceTab, labTab];
      const current = buttons.indexOf(document.activeElement);
      let next = -1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % buttons.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next >= 0) { event.preventDefault(); setTab(buttons[next], true); }
    });

    function renderResult(item) {
      const card = document.createElement('article');
      card.className = 'staff-test-card';
      card.append(text('h3', item.title));
      card.append(text('p', item.expectation));
      if (item.source?.label) {
        const source = document.createElement('p');
        source.append(document.createTextNode('Evidence / scope: '));
        if (item.source.url) {
          const link = document.createElement('a');
          link.href = item.source.url;
          link.textContent = item.source.label;
          link.rel = 'noreferrer';
          link.target = '_blank';
          source.append(link);
        } else {
          source.append(document.createTextNode(item.source.label));
        }
        card.append(source);
      }

      const result = item.result || {};
      const statusNames = { red: 'Red · retained high-severity rule', orange: 'Orange · retained moderate-severity rule', green: 'Green · no alert in covered rules only', unknown: 'Unknown · no safety conclusion' };
      const badge = text('span', `Engine result: ${statusNames[result.status] || 'Unknown · no safety conclusion'}`, 'staff-test-result');
      badge.dataset.status = result.status || 'unknown';
      card.append(badge);

      const coverage = result.coverage || {};
      card.append(text('p', `Synthetic medicines: ${item.medicineCount}; terminology resolved: ${Number(coverage.resolved) || 0}, unknown: ${Number(coverage.unknown) || 0}. Pair checks: ${Number(coverage.assessedPairs) || 0} assessed, ${Number(coverage.unassessedPairs) || 0} unassessed. Overall coverage: ${coverage.completeForRequest === true ? 'complete for this limited request' : 'incomplete / limited'}.`, 'staff-test-small'));
      const alerts = Array.isArray(result.alerts) ? result.alerts : [];
      if (alerts.length) {
        const disclosure = document.createElement('details');
        disclosure.className = 'staff-test-alert-details';
        const summary = document.createElement('summary');
        summary.textContent = `View ${alerts.length} checker message${alerts.length === 1 ? '' : 's'}`;
        const list = document.createElement('ul');
        list.className = 'staff-test-alerts';
        for (const alert of alerts) {
          const li = document.createElement('li');
          li.dataset.severity = alert.severity || 'unknown';
          li.append(text('strong', `${alert.title || alert.type || 'Checker result'}${alert.ruleId ? ` · ${alert.ruleId}` : ''}: `));
          li.append(document.createTextNode(alert.message || alert.severity || 'Result returned.'));
          list.append(li);
        }
        disclosure.append(summary, list);
        card.append(disclosure);
      } else {
        card.append(text('p', 'No medication alert was returned for this empty fixture. No medication check ran.', 'staff-test-small'));
      }
      results.append(card);
    }

    async function execute(scenarioId) {
      run.disabled = true;
      runAll.disabled = true;
      status.textContent = 'Running fictional test data through the local rules…';
      results.replaceChildren();
      try {
        const response = await fetch('/api/staff/medication-clash-test', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ scenarioId })
        });
        const payload = await response.json();
        if (!response.ok || payload.synthetic !== true || payload.persisted !== false || !Array.isArray(payload.results)) {
          throw new Error(payload.error || 'The test could not run.');
        }
        for (const item of payload.results) renderResult(item);
        status.textContent = `${payload.results.length} synthetic scenario${payload.results.length === 1 ? '' : 's'} completed. No health records were read or changed.`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'The test could not run.';
      } finally {
        run.disabled = false;
        runAll.disabled = false;
      }
    }

    run.addEventListener('click', () => execute(select.value));
    runAll.addEventListener('click', () => execute('all'));
    if (location.hash === '#medication-tests') setTab(labTab);
  }

  const content = document.querySelector('#staff-content');
  if (!content) return;
  const workspace = content.querySelector('#staff-tools-panel') || content;
  const prepareWorkspace = () => {
    if (!content.hidden && !workspace.hidden) addTabWorkspace(workspace);
  };
  prepareWorkspace();
  new MutationObserver(prepareWorkspace).observe(content, { attributes: true, attributeFilter: ['hidden'] });
  if (workspace !== content) {
    new MutationObserver(prepareWorkspace).observe(workspace, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
