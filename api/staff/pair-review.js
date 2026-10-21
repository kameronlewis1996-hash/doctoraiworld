'use strict';

const core = require('../../server-src/_lib/doctorai-core.cjs');
const allowedStatuses = new Set([
  'evidence_candidate',
  'no_interaction_found_in_specified_sources',
  'blocked',
  'conflicting_evidence'
]);
const maximumPageSize = 50;
const demoSampleCount = 4;

function queryParams(request) {
  const rawUrl = typeof request.url === 'string' ? request.url : '/api/staff/pair-review';
  return new URL(rawUrl, 'https://doctoraiworld.invalid').searchParams;
}

function validInteger(value, fallback, maximum) {
  if (value === null) return fallback;
  if (!/^\d{1,6}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function isSyntheticDemo(dataset) {
  if (dataset.schemaVersion !== 1 || dataset.artifactType !== 'synthetic_pair_review_demo' ||
      dataset.demoOnly !== true || dataset.researchPerformed !== false ||
      dataset.notForPatientUse !== true || dataset.productionImport !== false ||
      dataset.claimSafe !== false || dataset.cases?.length !== demoSampleCount) return false;

  return dataset.cases.every(item => item.demoOnly === true && item.notForPatientUse === true &&
    item.productionImport === false && item.claimSafe === false &&
    /^DEMO-\d{3}$/.test(item.caseId) && Array.isArray(item.memberNames) && item.memberNames.length === 2 &&
    item.memberNames.every(name => /^SYNTHETIC-[A-Z]+$/.test(name)) &&
    allowedStatuses.has(item.status) && item.sources?.length === 0 &&
    !JSON.stringify(item).match(/https?:\/\/|www\./i));
}

module.exports = async function pairReview(request, response) {
  core.noStore(response);
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });

  const session = await core.identityFromRequest(request);
  if (!session) return response.status(401).json({ error: 'Sign in with an authorised DoctorAI staff account.' });
  if (!core.isAdmin(session)) return response.status(403).json({ error: 'DoctorAI staff admin access is required.' });

  const params = queryParams(request);
  const limit = validInteger(params.get('limit'), 25, maximumPageSize);
  const offset = validInteger(params.get('offset'), 0, demoSampleCount);
  const q = (params.get('q') || '').trim();
  const status = (params.get('status') || '').trim();
  if (limit === null || limit < 1 || offset === null || (q && (q.length < 2 || q.length > 100)) || (status && !allowedStatuses.has(status))) {
    return response.status(400).json({ error: 'Search parameters are invalid.' });
  }

  try {
    // This fixture contains four fictional UI states only. It is deliberately unrelated to the private research ledger.
    const dataset = require('../../server-src/staff/pair-review-demo.v1.json');
    if (!isSyntheticDemo(dataset)) throw new Error('Synthetic pair review demo contract mismatch.');

    const query = q.toLocaleLowerCase('en-NZ');
    const filtered = dataset.cases.filter(item => {
      if (status && item.status !== status) return false;
      if (!query) return true;
      return item.searchText.includes(query);
    });
    const cases = filtered.slice(offset, offset + limit).map(({ searchText, ...item }) => item);
    return response.status(200).json({
      metadata: { ...dataset.metadata, filteredCount: filtered.length, pageSize: limit, offset },
      statusCounts: dataset.statusCounts,
      pageCount: Math.ceil(filtered.length / limit),
      cases
    });
  } catch {
    return response.status(503).json({ error: 'The synthetic preview is temporarily unavailable.' });
  }
};
