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
    const coverage = result.coverage;
    const medicines = coverage.medications;
    const medicationMedication = coverage.medicationMedication;
    const validPairCoverage = medicationMedication && medicationMedication.status === 'limited' &&
      Number.isSafeInteger(medicationMedication.ruleCount) && medicationMedication.ruleCount >= 0 &&
      Number.isSafeInteger(medicationMedication.requestedPairs) && medicationMedication.requestedPairs >= 0 &&
      Number.isSafeInteger(medicationMedication.assessedPairs) && medicationMedication.assessedPairs >= 0 &&
      Number.isSafeInteger(medicationMedication.unassessedPairs) && medicationMedication.unassessedPairs >= 0 &&
      medicationMedication.assessedPairs + medicationMedication.unassessedPairs === medicationMedication.requestedPairs &&
      Array.isArray(medicationMedication.unassessed) && medicationMedication.unassessed.length <= medicationMedication.unassessedPairs &&
      Number.isSafeInteger(medicationMedication.omittedUnassessedPairs) && medicationMedication.omittedUnassessedPairs === medicationMedication.unassessedPairs - medicationMedication.unassessed.length;
    if (validPairCoverage && medicines?.requested > 0 && medicationMedication.unassessedPairs > 0) {
      return { level: 'orange', symbol: '?', title: 'Medicine pair unassessed', note: `${medicationMedication.unassessedPairs} of ${medicationMedication.requestedPairs} saved medicine pairs have no retained rule or a complete identity. No alert does not mean safe. Ask a pharmacist or prescriber to review.` };
    }
    if (count) return { level: 'orange', symbol: '!', title: 'Review needed', note: `${notices} in your saved details. Open to review.` };
    const allergies = coverage.allergyMedication;
    const conditions = coverage.conditionMedication;
    const symptoms = coverage.symptoms;
    const results = coverage.results;
    const counters = [
      [medicines, ['requested', 'checked', 'resolved', 'omittedByLimit']],
      [medicationMedication, ['ruleCount', 'multiMedicineRuleCount', 'requestedPairs', 'assessedPairs', 'unassessedPairs', 'omittedUnassessedPairs']],
      [allergies, ['recorded', 'affirmative', 'excludedOrUncertain', 'omittedByLimit']],
      [conditions, ['recorded', 'affirmative', 'omittedByLimit']],
      [symptoms, ['recorded', 'recent', 'matched', 'undated', 'omittedByLimit']],
      [results, ['recorded']]
    ];
    const validCounters = counters.every(([part, fields]) => part && typeof part === 'object' &&
      fields.every(field => Number.isSafeInteger(part[field]) && part[field] >= 0));
    const validCoverage = Array.isArray(coverage.missing) && coverage.missing.every(item => typeof item === 'string') &&
      coverage.localOnly === true && medicines?.status === 'limited' && allergies?.status === 'limited' &&
      medicationMedication?.status === 'limited' && medicationMedication.coverageLevel === 'very-limited' &&
      Array.isArray(medicationMedication.unassessed) && medicationMedication.assessedPairs + medicationMedication.unassessedPairs === medicationMedication.requestedPairs &&
      medicationMedication.unassessed.length <= medicationMedication.unassessedPairs && medicationMedication.omittedUnassessedPairs === medicationMedication.unassessedPairs - medicationMedication.unassessed.length &&
      conditions?.status === 'limited' && symptoms?.status === 'limited' && results?.status === 'not_assessed' &&
      Array.isArray(medicines?.unknown) && Array.isArray(conditions?.unmatched) && Array.isArray(symptoms?.unmatched) &&
      validCounters && allergies.recorded === allergies.affirmative + allergies.excludedOrUncertain;
    if (!validCoverage) return { level: 'neutral', symbol: '?', title: 'Checks are limited', note: 'A complete current result is not available. Open Alerts for details.' };
    const recorded = medicines.requested > 0 || symptoms.recorded > 0 || results.recorded > 0 ||
      allergies.recorded > 0 || conditions.recorded > 0 || Number(coverage.healthDetails?.bloodTypeRecords) > 0;
    if (!recorded) return { level: 'neutral', symbol: '?', title: 'Add details to check', note: 'No saved details have been assessed yet.' };
    const outsideChecks = coverage.missing.length > 0 || medicines.unknown.length > 0 ||
      medicines.requested !== medicines.resolved || medicines.resolved !== medicines.checked || medicines.omittedByLimit > 0 ||
      medicines.requested > 0 || medicationMedication.unassessedPairs > 0 ||
      allergies.excludedOrUncertain > 0 || allergies.omittedByLimit > 0 ||
      conditions.unmatched.length > 0 || conditions.omittedByLimit > 0 ||
      symptoms.undated > 0 || symptoms.unmatched.length > 0 || symptoms.omittedByLimit > 0 ||
      results.recorded > 0 ||
      Object.values(coverage).some(part => part && typeof part === 'object' && Number(part.omittedByLimit) > 0);
    if (outsideChecks) return { level: 'orange', symbol: '?', title: 'Some details need review', note: medicines.requested > 0 ? `${medicationMedication.ruleCount} pairwise and ${medicationMedication.multiMedicineRuleCount} multi-medicine rule(s) are retained. Medicine interaction coverage is very limited; unmatched pairs are unassessed. No alert does not mean safe. Open Alerts and ask a pharmacist or prescriber to review.` : 'Some entries are missing, uncertain or outside these checks. Open Alerts for details.' };
    // Green describes only a recognised, fully supplied local medication check, never overall health.
    return { level: 'green', symbol: '✓', title: 'No flagged notices', note: limited };
  }
  function render(result, documentRoot) {
    const doc = documentRoot || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const status = describe(result);
    // Presentation follows the current result only; never persist an alert tint.
    if (doc.body) doc.body.dataset.healthAlertLevel = status.level;
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
      button.setAttribute('aria-label', symbol.hidden ? 'Today' : `Today. Alerts: ${status.title}. ${status.note}`);
    });
  }
  return Object.freeze({ describe, render });
});
