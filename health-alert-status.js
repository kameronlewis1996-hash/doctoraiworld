/* Presentation only: summarises the existing local alert result without adding rules. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoctorAIAlertStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const limited = 'Limited checks. No alert does not mean safe.';
  function describe(result) {
    if (!result || !Array.isArray(result.alerts) || !result.coverage || typeof result.coverage !== 'object') {
      return { level: 'neutral', symbol: '?', title: 'Checks unavailable', note: 'Open Alerts for details. Your records are not cleared.' };
    }
    const alerts = result.alerts;
    const count = alerts.length;
    const notices = `${count} ${count === 1 ? 'notice' : 'notices'}`;
    if (alerts.some(alert => ['urgent', 'critical'].includes(alert?.severity))) {
      return { level: 'red', symbol: '!', title: 'Urgent medical help', note: `${notices}. Open now for the next step.` };
    }
    if (alerts.some(alert => alert?.severity === 'high')) {
      return { level: 'red', symbol: '!', title: 'Contact a professional', note: `${notices}. Ask a pharmacist or clinician to review.` };
    }
    if (count) return { level: 'orange', symbol: '!', title: 'Review needed', note: `${notices} in your saved details. Open to review.` };
    const coverage = result.coverage;
    const medicines = coverage.medications || {};
    const symptoms = coverage.symptoms || {};
    const recorded = Number(medicines.requested) > 0 || Number(symptoms.recorded) > 0 || Number(coverage.results?.recorded) > 0 || Number(coverage.allergyMedication?.recorded) > 0 || Number(coverage.conditionMedication?.recorded) > 0 || Number(coverage.healthDetails?.bloodTypeRecords) > 0;
    if (!recorded) return { level: 'neutral', symbol: '?', title: 'Add details to check', note: 'No saved details have been assessed yet.' };
    const outsideChecks = (Array.isArray(medicines.unknown) && medicines.unknown.length > 0) ||
      Number(medicines.requested) > Number(medicines.resolved) ||
      Number(coverage.results?.recorded) > 0 || Number(symptoms.undated) > 0 ||
      [symptoms, coverage.conditionMedication].some(part => Array.isArray(part?.unmatched) && part.unmatched.length > 0) ||
      Object.values(coverage).some(part => part && typeof part === 'object' && Number(part.omittedByLimit) > 0);
    if (outsideChecks) return { level: 'orange', symbol: '?', title: 'Some details need review', note: 'Some entries are outside these checks. Open for details.' };
    // Green describes only an evaluated, recognised medicine list, never overall health.
    const medicineCounts = [medicines.requested, medicines.resolved, medicines.checked];
    if (!(medicineCounts.every(value => Number.isSafeInteger(value) && value > 0) &&
      medicines.requested === medicines.resolved && medicines.resolved === medicines.checked &&
      Array.isArray(medicines.unknown))) {
      return { level: 'neutral', symbol: '?', title: 'Checks are limited', note: 'These details do not give a medicine-safety result.' };
    }
    return { level: 'green', symbol: '✓', title: 'No flagged notices', note: limited };
  }
  function render(result, documentRoot) {
    const doc = documentRoot || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const status = describe(result);
    doc.querySelectorAll('[data-alert-summary]').forEach(button => {
      button.dataset.alertLevel = status.level;
      button.querySelector('[data-alert-symbol]').textContent = status.symbol;
      button.querySelector('[data-alert-title]').textContent = status.title;
      button.querySelector('[data-alert-note]').textContent = status.note;
      button.setAttribute('aria-label', `Alerts: ${status.title}. ${status.note} Open alerts.`);
    });
    doc.querySelectorAll('.primary-nav [data-view="today"], .category-bar [data-view="today"], .mobile-bottom-nav [data-view="today"]').forEach(button => {
      let symbol = button.querySelector('.hub-alert-nav-symbol');
      if (!symbol) {
        // Keep status glyphs separate from the app's span/i icon hydrator.
        symbol = doc.createElement('em');
        symbol.className = 'hub-alert-nav-symbol';
        symbol.setAttribute('aria-hidden', 'true');
        button.appendChild(symbol);
      }
      symbol.textContent = status.symbol;
      symbol.dataset.alertLevel = status.level;
      symbol.hidden = status.level === 'neutral';
      button.setAttribute('aria-label', symbol.hidden ? 'Today' : `Today. Alerts: ${status.title}`);
    });
  }
  return Object.freeze({ describe, render });
});
