/* Record lifecycle only. This does not assess medicine safety or suitability. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DoctorAIMedicationRecords = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const text = value => String(value ?? '').trim();
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function currentMedicines(records, at = Date.now()) {
    const supplied = at instanceof Date ? at : new Date(at);
    const now = Number.isNaN(supplied.getTime()) ? new Date() : supplied;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return (Array.isArray(records) ? records : []).filter(value => {
      const item = value && typeof value === 'object' ? value : {};
      const inactive = item.deleted === true || item.dismissed === true || item.archived === true || item.active === false || /^(?:deleted|dismissed|archived|inactive|stopped|discontinued|completed|resolved)$/i.test(text(item.status));
      return !inactive && !(validDate(item.endDate) && item.endDate < today) && !(validDate(item.startDate) && item.startDate > today);
    });
  }
  return Object.freeze({ currentMedicines });
});
