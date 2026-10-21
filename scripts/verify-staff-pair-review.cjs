'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const core = require('../server-src/_lib/doctorai-core.cjs');
const handler = require('../api/staff/pair-review.js');
const html = fs.readFileSync(path.join(root, 'staff.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'staff-pair-review.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'api/staff/pair-review.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const dataPath = path.join(root, 'server-src/staff/pair-review-demo.v1.json');
const dataRequire = '../../server-src/staff/pair-review-demo.v1.json';

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function run() {
  const originalIdentity = core.identityFromRequest;
  const originalIsAdmin = core.isAdmin;
  const originalLoad = Module._load;
  let datasetLoads = 0;
  Module._load = function (request, parent, isMain) {
    if (request === dataRequire) datasetLoads++;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    async function call(session, admin, url = '/api/staff/pair-review', method = 'GET') {
      core.identityFromRequest = async () => session;
      core.isAdmin = () => admin;
      const result = response();
      await handler({ method, url }, result);
      assert.equal(result.headers['cache-control'], 'no-store, max-age=0');
      assert.equal(result.headers['x-content-type-options'], 'nosniff');
      assert.equal(result.headers['referrer-policy'], 'no-referrer');
      return result;
    }

    const method = await call(null, false, '/api/staff/pair-review', 'POST');
    assert.equal(method.statusCode, 405);
    assert.equal(method.body?.cases, undefined);
    assert.equal(datasetLoads, 0, 'method rejection must not load the demo fixture');

    const anonymous = await call(null, false);
    assert.equal(anonymous.statusCode, 401);
    assert.equal(anonymous.body?.cases, undefined);
    assert.equal(datasetLoads, 0, 'anonymous request must not load the demo fixture');

    const nonAdmin = await call({ email: 'member@example.test' }, false);
    assert.equal(nonAdmin.statusCode, 403);
    assert.equal(nonAdmin.body?.cases, undefined);
    assert.equal(datasetLoads, 0, 'non-admin request must not load the demo fixture');

    const firstPage = await call({ email: 'admin@example.test' }, true, '/api/staff/pair-review?limit=3&offset=1');
    assert.equal(firstPage.statusCode, 200);
    assert.equal(firstPage.body.cases.length, 3);
    assert.equal(firstPage.body.metadata.caseCount, 4);
    assert.equal(firstPage.body.metadata.filteredCount, 4);
    assert.equal(firstPage.body.metadata.offset, 1);
    assert.equal(firstPage.body.metadata.demoOnly, true);
    assert.equal(firstPage.body.cases.every(item => item.demoOnly && item.notForPatientUse && item.productionImport === false && item.claimSafe === false), true);
    assert.equal(firstPage.body.cases.some(item => item.searchText !== undefined), false);
    assert.equal(datasetLoads, 1, 'first authorized read loads the synthetic fixture');

    const filtered = await call({ email: 'admin@example.test' }, true, '/api/staff/pair-review?q=synthetic-alpha&status=evidence_candidate&limit=10');
    assert.equal(filtered.statusCode, 200);
    assert.equal(filtered.body.cases.length, 1);
    assert.equal(filtered.body.cases[0].memberNames[0], 'SYNTHETIC-ALPHA');
    assert.equal(filtered.body.metadata.filteredCount, 1);

    for (const invalid of [
      '/api/staff/pair-review?limit=51',
      '/api/staff/pair-review?offset=5',
      '/api/staff/pair-review?status=reviewed',
      '/api/staff/pair-review?q=x'
    ]) {
      const result = await call({ email: 'admin@example.test' }, true, invalid);
      assert.equal(result.statusCode, 400, invalid);
      assert.equal(result.body?.cases, undefined, invalid);
    }

    assert.match(html, /role="tab" id="staff-pair-review-tab"[^>]*data-staff-hash="#pair-review"/);
    assert.match(html, /role="tabpanel" id="staff-pair-review-panel"[^>]*hidden/);
    assert.match(html, /Synthetic preview only[\s\S]*no research findings or source material are included/);
    assert.match(html, /private research ledger is not included/);
    assert.doesNotMatch(html, /warfarin|sulfamethoxazole|medsafe/i);
    assert.match(apiSource, /core\.identityFromRequest/);
    assert.match(apiSource, /core\.isAdmin\(session\)/);
    assert.match(apiSource, /core\.noStore\(response\)/);
    assert.match(apiSource, /demoOnly !== true/);
    assert.match(apiSource, /researchPerformed !== false/);
    assert.match(apiSource, /pair-review-demo\.v1\.json/);
    assert.match(script, /Synthetic preview loaded\. No research was performed\./);
    assert.match(script, /credentials:\s*'same-origin'/);
    assert.match(script, /cache:\s*'no-store'/);
    assert.doesNotMatch(script, /innerHTML|localStorage|sessionStorage|https?:\/\//);
    assert.ok((config.redirects || []).some(route => route.source === '/server-src/:path*' && route.destination === '/not-found'), 'server source must be statically blocked');

    const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(dataset.artifactType, 'synthetic_pair_review_demo');
    assert.equal(dataset.demoOnly, true);
    assert.equal(dataset.researchPerformed, false);
    assert.equal(dataset.cases.length, 4);
    assert.equal(Object.values(dataset.statusCounts).reduce((sum, count) => sum + count, 0), 4);
    assert.equal(dataset.notForPatientUse, true);
    assert.equal(dataset.productionImport, false);
    assert.equal(dataset.claimSafe, false);
    assert.ok(dataset.cases.every(item => item.memberNames.every(name => /^SYNTHETIC-[A-Z]+$/.test(name))));
    assert.ok(dataset.cases.every(item => item.sources.length === 0));
    assert.equal(JSON.stringify(dataset).match(/https?:\/\//i), null);
    console.log('PASS synthetic staff pair review: method/401/403 reject before fixture load; admin pagination/search and invalid parameters; four fictional states only; static source block and no-store contract.');
  } finally {
    core.identityFromRequest = originalIdentity;
    core.isAdmin = originalIsAdmin;
    Module._load = originalLoad;
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
