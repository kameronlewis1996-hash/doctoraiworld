import assert from "node:assert/strict";
import { createPrivateStateStore } from "../private-state-store.ts";

const manifestKey = "test-manifest";
const chunkPrefix = "test-chunk-";
const pendingKey = `${manifestKey}-pending-v2`;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function fixture(options = {}) {
  const data = new Map();
  let generation = 0;
  let setFault = () => false, removeFault = () => false, beforeSet = async () => {};
  const storage = {
    get: async key => data.get(key) ?? null,
    set: async (key, value) => {
      await beforeSet(key, value);
      if (setFault(key, value)) throw new Error("Injected write failure");
      data.set(key, value);
    },
    remove: async key => {
      if (removeFault(key)) throw new Error("Injected deletion failure");
      data.delete(key);
    },
  };
  return {
    data,
    store: () => createPrivateStateStore({ storage, manifestKey, chunkPrefix, createGeneration: () => (++generation).toString(16).padStart(32, "0"), ...options }),
    faults: (set = () => false, remove = () => false) => { setFault = set; removeFault = remove; },
    beforeSet: hook => { beforeSet = hook; },
    generation: () => generation,
  };
}
const read = async store => JSON.parse((await store.read()).raw);
let passed = 0;
async function verify(name, operation) {
  await operation();
  passed++;
  console.log(`PASS ${name}`);
}

await verify("existing records migrate without dropping their contents", async () => {
  const f = fixture();
  const original = { notes: ["fictional original"], messages: [] };
  const raw = JSON.stringify(original);
  f.data.set(manifestKey, JSON.stringify({ v: 1, count: 2, updatedAt: 10 }));
  f.data.set(`${chunkPrefix}0`, raw.slice(0, 20));
  f.data.set(`${chunkPrefix}1`, raw.slice(20));
  const store = f.store();
  assert.deepEqual(await read(store), original);
  await store.write({ ...original, notes: [...original.notes, "fictional next"] }, 20);
  assert.equal(JSON.parse(f.data.get(manifestKey)).v, 2);
  assert.equal(f.data.has(`${chunkPrefix}0`), false);
  assert.equal(f.data.has(`${chunkPrefix}1`), false);
  assert.equal((await read(store)).notes.length, 2);
});

await verify("Unicode round trips within native byte limits", async () => {
  const f = fixture(), store = f.store();
  const value = { notes: "漢字🙂ē".repeat(2000) };
  await store.write(value, 10);
  assert.deepEqual(await read(store), value);
  for (const [key, chunk] of f.data) if (key.startsWith(chunkPrefix)) assert.ok(Buffer.byteLength(chunk, "utf8") <= 1800);
});

await verify("a failed chunk write leaves the committed record intact", async () => {
  const f = fixture(), store = f.store();
  const original = { notes: "fictional saved note" };
  await store.write(original, 10);
  const before = new Map(f.data);
  f.faults(key => key.startsWith(chunkPrefix) && key.endsWith("-1"));
  await assert.rejects(store.write({ notes: "x".repeat(4000) }, 20));
  f.faults();
  assert.deepEqual(await read(store), original);
  assert.deepEqual(f.data, before);
});

await verify("a failed manifest commit leaves the previous snapshot readable", async () => {
  const f = fixture(), store = f.store();
  await store.write({ notes: "old" }, 10);
  const before = new Map(f.data);
  f.faults(key => key === manifestKey);
  await assert.rejects(store.write({ notes: "new" }, 20));
  f.faults();
  assert.deepEqual(await read(store), { notes: "old" });
  assert.deepEqual(f.data, before);
});

await verify("rapid saves cannot finish out of order", async () => {
  const f = fixture(), store = f.store();
  const entered = deferred(), resume = deferred();
  f.beforeSet(async key => { if (key.startsWith(chunkPrefix) && key.endsWith("-0") && f.generation() === 1) { entered.resolve(); await resume.promise; } });
  const first = store.write({ notes: "first" }, 10);
  await entered.promise;
  const last = store.write({ notes: "last" }, 20);
  await Promise.resolve();
  assert.equal(f.generation(), 1);
  resume.resolve();
  await Promise.all([first, last]);
  assert.deepEqual(await read(store), { notes: "last" });
});

await verify("deletion waits for an in-flight save and leaves no record", async () => {
  const f = fixture(), store = f.store();
  const entered = deferred(), resume = deferred();
  f.beforeSet(async key => { if (key.startsWith(chunkPrefix)) { entered.resolve(); await resume.promise; } });
  const writing = store.write({ notes: "fictional note" }, 10);
  await entered.promise;
  const clearing = store.clear();
  resume.resolve();
  await Promise.all([writing, clearing]);
  assert.equal(await store.read(), null);
  assert.equal(f.data.size, 0);
});

await verify("restart cleans an interrupted uncommitted generation", async () => {
  const f = fixture(), store = f.store();
  await store.write({ notes: "committed" }, 10);
  f.faults(key => key.startsWith(chunkPrefix) && key.endsWith("-1"), key => key.startsWith(chunkPrefix));
  await assert.rejects(store.write({ notes: "x".repeat(4000) }, 20));
  assert.equal(f.data.has(pendingKey), true);
  f.faults();
  assert.deepEqual(await read(f.store()), { notes: "committed" });
  assert.equal(f.data.has(pendingKey), false);
  assert.equal([...f.data.keys()].filter(key => key.startsWith(chunkPrefix)).length, 1);
});

await verify("restart retries old-generation cleanup after a committed save", async () => {
  const f = fixture(), store = f.store();
  await store.write({ notes: "old" }, 10);
  const oldChunk = [...f.data.keys()].find(key => key.startsWith(chunkPrefix));
  f.faults(() => false, key => key === oldChunk);
  await store.write({ notes: "new" }, 20);
  assert.equal(f.data.has(pendingKey), true);
  f.faults();
  assert.deepEqual(await read(f.store()), { notes: "new" });
  assert.equal(f.data.has(oldChunk), false);
  assert.equal(f.data.has(pendingKey), false);
});

await verify("restart completes an interrupted user-requested deletion", async () => {
  const f = fixture(), store = f.store();
  await store.write({ notes: "x".repeat(4000) }, 10);
  f.faults(() => false, key => key.startsWith(chunkPrefix) && key.endsWith("-1"));
  await assert.rejects(store.clear());
  assert.equal(f.data.has(pendingKey), true);
  f.faults();
  assert.equal(await f.store().read(), null);
  assert.equal(f.data.size, 0);
});

await verify("health-data deletion also removes queued medicine acknowledgements", async () => {
  const f = fixture({ auxiliaryKeys: ["test-medicine-ack"] }), store = f.store();
  const acknowledgement = store.writeAuxiliary("test-medicine-ack", "fictional medicine marker");
  const clearing = store.clear();
  await Promise.all([acknowledgement, clearing]);
  assert.equal(await store.readAuxiliary("test-medicine-ack"), null);
  assert.equal(f.data.size, 0);
  await assert.rejects(store.writeAuxiliary("unrelated-setting", "value"), /Unknown/);
});

await verify("capacity failure never writes an unreadable manifest", async () => {
  const f = fixture({ chunkBytes: 30, maxChunks: 2 }), store = f.store();
  await store.write({ notes: "old" }, 10);
  const before = new Map(f.data);
  await assert.rejects(store.write({ notes: "x".repeat(150) }, 20), /capacity/);
  assert.deepEqual(f.data, before);
  assert.deepEqual(await read(store), { notes: "old" });
});

await verify("missing chunks and invalid manifests produce a load error", async () => {
  const f = fixture(), store = f.store();
  f.data.set(manifestKey, JSON.stringify({ v: 1, count: 2, updatedAt: 10 }));
  f.data.set(`${chunkPrefix}0`, "{\"notes\":");
  const before = new Map(f.data);
  await assert.rejects(store.read(), /incomplete/);
  assert.deepEqual(f.data, before);
  f.data.set(manifestKey, "invalid-json");
  await assert.rejects(store.read());
  assert.equal(f.data.get(manifestKey), "invalid-json");
});

console.log(`Verified ${passed} device-persistence scenarios using isolated memory storage.`);
