'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const core = require('../server-src/_lib/doctorai-core.cjs');
const handler = require('../api/staff/medication-review.js');
const html = fs.readFileSync(path.join(root, 'staff.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'staff-review.js'), 'utf8');
const medicationTests = fs.readFileSync(path.join(root, 'staff-medication-tests.js'), 'utf8');
const ideasScript = fs.readFileSync(path.join(root, 'staff-ideas.js'), 'utf8');
const ideasStyles = fs.readFileSync(path.join(root, 'staff-ideas.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/staff/medication-review.js'), 'utf8');
const pairReviewApi = fs.readFileSync(path.join(root, 'api/staff/pair-review.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'staff-review.css'), 'utf8');
const pairReviewScript = fs.readFileSync(path.join(root, 'staff-pair-review.js'), 'utf8');
const pairReviewStyles = fs.readFileSync(path.join(root, 'staff-pair-review.css'), 'utf8');
const vercelIgnore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function request(session, admin, method = 'GET') {
  core.identityFromRequest = async () => session;
  core.isAdmin = () => admin;
  const result = response();
  await handler({ method }, result);
  assert.equal(result.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  return result;
}

async function main() {
  const method = await request(null, false, 'POST');
  assert.equal(method.statusCode, 405);
  assert.equal(method.body?.packet, undefined);

  const anonymous = await request(null, false);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.body?.packet, undefined);

  const nonAdmin = await request({ email: 'member@example.test' }, false);
  assert.equal(nonAdmin.statusCode, 403);
  assert.equal(nonAdmin.body?.packet, undefined);

  const admin = await request({ email: 'admin@example.test' }, true);
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.packet.candidate.status, 'Excluded from active checks');
  assert.equal(admin.body.packet.release.inactiveCandidateCount, 1269);
  assert.match(admin.body.packet.candidate.source.url, /^https:\/\/medsafe\.govt\.nz\//);
  assert.equal(admin.body.packet.catalogue.safeguards.some(text => text.includes('until the person confirms')), true);
  assert.equal(admin.body.packet.release.active.length, 3);

  assert.match(html, /role="tablist"[^>]*data-staff-tabs/);
  assert.match(html, /role="tab" id="staff-medication-review-tab"/);
  assert.match(html, /role="tabpanel" id="staff-review-panel"[^>]*hidden/);
  for (const [id, label] of [
    ['staff-tools-tab', 'Site tools'],
    ['staff-medication-review-tab', 'Medication review'],
    ['staff-pair-review-tab', 'Pair research'],
    ['staff-medication-tests-tab', 'Testing lab'],
    ['staff-ideas-tab', 'Ideas lab']
  ]) {
    assert.match(html, new RegExp(`role="tab" id="${id}"[^>]*>${label}</button>`));
  }
  for (const id of ['staff-tools-panel', 'staff-review-panel', 'staff-pair-review-panel', 'staff-medication-tests-panel', 'staff-ideas-panel']) {
    assert.match(html, new RegExp(`role="tabpanel" id="${id}"[^>]*`));
  }
  assert.match(html, /data-staff-hash="#medication-tests"/);
  assert.match(html, /data-staff-hash="#pair-review"/);
  assert.match(html, /data-staff-hash="#ideas-lab"/);
  assert.match(html, /Sign in through Health Hub/);
  assert.match(html, /staff-review\.css\?v=2/);
  assert.match(html, /staff-review\.js\?v=3/);
  assert.match(html, /staff-pair-review\.css\?v=1/);
  assert.match(html, /staff-pair-review\.js\?v=1/);
  assert.match(html, /staff-medication-tests\.css\?v=1/);
  assert.match(html, /staff-medication-tests\.js\?v=3/);
  assert.match(html, /staff-ideas\.css\?v=4/);
  assert.match(html, /staff-ideas\.js\?v=2/);
  assert.match(medicationTests, /querySelector\('#staff-medication-tests-panel'\)/);
  assert.match(medicationTests, /scenarioId/);
  assert.match(medicationTests, /credentials:\s*'same-origin'/);
  assert.match(medicationTests, /cache:\s*'no-store'/);
  assert.doesNotMatch(medicationTests, /localStorage|sessionStorage|review-workspace|catalogue\.v\d+\.json/);
  assert.match(html, /Saved only in this browser, not uploaded or synced/);
  assert.match(html, /staff-idea-filter/);
  assert.match(html, /Clear saved ideas/);
  assert.match(html, /staffAdminEmail/);
  assert.match(ideasScript, /doctorai-staff-ideas-v1:/);
  assert.match(ideasScript, /staffaccessgranted/);
  assert.match(ideasScript, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(ideasScript, /localStorage\.getItem/);
  assert.match(ideasScript, /localStorage\.setItem/);
  assert.match(ideasScript, /localStorage\.removeItem/);
  assert.match(ideasScript, /No ideas.*sync|not synced to other devices/s);
  assert.match(ideasScript, /textContent/);
  assert.doesNotMatch(ideasScript, /fetch\s*\(|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|review-workspace/);
  assert.match(ideasScript, /staffContent\.hidden \|\| !staffAccessVerified/);
  assert.match(ideasScript, /maximumIdeas = 30/);
  assert.match(ideasStyles, /\.staff-idea-form/);
  assert.match(html, /:focus-visible/);
  assert.match(vercelIgnore, /(?:^|\r?\n)review-workspace\/?(?:\r?\n|$)/);
  assert.doesNotMatch(html, /(?:src|href)=["'][^"']*review-workspace/);
  assert.doesNotMatch(JSON.stringify([...(vercelConfig.redirects || []), ...(vercelConfig.rewrites || [])]), /review-workspace/);
  assert.match(script, /ArrowRight/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /Home/);
  assert.match(script, /End/);
  assert.match(script, /credentials:\s*'same-origin'/);
  assert.match(script, /cache:\s*'no-store'/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|health-hub|\/api\/medication\/safety/);
  assert.match(styles, /\.staff-review-loading\[hidden\]\s*\{\s*display:\s*none\s*\}/);
  assert.match(styles, /\.review-state-output\[data-severity=review\] \.review-state-dot\s*\{\s*background:\s*#c66a0a\s*\}/);
  assert.match(styles, /\.review-state-output\[data-severity=high\] \.review-state-dot\s*\{\s*border-radius:\s*3px;\s*background:\s*#bd3030\s*\}/);
  assert.match(api, /identityFromRequest/);
  assert.match(api, /core\.isAdmin\(session\)/);
  assert.match(api, /core\.noStore\(response\)/);
  assert.match(pairReviewApi, /identityFromRequest/);
  assert.match(pairReviewApi, /core\.isAdmin\(session\)/);
  assert.match(pairReviewApi, /core\.noStore\(response\)/);
  assert.match(pairReviewApi, /require\('\.\.\/\.\.\/server-src\/staff\/pair-review-demo\.v1\.json'\)/);
  assert.match(pairReviewApi, /dataset\.demoOnly !== true/);
  assert.match(pairReviewApi, /dataset\.researchPerformed !== false/);
  assert.match(pairReviewApi, /metadata: \{ \.\.\.dataset\.metadata, filteredCount/);
  assert.match(pairReviewApi, /maximumPageSize = 50/);
  assert.match(pairReviewScript, /credentials:\s*'same-origin'/);
  assert.match(pairReviewScript, /cache:\s*'no-store'/);
  assert.match(pairReviewScript, /textContent/);
  assert.doesNotMatch(pairReviewScript, /innerHTML|localStorage|sessionStorage|review-workspace/);
  assert.match(pairReviewStyles, /@media\(max-width:700px\)/);
  assert.match(pairReviewStyles, /prefers-reduced-motion/);
  assert.match(html, /Synthetic preview only[\s\S]*no research findings or source material are included/);
  assert.match(html, /id="staff-content" hidden/);

  await require('./verify-staff-ideas.cjs')();

  console.log('Staff review workspaces passed: 405/401/403/200 access gates, five keyboard tabs, synthetic-only pair preview contract, fixed fictional tests, account-scoped browser ideas, and Vercel exclusion contract.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
