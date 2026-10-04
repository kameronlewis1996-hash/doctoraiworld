'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../health-hub.html'), 'utf8');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Expected source section ${startMarker}`);
  return source.slice(start, end);
};

const scanFlow = section('  async function openMedicationScanner() {', '  async function scanMedicationPhoto(');
assert.ok(scanFlow.includes('Choose a label photo after consent, or enter medicine details manually.'));
assert.equal(scanFlow.includes('getUserMedia'), false, 'Photo selection must not directly request camera access.');
assert.equal(source.includes('BarcodeDetector'), false, 'Retired barcode lookup cannot call a product-matching service.');
assert.equal(source.includes('data-medication-barcode'), false, 'Retired barcode lookup is not exposed in the UI.');
assert.doesNotMatch(html, /barcode/i, 'The static medication UI must not promise the retired barcode path.');
assert.ok(source.includes('data-medication-photo') && source.includes('data-medication-image-consent'), 'Label photos remain a separate, consented OCR flow.');

assert.ok(source.includes('const scanReviewRequired = Boolean(prefill.__scanned);'));
assert.ok(source.includes('name="reviewedAgainstPackage" ${scanReviewRequired ? \'required\' : \'\'}'));
assert.ok(source.includes('form.dataset.scanReviewRequired === \'true\' && values.reviewedAgainstPackage !== \'on\''), 'Scan-derived saves must require the review receipt.');
assert.ok(source.includes('if (receipt) receipt.checked = false;'), 'Changing a field must clear the previous review acknowledgment.');
assert.ok(source.includes("entrySource: existingMedication?.entrySource || (form.dataset.scanReviewRequired === 'true' ? 'scan' : 'manual')"));
assert.ok(source.includes("reviewedAgainstPackageAt: values.reviewedAgainstPackage === 'on' ? new Date().toISOString() : ''"), 'Editing without a new acknowledgment clears the previous receipt.');
assert.ok(source.includes("instructions: String(values.instructions || '').replace"), 'Unread directions stay empty instead of receiving a plausible default.');
assert.ok(source.includes('dose" maxlength="80"'), 'A scan may preserve an unread strength as unknown.');
assert.equal(source.includes('name="dose" required maxlength="80"'), false, 'Strength requirement is enforced by entry mode so a scan can keep unknown blank.');

const briefing = section('  function openTodayPlan() {', '  function buildTodayPlanPrompt(values) {');
assert.equal(briefing.includes('loadTodayIntelligence('), false, 'Opening the daily overview must not send health data to an AI provider.');
assert.ok(briefing.includes('data-briefing-medication') && briefing.includes('data-briefing-symptom') && briefing.includes('data-briefing-consent'));
const resultRenderer = section('  function renderLocalMedicationDatabaseResult(', '  async function runLocalMedicationSafetyCheck(');
assert.ok(resultRenderer.includes("url.protocol === 'https:'"));
assert.ok(resultRenderer.includes("link.rel = 'noopener noreferrer'"));

process.stdout.write('Medication review verification passed: explicit camera choice, per-scan acknowledgment, unknown blanks, source receipts, and no briefing request on open.\n');
