'use strict';

const assert = require('node:assert/strict');
const nzf = require('../api/medication/_lib/nzf-fhir.cjs');

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const env = {
  NZF_FHIR_BASE_URL: 'https://fhir.example.nz/api/fhir/',
  NZF_FHIR_ALLOWED_HOSTS: 'fhir.example.nz',
  NZF_FHIR_ACCESS_TOKEN: 'synthetic-preview-token',
  NZF_FHIR_ACCESS_TOKEN_EXPIRES_AT: future,
  NZF_NZMT_SEARCH_CONSUMER_USE_APPROVED: 'true'
};

function medication({ id, gtin, name, ingredients = [] }) {
  return {
    resourceType: 'Medication',
    id,
    meta: { lastUpdated: '2026-08-01T00:00:00Z' },
    status: 'active',
    code: {
      coding: [
        { system: nzf.NZMT_SYSTEM, code: id, display: name },
        ...(gtin ? [{ system: nzf.GTIN_SYSTEM, code: gtin }] : [])
      ]
    },
    form: { coding: [{ system: nzf.NZMT_SYSTEM, code: '147011000036100', display: 'tablet' }] },
    extension: [{
      url: 'http://hl7.org.nz/fhir/StructureDefinition/nzf-nzmt-type',
      valueCodeableConcept: { coding: [{ system: 'https://standards.digital.health.nz/ns/nzmt-type-code', code: 'ctpp' }] }
    }],
    ingredient: ingredients
  };
}

async function run() {
  assert.equal(nzf.configured({}, Date.now()), false, 'The database must remain disabled without approved terms and credentials.');
  assert.equal(nzf.configured({ ...env, NZF_FHIR_ALLOWED_HOSTS: 'attacker.example' }, Date.now()), false, 'The FHIR host must match an explicit allowlist.');
  assert.equal(nzf.configured({ ...env, NZF_FHIR_ACCESS_TOKEN_EXPIRES_AT: '' }, Date.now()), false, 'Expired or unbounded bearer credentials are not accepted.');
  assert.equal(nzf.isGtin('09403092340084'), true);
  assert.equal(nzf.isGtin('12345'), false);
  assert.equal(nzf.isGtin('09403092340085'), false, 'GTIN checksum errors must not trigger exact barcode search.');
  assert.equal(nzf.safeBaseUrl({ ...env, NZF_FHIR_BASE_URL: 'https://fhir.example.nz:8443/api/fhir/' }), null, 'Nonstandard HTTPS ports are not accepted.');

  const nameUrl = nzf.buildProductSearchUrl('Nurofen Cold & Flu', env);
  assert.equal(nameUrl.origin, 'https://fhir.example.nz');
  assert.equal(nameUrl.pathname, '/api/fhir/Medication');
  assert.equal(nameUrl.searchParams.get('nzf-preferred-term:contains'), 'Nurofen Cold & Flu');
  assert.equal(nameUrl.searchParams.get('nzf-nzmt-type'), 'ctpp');
  assert.equal(nameUrl.searchParams.get('_count'), '12');

  const gtinUrl = nzf.buildProductSearchUrl('09403092340084', env);
  assert.equal(gtinUrl.searchParams.get('code'), `${nzf.GTIN_SYSTEM}|09403092340084`);

  const source = medication({
    id: '50066481000117107',
    gtin: '09403092340084',
    name: 'Nurofen Cold & Flu tablet',
    ingredients: [
      {
        itemCodeableConcept: { coding: [{ system: nzf.NZMT_SYSTEM, code: '2211011000036101', display: 'ibuprofen' }] },
        isActive: true,
        strength: { numerator: { value: 200, unit: 'mg' } }
      },
      {
        itemCodeableConcept: { coding: [{ system: nzf.NZMT_SYSTEM, code: '2525011000036101', display: 'pseudoephedrine' }] },
        isActive: true,
        strength: { numerator: { value: 30, unit: 'mg' } },
        extension: [{
          url: 'http://hl7.org.nz/fhir/StructureDefinition/nzf-specific-substance',
          valueCodeableConcept: { coding: [{ system: nzf.NZMT_SYSTEM, code: '2526011000036108', display: 'pseudoephedrine hydrochloride' }] }
        }]
      }
    ]
  });
  const product = nzf.normalizeMedication(source);
  assert.equal(product.id, '50066481000117107');
  assert.equal(product.name, 'Nurofen Cold & Flu tablet');
  assert.equal(product.productType, 'ctpp');
  assert.equal(product.gtins[0], '09403092340084');
  assert.deepEqual(product.ingredients.map(item => item.name), ['ibuprofen', 'pseudoephedrine']);
  assert.equal(product.ingredients[0].strength, '200 mg');
  assert.equal(product.ingredients[1].specificSubstance, 'pseudoephedrine hydrochloride');
  assert.equal(product.activeIngredientCount, 2);
  assert.equal(product.ingredientsComplete, true);
  const nineActive = Array.from({ length: 9 }, (_, index) => ({
    itemCodeableConcept: { coding: [{ system: nzf.NZMT_SYSTEM, code: String(1000000 + index), display: `synthetic ingredient ${index + 1}` }] },
    isActive: true
  }));
  const overflowProduct = nzf.normalizeMedication(medication({ id: '50066481000117107', name: 'Synthetic combination', ingredients: nineActive }));
  assert.equal(overflowProduct.activeIngredientCount, 9);
  assert.equal(overflowProduct.ingredients.length, 9);
  assert.equal(overflowProduct.ingredientsComplete, false, 'More active ingredients than the form supports must never be marked complete.');
  assert.equal(nzf.normalizeMedication({ resourceType: 'Medication', id: 'unmapped' }), null);

  const exactGtinProduct = medication({ id: '50066481000117107', gtin: '09403092340084', name: 'Exact pack', ingredients: [] });
  const differentGtinProduct = medication({ id: '50066491000117104', gtin: '09403092340091', name: 'Other pack', ingredients: [] });
  let requestedUrl;
  let authorization;
  const response = await nzf.searchProducts('09403092340084', {
    env,
    now: Date.now(),
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      authorization = options.headers.authorization;
      return {
        ok: true,
        text: async () => JSON.stringify({
          resourceType: 'Bundle',
          entry: [
            { resource: exactGtinProduct },
            { resource: differentGtinProduct },
            { resource: { resourceType: 'OperationOutcome', issue: [{ severity: 'warning', code: 'informational', details: { text: 'One product was not mapped.' } }] } }
          ]
        })
      };
    }
  });
  assert.equal(requestedUrl.searchParams.get('code'), `${nzf.GTIN_SYSTEM}|09403092340084`);
  assert.equal(authorization, 'Bearer synthetic-preview-token');
  assert.deepEqual(response.products.map(item => item.name), ['Exact pack']);
  assert.equal(response.warnings.length, 1);
  assert.match(response.warnings[0].details, /not mapped/);

  let called = false;
  await assert.rejects(() => nzf.searchProducts('name', {
    env: {},
    fetchImpl: async () => { called = true; throw new Error('should not reach fetch'); }
  }), /nzf_product_search_not_configured/);
  assert.equal(called, false, 'Provider requests must fail closed before network access.');

  const interactionEnv = { ...env, NZF_INTERACTION_CONSUMER_USE_APPROVED: 'true', NZF_INTERACTION_DISPLAY_APPROVED: 'true' };
  const cud = {
    resourceType: 'ClinicalUseDefinition',
    type: 'interaction',
    subject: { reference: 'Medication/50066481000117107', display: 'Exact pack' },
    interaction: { interactant: [{ itemReference: { reference: 'Medication/50066491000117104', display: 'Other pack' } }] },
    description: { text: 'Synthetic interaction detail; do not use for clinical decisions.' },
    extension: [
      { url: 'http://hl7.org.nz/fhir/StructureDefinition/stockleys-interaction-severity-code', valueCodeableConcept: { coding: [{ code: 'high', display: 'Major' }] } },
      { url: 'http://hl7.org.nz/fhir/StructureDefinition/stockleys-interaction-evidence-code', valueCodeableConcept: { coding: [{ code: 'good', display: 'Good' }] } }
    ]
  };
  let operationRequest;
  const interactionResult = await nzf.checkInteractions(['50066481000117107', '50066491000117104'], {
    env: interactionEnv,
    fetchImpl: async (url, options) => {
      operationRequest = { url: new URL(url), options };
      return {
        ok: true,
        text: async () => JSON.stringify({
          resourceType: 'Bundle',
          entry: [
            { resource: cud },
            { resource: { resourceType: 'OperationOutcome', issue: [{ severity: 'warning', code: 'informational', diagnostics: 'One product component is unmatched.' }] } }
          ]
        })
      };
    }
  });
  assert.equal(operationRequest.url.pathname, '/api/fhir/Medication/$interactions-between');
  assert.equal(operationRequest.options.method, 'POST');
  assert.equal(operationRequest.options.headers.authorization, 'Bearer synthetic-preview-token');
  const operationBody = JSON.parse(operationRequest.options.body);
  assert.deepEqual(operationBody.parameter.filter(item => item.name === 'nzmtid').map(item => item.valueString), ['50066481000117107', '50066491000117104']);
  assert.equal(operationBody.parameter.find(item => item.name === 'filterComplementaryRecords').valueBoolean, true);
  assert.equal(interactionResult.status, 'partial', 'Any provider mapping warning makes the result partial.');
  assert.equal(interactionResult.interactions[0].subject, 'Exact pack');
  assert.deepEqual(interactionResult.interactions[0].interactants, ['Other pack']);
  assert.equal(interactionResult.interactions[0].severity, 'Major');
  assert.match(interactionResult.interactions[0].summary, /Synthetic interaction detail/);

  let interactionCalled = false;
  await assert.rejects(() => nzf.checkInteractions(['50066481000117107'], {
    env,
    fetchImpl: async () => { interactionCalled = true; throw new Error('should not reach fetch'); }
  }), /nzf_interaction_check_not_configured/);
  assert.equal(interactionCalled, false, 'Interaction operations remain disabled until approved display terms are configured.');

  process.stdout.write('NZF FHIR verification passed (consumer-use/display gates, host allowlist, expiring token, checksum-validated GTIN, exact product selection, FHIR interaction request/response, partial warnings, and fail-closed behavior).\n');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
