'use strict';

const { performance } = require('node:perf_hooks');
const scanHandler = require('../api/medication/_handlers/scan.js');
const { reviewResolved, resolveMedication } = require('../server-src/medication/safety-engine.cjs');

const extractedInput = {
  name: 'Nurofen', dose: '2000 mg per tablet', activeIngredients: ['ibuprofen'],
  frequency: 'Once daily', time: '', instructions: 'Synthetic directions', supply: '12',
  refill: '', startDate: '', endDate: '', prescriptionExpiry: '', repeats: ''
};
const matchingInputs = [
  { name: 'Marevan', dose: '1 mg' },
  { name: 'Nurofen', dose: '2000 mg per tablet' },
  { name: 'Trisul', dose: '800 mg + 160 mg' },
  { name: 'Unlisted synthetic tablet', dose: '10 mg' }
];
const ruleMedications = [
  { name: 'Marevan', dose: '1 mg', activeIngredients: ['warfarin'], activeIngredientsConfirmed: true },
  { name: 'Nurofen', dose: '200 mg', activeIngredients: ['ibuprofen'], activeIngredientsConfirmed: true },
  { name: 'Setrona', dose: '50 mg' },
  { name: 'unlisted synthetic tablet', dose: '10 mg' }
].map(resolveMedication);
let matchingInputIndex = 0;

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function measure(name, fn, { batches = 120, operationsPerBatch = 40 } = {}) {
  for (let i = 0; i < 100; i += 1) fn();
  const perOperationMs = [];
  for (let batch = 0; batch < batches; batch += 1) {
    const start = performance.now();
    for (let i = 0; i < operationsPerBatch; i += 1) fn();
    perOperationMs.push((performance.now() - start) / operationsPerBatch);
  }
  return {
    stage: name,
    operations: batches * operationsPerBatch,
    medianMsPerOperation: Number(percentile(perOperationMs, 0.5).toFixed(4)),
    p95MsPerOperation: Number(percentile(perOperationMs, 0.95).toFixed(4))
  };
}

const results = [
  measure('extraction-field-normalization (no OCR inference)', () => scanHandler.normalizeExtractedMedication(extractedInput)),
  measure('catalogue-name/strength matching (one medicine)', () => resolveMedication(matchingInputs[matchingInputIndex++ % matchingInputs.length])),
  measure('local-rule-evaluation (pre-matched inputs)', () => reviewResolved({ resolved: ruleMedications, allergies: ['penicillin'], conditions: ['kidney disease'] }))
];
process.stdout.write(JSON.stringify({
  environment: process.version,
  synthetic: true,
  datasetVersion: require('../data/medication/medication-safety.seed.json').datasetVersion,
  pharmacProducts: require('../data/medication/nz-pharmac-medicines.json').products.length,
  interactionRules: require('../data/medication/medication-safety.seed.json').interactionRules.length,
  ocrInferenceMeasured: false,
  paidProviderCalls: 0,
  results
}, null, 2) + '\n');
