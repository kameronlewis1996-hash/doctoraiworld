import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { requestAccountResource, loadAccountResources, SessionExpiredError } from "../account-resource.ts";
import { createHealthDataCoordinator } from "../health-data-coordinator.ts";
import { createPickerCache } from "../picker-cache.ts";
import { createPrivateStateStore } from "../private-state-store.ts";
import { createAccountPrivateStateStoreResolver } from "../account-private-state.ts";
let passed = 0;
async function verify(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const resource = (status, payload = {}) => ({ ok: status >= 200 && status < 300, status, payload });

await verify("session expiry is distinguished from a temporary server outage", async () => {
  await assert.rejects(loadAccountResources(async () => resource(401)), SessionExpiredError);
  await assert.rejects(loadAccountResources(async () => resource(500)), error => !(error instanceof SessionExpiredError));
});
await verify("optional resource outages preserve an authenticated identity", async () => {
  const result = await loadAccountResources(async path => {
    if (path === "/api/auth/google") return resource(200, { user: { email: "fictional@example.test" } });
    throw new Error("Synthetic outage");
  });
  assert.equal(result.user.email, "fictional@example.test");
  assert.equal(result.entitlement.active, false);
  assert.equal(result.cloud.ok, false);
});
await verify("account token is sent in a header and invalid expiry JSON still expires", async () => {
  let seen;
  const result = await requestAccountResource("https://example.test", "/api/auth/google", "synthetic-token", {
    fetchImpl: async (url, options) => { seen = { url, options }; return { status: 401, ok: false, json: async () => { throw new Error("HTML response"); } }; },
  });
  assert.equal(seen.url.includes("synthetic-token"), false);
  assert.equal(seen.options.headers.Authorization, "Bearer synthetic-token");
  assert.equal(result.status, 401);
});
await verify("Account B cloud 404 cannot expose Account A local state after sign-out", async () => {
  const data = new Map();
  const storage = {
    get: async key => data.get(key) ?? null,
    set: async (key, value) => { data.set(key, value); },
    remove: async key => { data.delete(key); },
  };
  let generation = 0;
  const resolveAccountStore = createAccountPrivateStateStoreResolver({
    digestSubject: async subject => createHash("sha256").update(subject).digest("hex"),
    medicationAckKeyForDigest: digest => `doctorai-medication-alert-ack-v1-${digest}`,
    createStore: (scope, medicationAckKey) => createPrivateStateStore({
      storage,
      manifestKey: `doctorai-mobile-private-state-v1-${scope}`,
      chunkPrefix: `doctorai-mobile-private-state-chunk-${scope}-`,
      createGeneration: () => (++generation).toString(16).padStart(32, "0"),
      auxiliaryKeys: [medicationAckKey],
    }),
  });
  const legacyDeviceStore = createPrivateStateStore({
    storage,
    manifestKey: "doctorai-mobile-private-state-v1",
    chunkPrefix: "doctorai-mobile-private-state-chunk-",
    createGeneration: () => (++generation).toString(16).padStart(32, "0"),
  });
  await legacyDeviceStore.write({ medications: [{ name: "fictional unassigned device medicine" }] }, 5);

  const accountA = await resolveAccountStore("verified-google-sub-A");
  await accountA.store.write({ medications: [{ name: "fictional account A medicine" }] }, 10);
  const accountB = await resolveAccountStore("verified-google-sub-B");
  assert.notEqual(accountA.scope, accountB.scope);

  let sent;
  const cloud = await requestAccountResource("https://example.test", "/api/health/state", "synthetic-account-B-token", {
    expectedSub: "verified-google-sub-B",
    fetchImpl: async (_url, options) => {
      sent = options;
      return { status: 404, ok: false, json: async () => ({ code: "not_found" }) };
    },
  });
  assert.equal(cloud.status, 404);
  assert.equal(sent.headers["x-doctorai-expected-sub"], "verified-google-sub-B");
  assert.equal(sent.credentials, "omit");
  const localB = await accountB.store.read();
  assert.equal(localB, null);
  assert.equal(JSON.parse((await legacyDeviceStore.read()).raw).medications[0].name, "fictional unassigned device medicine");

  await accountB.store.write({ medications: [{ name: "fictional account B medicine" }] }, 20);
  assert.equal((await resolveAccountStore("verified-google-sub-B")).store, accountB.store);
  assert.equal(JSON.parse((await accountA.store.read()).raw).medications[0].name, "fictional account A medicine");
  assert.equal(JSON.parse((await accountB.store.read()).raw).medications[0].name, "fictional account B medicine");
});
await verify("account request deadline bounds both network and body stalls", async () => {
  for (const fetchImpl of [async () => new Promise(() => {}), async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) })]) {
    await assert.rejects(requestAccountResource("https://example.test", "/api/auth/google", "synthetic-token", { timeoutMs: 15, fetchImpl }), /timed out/);
  }
});
await verify("deletion invalidates old callbacks and waits for an upload", async () => {
  const jobs = createHealthDataCoordinator();
  const previous = jobs.epoch();
  let finish;
  const upload = jobs.track(new Promise(resolve => { finish = resolve; }));
  jobs.invalidate();
  assert.equal(jobs.isCurrent(previous), false);
  assert.equal(jobs.isCurrent(jobs.epoch()), true);
  assert.equal(await jobs.waitForPending(15), false);
  finish(); await upload;
  assert.equal(await jobs.waitForPending(15), true);
});
await verify("failed jobs settle without trapping a future deletion", async () => {
  const jobs = createHealthDataCoordinator();
  await assert.rejects(jobs.track(Promise.reject(new Error("Synthetic failure"))));
  assert.equal(await jobs.waitForPending(15), true);
});
await verify("picker cleanup never removes original documents or external URIs", async () => {
  const removed = [];
  const cache = createPickerCache("file:///app/cache/", async uri => { removed.push(uri); });
  await cache.removeCopy("content://documents/original.pdf");
  await cache.removeCopy("file:///app/documents/original.pdf");
  await cache.removeCopy("file:///app/cache/DocumentPicker/../original.pdf");
  await cache.removeCopy("file:///app/cache/DocumentPicker/%2e%2e/original.pdf");
  assert.equal(removed.length, 0);
  await cache.removeCopy("file:///app/cache/DocumentPicker/synthetic.pdf");
  assert.equal(removed.length, 1);
  await cache.clear();
  assert.deepEqual(removed.slice(1), ["file:///app/cache/ImagePicker/", "file:///app/cache/DocumentPicker/"]);
});
console.log(`${passed} account, deletion and cache scenarios passed; no live account or health data used.`);
