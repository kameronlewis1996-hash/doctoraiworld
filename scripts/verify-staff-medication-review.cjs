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
const api = fs.readFileSync(path.join(root, 'api/staff/medication-review.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'staff-review.css'), 'utf8');

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
  assert.match(html, /Sign in through Health Hub/);
  assert.match(html, /staff-review\.css\?v=1/);
  assert.match(html, /staff-review\.js\?v=1/);
  assert.match(html, /staff-medication-tests\.css\?v=1/);
  assert.match(html, /staff-medication-tests\.js\?v=2/);
  assert.match(medicationTests, /querySelector\('#staff-tools-panel'\) \|\| content/);
  assert.match(medicationTests, /observe\(workspace, \{ attributes: true, attributeFilter: \['hidden'\] \}\)/);
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
  assert.match(html, /id="staff-content" hidden/);

  console.log('Staff medication review passed: 405/401/403/200 access gates, no-store response, admin-only tabs, display-only fixtures, and keyboard navigation.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
