import assert from "node:assert/strict";
import { createPrivateFileActions } from "../private-file-actions.ts";

function fixture() {
  const calls = [], written = new Map();
  let status = 200, type = "application/pdf", failView = false, failShare = false, failCleanup = false, id = 0;
  const actions = createPrivateFileActions({
    api: "https://example.test",
    cacheRoot: "cache://doctorai-private-exports/",
    createId: () => (++id).toString(16).padStart(32, "0"),
    files: {
      prepare: async directory => { calls.push(["prepare", directory]); },
      download: async (url, file, headers) => { calls.push(["download", url, file, headers]); return { status, contentType: type }; },
      write: async (file, text) => { written.set(file, text); calls.push(["write", file]); },
      contentUri: async file => `content://viewer/${file.split("/").pop()}`,
      remove: async directory => { calls.push(["remove", directory]); if (failCleanup) throw new Error("Injected cleanup failure"); },
    },
    view: async (uri, mime) => { calls.push(["view", uri, mime]); if (failView) throw new Error("Injected missing viewer"); },
    share: async (file, mime) => { calls.push(["share", file, mime]); if (failShare) throw new Error("Injected share failure"); },
  });
  return { actions, calls, written, response: (code, mime = "application/pdf") => { status = code; type = mime; }, failures: (view = false, share = false, cleanup = false) => { failView = view; failShare = share; failCleanup = cleanup; } };
}
let passed = 0;
async function verify(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

await verify("opening a document authenticates only the HTTPS request", async () => {
  const f = fixture();
  await f.actions.openDocument({ id: "fictional/id", title: "fictional.pdf" }, "synthetic-token");
  const download = f.calls.find(call => call[0] === "download");
  assert.equal(download[1], "https://example.test/api/documents?id=fictional%2Fid&download=1");
  assert.equal(download[3].Authorization, "Bearer synthetic-token");
  assert.equal(JSON.stringify(f.calls.filter(call => call[0] === "view")).includes("synthetic-token"), false);
  assert.equal(f.calls.at(-1)[0], "remove");
});

await verify("signed-out access performs no download or cache operation", async () => {
  const f = fixture();
  await assert.rejects(f.actions.openDocument({ id: "fictional", title: "fictional.pdf" }, null), /Sign in/);
  assert.equal(f.calls.length, 0);
});

await verify("failed downloads remove their temporary copy without launching a viewer", async () => {
  const f = fixture();
  f.response(404);
  await assert.rejects(f.actions.openDocument({ id: "fictional", title: "fictional.pdf" }, "synthetic-token"), /not be found/);
  assert.equal(f.calls.some(call => call[0] === "view"), false);
  assert.equal(f.calls.at(-1)[0], "remove");
});

await verify("a server error page cannot be passed to a document viewer", async () => {
  const f = fixture();
  f.response(200, "text/html");
  await assert.rejects(f.actions.openDocument({ id: "fictional", title: "fictional.pdf" }, "synthetic-token"), /file type/);
  assert.equal(f.calls.some(call => call[0] === "view"), false);
  assert.equal(f.calls.at(-1)[0], "remove");
});

await verify("viewer failure still removes the temporary document", async () => {
  const f = fixture();
  f.failures(true);
  await assert.rejects(f.actions.openDocument({ id: "fictional", title: "fictional.pdf" }, "synthetic-token"));
  assert.equal(f.calls.at(-1)[0], "remove");
});

await verify("health exports contain saved entries and exclude session credentials", async () => {
  const f = fixture();
  await f.actions.exportHealth({ profile: { name: "Fictional Person" }, messages: [], accessToken: "synthetic-token", account: { email: "fictional@example.test" }, subscription: {} });
  const payload = JSON.parse([...f.written.values()][0]);
  assert.equal(payload.format, "doctorai-health-export-v1");
  assert.deepEqual(Object.keys(payload.health).sort(), ["messages", "profile"]);
  assert.equal(JSON.stringify(payload).includes("synthetic-token"), false);
  assert.equal(f.calls.at(-1)[0], "remove");
});

await verify("canceled or failed sharing removes the unencrypted export", async () => {
  const f = fixture();
  f.failures(false, true);
  await assert.rejects(f.actions.exportHealth({ messages: [] }));
  assert.equal(f.calls.at(-1)[0], "remove");
});

await verify("failed cleanup is reported and can be retried at startup or deletion", async () => {
  const f = fixture();
  f.failures(false, false, true);
  await assert.rejects(f.actions.exportHealth({ messages: [] }), /could not be removed/);
  f.failures();
  await f.actions.clearCache();
  assert.deepEqual(f.calls.at(-1), ["remove", "cache://doctorai-private-exports/"]);
});

console.log(`Verified ${passed} private-file scenarios using synthetic adapters.`);
