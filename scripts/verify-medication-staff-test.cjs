'use strict';

const assert = require('node:assert/strict');
const actualCore = require('../server-src/_lib/doctorai-core.cjs');
const staffActionDispatcher = require('../api/staff/[...action].js');
const { createMedicationClashTestHandler, fixtures } = require('../server-src/staff/medication-clash-test.cjs');

const fakeCore = {
  noStore(response) { response.cacheControl = 'no-store'; },
  async identityFromRequest(request) { return request.session || null; },
  isAdmin(session) { return session.email === 'admin@example.test'; },
  json(response, status, payload) { response.statusCode = status; response.body = payload; return payload; }
};

async function invoke(handler, { method = 'POST', body = {}, session = null } = {}) {
  const response = {};
  await handler({ method, body, session }, response);
  return response;
}

async function invokePublishedRoute({ method = 'POST', body = {}, session = null } = {}) {
  const originalIdentity = actualCore.identityFromRequest;
  const originalIsAdmin = actualCore.isAdmin;
  actualCore.identityFromRequest = async () => session;
  actualCore.isAdmin = value => value?.email === 'admin@example.test';
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(payload) { this.body = payload; return this; }
  };
  try {
    await staffActionDispatcher({ method, body, url: '/api/staff/medication-clash-test', query: { action: 'medication-clash-test' } }, response);
  } finally {
    actualCore.identityFromRequest = originalIdentity;
    actualCore.isAdmin = originalIsAdmin;
  }
  return response;
}

async function main() {
  const handler = createMedicationClashTestHandler({ core: fakeCore });
  assert.equal((await invoke(handler)).statusCode, 401, 'signed-out request is denied');
  assert.equal((await invoke(handler, { session: { email: 'visitor@example.test' } })).statusCode, 403, 'non-admin request is denied');
  assert.equal((await invoke(handler, { method: 'GET', session: { email: 'admin@example.test' } })).statusCode, 405, 'only POST is allowed');
  assert.equal((await invoke(handler, { session: { email: 'admin@example.test' }, body: { scenarioId: 'all', medications: ['real patient data'] } })).statusCode, 400, 'endpoint rejects caller-supplied medicine data');
  assert.equal((await invoke(handler, { session: { email: 'admin@example.test' }, body: { scenarioId: 'not-a-fixture' } })).statusCode, 400, 'endpoint accepts only fixed scenario ids');

  const dispatched = await invokePublishedRoute({ session: { email: 'admin@example.test' }, body: { scenarioId: 'voltaren-ibuprofen' } });
  assert.equal(dispatched.statusCode, 200, 'the deployed staff route dispatcher reaches the test handler');
  assert.equal(dispatched.body.synthetic, true);
  assert.equal(dispatched.body.results[0].result.coverage.unassessedPairs, 1);
  const dispatchedDenied = await invokePublishedRoute({ session: { email: 'visitor@example.test' }, body: { scenarioId: 'all' } });
  assert.equal(dispatchedDenied.statusCode, 403, 'the deployed staff route dispatcher keeps the endpoint admin-only');

  const exact = await invoke(handler, { session: { email: 'admin@example.test' }, body: { scenarioId: 'voltaren-ibuprofen' } });
  assert.equal(exact.statusCode, 200);
  assert.equal(exact.cacheControl, 'no-store');
  assert.equal(exact.body.synthetic, true);
  assert.equal(exact.body.persisted, false);
  const exactResult = exact.body.results[0].result;
  assert.equal(exactResult.status, 'unknown');
  assert.equal(exactResult.coverage.requestedPairs, 1);
  assert.equal(exactResult.coverage.assessedPairs, 0);
  assert.equal(exactResult.coverage.unassessedPairs, 1);
  assert.ok(exactResult.alerts.some(alert => alert.type === 'interaction-coverage' && alert.severity === 'unknown'));
  assert.ok(!exactResult.alerts.some(alert => ['interaction', 'contraindication'].includes(alert.type)), 'excluded NSAID candidate remains inactive');

  const all = await invoke(handler, { session: { email: 'admin@example.test' }, body: { scenarioId: 'all' } });
  assert.equal(all.statusCode, 200);
  assert.equal(all.body.results.length, Object.keys(fixtures).length);
  assert.equal(all.body.persisted, false);
  const resultById = Object.fromEntries(all.body.results.map(item => [item.id, item.result]));
  assert.equal(resultById['warfarin-ibuprofen'].status, 'unknown', 'unretained warfarin-NSAID pair stays unassessed');
  assert.ok(resultById['retained-warfarin-sulfamethoxazole'].alerts.some(alert => alert.ruleId === 'warfarin-sulfamethoxazole'));
  assert.ok(resultById['retained-warfarin-sertraline'].alerts.some(alert => alert.ruleId === 'oral-anticoagulant-ssri'));
  assert.ok(resultById['duplicate-ibuprofen'].alerts.some(alert => alert.type === 'duplicate-ingredient'));
  assert.ok(resultById['three-medicine-rule'].alerts.some(alert => alert.ruleId === 'ras-inhibitor-diuretic-nsaid-aki'));
  assert.equal(resultById['unmatched-pair'].coverage.unmatched, 2);
  assert.equal(resultById['no-medicines'].coverage.requestedPairs, 0);
  assert.deepEqual(resultById['no-medicines'].alerts, []);

  console.log(`Staff medication test endpoint: access-control cases passed; ${all.body.results.length}/${all.body.results.length} synthetic scenarios matched expected rule-scope behavior.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
