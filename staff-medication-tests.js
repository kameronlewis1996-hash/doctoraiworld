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

  const panel = document.querySelector('#staff-medication-tests-panel');
  const mount = document.querySelector('#staff-medication-tests-app');
  if (!panel || !mount) return;

  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  };

  const heading = text('h2', 'Medication testing lab');
  const intro = text('p', 'Run fixed, fictional scenarios through the existing checker. No personal health record is read or changed.', 'staff-test-intro');
  const warning = text('p', 'Limited coverage only. Unknown or unassessed does not mean safe. Candidate rules remain inactive.', 'staff-test-warning');
  warning.setAttribute('role', 'note');

  const controls = document.createElement('div');
  controls.className = 'staff-test-controls';
  const label = document.createElement('label');
  label.htmlFor = 'staff-medication-scenario';
  label.append(text('span', 'Choose a fictional scenario'));
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
  mount.replaceChildren(heading, intro, warning, controls, status, results);

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
        link.rel = 'noopener noreferrer';
        link.target = '_blank';
        source.append(link);
      } else {
        source.append(document.createTextNode(item.source.label));
      }
      card.append(source);
    }

    const result = item.result || {};
    const statusNames = {
      red: 'Red - retained high-severity rule',
      orange: 'Orange - retained moderate-severity rule',
      green: 'Green - no alert in covered rules only',
      unknown: 'Unknown - no safety conclusion'
    };
    const badge = text('span', `Engine result: ${statusNames[result.status] || statusNames.unknown}`, 'staff-test-result');
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
        const itemNode = document.createElement('li');
        itemNode.dataset.severity = alert.severity || 'unknown';
        itemNode.append(text('strong', `${alert.title || alert.type || 'Checker result'}${alert.ruleId ? ` - ${alert.ruleId}` : ''}: `));
        itemNode.append(document.createTextNode(alert.message || alert.severity || 'Result returned.'));
        list.append(itemNode);
      }
      disclosure.append(summary, list);
      card.append(disclosure);
    } else {
      card.append(text('p', 'This empty fixture returned no alert. No medicine check ran.', 'staff-test-small'));
    }
    results.append(card);
  }

  async function execute(scenarioId) {
    run.disabled = true;
    runAll.disabled = true;
    status.textContent = 'Running fictional test data through the local rules.';
    results.replaceChildren();
    try {
      const response = await fetch('/api/staff/medication-clash-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
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
})();
