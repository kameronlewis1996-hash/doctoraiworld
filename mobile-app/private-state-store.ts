type Adapter = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

type Manifest = {
  v: 1 | 2;
  count: number;
  updatedAt: number;
  generation?: string;
};

type Journal =
  | { operation: "write"; previous: Manifest | null; next: Manifest }
  | { operation: "clear"; previous: Manifest | null };

/** Commit a new set of encrypted chunks by switching one manifest key last.
 * A journal makes interrupted writes and requested deletions retryable on launch.
 * The adapter is Expo SecureStore in the app; tests use isolated memory storage.
 */
export function createPrivateStateStore({ storage, manifestKey, chunkPrefix, createGeneration, chunkBytes = 1800, maxChunks = 200, auxiliaryKeys = [] }: {
  storage: Adapter;
  manifestKey: string;
  chunkPrefix: string;
  createGeneration: () => string;
  chunkBytes?: number;
  maxChunks?: number;
  auxiliaryKeys?: string[];
}) {
  const journalKey = `${manifestKey}-pending-v2`;
  let tail: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  function manifest(value: unknown): Manifest | null {
    if (value === null) return null;
    if (!value || typeof value !== "object") throw new Error("Invalid device record manifest.");
    const source = value as Record<string, unknown>;
    const count = Number(source.count);
    const updatedAt = Number(source.updatedAt || 0);
    if (!Number.isInteger(count) || count < 1 || count > maxChunks || !Number.isFinite(updatedAt) || updatedAt < 0) {
      throw new Error("Invalid device record manifest.");
    }
    if (source.v === 2 && typeof source.generation === "string" && /^[a-f0-9]{32}$/.test(source.generation)) {
      return { v: 2, count, updatedAt, generation: source.generation };
    }
    if (source.v === 1 || source.v === undefined) return { v: 1, count, updatedAt };
    throw new Error("Invalid device record manifest.");
  }

  const parseManifest = (raw: string | null) => raw === null ? null : manifest(JSON.parse(raw));
  const readManifest = async () => parseManifest(await storage.get(manifestKey));
  const chunkKey = (record: Manifest, index: number) => record.v === 2
    ? `${chunkPrefix}v2-${record.generation}-${index}`
    : `${chunkPrefix}${index}`;
  const same = (a: Manifest | null, b: Manifest | null) => a === null || b === null
    ? a === b
    : a.v === b.v && a.count === b.count && a.updatedAt === b.updatedAt && a.generation === b.generation;

  async function removeChunks(record: Manifest | null) {
    if (!record) return;
    const removed = await Promise.allSettled(Array.from({ length: record.count }, (_, index) => storage.remove(chunkKey(record, index))));
    if (removed.some(result => result.status === "rejected")) throw new Error("Device record cleanup is incomplete.");
  }

  async function recover() {
    const raw = await storage.get(journalKey);
    if (raw === null) return;
    const source = JSON.parse(raw);
    const previous = manifest(source.previous);
    const current = await readManifest();
    if (source.operation === "clear") {
      if (current !== null && !same(current, previous)) throw new Error("Device deletion could not be verified.");
      await removeChunks(previous);
      const auxiliary = await Promise.allSettled(auxiliaryKeys.map(key => storage.remove(key)));
      if (auxiliary.some(result => result.status === "rejected")) throw new Error("Device record cleanup is incomplete.");
      await storage.remove(manifestKey);
    } else if (source.operation === "write") {
      const next = manifest(source.next);
      if (!next || next.v !== 2) throw new Error("Invalid device save journal.");
      if (same(current, next)) {
        await removeChunks(previous);
      } else if (same(current, previous)) {
        await removeChunks(next);
      } else {
        throw new Error("Device save could not be verified.");
      }
    } else {
      throw new Error("Invalid device save journal.");
    }
    await storage.remove(journalKey);
  }

  function split(raw: string) {
    const chunks: string[] = [];
    let chunk = "", bytes = 0;
    // Count UTF-8 bytes and keep surrogate pairs together. A character-count
    // limit could exceed native SecureStore limits for non-ASCII notes.
    for (const character of raw) {
      const point = character.codePointAt(0)!;
      const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bytes + size > chunkBytes && chunk) {
        chunks.push(chunk);
        chunk = "";
        bytes = 0;
      }
      chunk += character;
      bytes += size;
    }
    if (chunk || !chunks.length) chunks.push(chunk);
    if (chunks.length > maxChunks) throw new Error("The device record exceeds secure storage capacity.");
    return chunks;
  }

  return {
    read: () => enqueue(async () => {
      await recover();
      const current = await readManifest();
      if (!current) return null;
      const chunks = await Promise.all(Array.from({ length: current.count }, (_, index) => storage.get(chunkKey(current, index))));
      if (chunks.some(chunk => chunk === null)) throw new Error("The saved device record is incomplete.");
      const raw = chunks.join("");
      JSON.parse(raw);
      return { raw, updatedAt: current.updatedAt };
    }),
    write: async (value: unknown, updatedAt: number) => {
      // Capture the requested snapshot before it waits behind another save.
      const raw = JSON.stringify(value);
      if (typeof raw !== "string") throw new Error("The device record is invalid.");
      const chunks = split(raw);
      return enqueue(async () => {
        await recover();
        const previous = await readManifest();
        const generation = createGeneration();
        if (!/^[a-f0-9]{32}$/.test(generation) || generation === previous?.generation) throw new Error("A new device save could not be started.");
        const next: Manifest = { v: 2, generation, count: chunks.length, updatedAt: Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : Date.now() };
        const journal: Journal = { operation: "write", previous, next };
        await storage.set(journalKey, JSON.stringify(journal));
        try {
          // Wait for every chunk operation, including after one fails, before
          // recovery can remove staging keys. Late writes cannot recreate them.
          const written = await Promise.allSettled(chunks.map((chunk, index) => storage.set(chunkKey(next, index), chunk)));
          if (written.some(result => result.status === "rejected")) throw new Error("The device record could not be saved.");
          await storage.set(manifestKey, JSON.stringify(next));
        } catch (error) {
          await recover().catch(() => {});
          throw error;
        }
        // The record is committed. Keep the journal for retry if removing an
        // older generation fails; never report committed data as unsaved.
        await recover().catch(() => {});
      });
    },
    clear: () => enqueue(async () => {
      await recover();
      const previous = await readManifest();
      const journal: Journal = { operation: "clear", previous };
      await storage.set(journalKey, JSON.stringify(journal));
      await recover();
    }),
    readAuxiliary: (key: string) => enqueue(async () => {
      if (!auxiliaryKeys.includes(key)) throw new Error("Unknown device setting.");
      await recover();
      return storage.get(key);
    }),
    writeAuxiliary: (key: string, value: string) => enqueue(async () => {
      if (!auxiliaryKeys.includes(key)) throw new Error("Unknown device setting.");
      await recover();
      await storage.set(key, value);
    }),
  };
}
