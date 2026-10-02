'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../health-hub.js'), 'utf8');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Expected source section ${startMarker}`);
  return source.slice(start, end);
};

const openScanner = section('  async function openMedicationScanner() {', '  async function startMedicationScannerCamera() {');
const startCamera = section('  async function startMedicationScannerCamera() {', '  async function scanMedicationPhoto(');
assert.ok(openScanner.includes('Choose package barcode, label photo, or manual entry'));
assert.equal(openScanner.includes('getUserMedia'), false, 'Opening the scanner must not request camera access.');
assert.ok(startCamera.includes('navigator.mediaDevices.getUserMedia'), 'Camera access is available only after the barcode action.');
assert.ok(source.includes('data-medication-barcode'), 'Barcode scanning must be an explicit user choice.');

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
