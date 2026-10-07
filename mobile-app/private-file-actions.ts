type FileAdapter = {
  prepare: (directory: string) => Promise<void>;
  download: (url: string, file: string, headers: Record<string, string>) => Promise<{ status: number; contentType: string }>;
  write: (file: string, value: string) => Promise<void>;
  contentUri: (file: string) => Promise<string>;
  remove: (directory: string) => Promise<void>;
};

const supportedTypes = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const healthFields = ["medications", "appointments", "providers", "measurements", "symptoms", "timeline", "documents", "tasks", "messages", "profile", "memoryEnabled", "memoryDetails", "largeText", "highContrast", "reduceMotion"];

export function createPrivateFileActions({ api, cacheRoot, files, createId, view, share }: {
  api: string;
  cacheRoot: string;
  files: FileAdapter;
  createId: () => string;
  view: (uri: string, type: string) => Promise<void>;
  share: (file: string, type: string) => Promise<void>;
}) {
  let tail: Promise<void> = Promise.resolve();
  function enqueue<T>(action: () => Promise<T>) {
    const result = tail.then(action);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async function temporary<T>(action: (directory: string) => Promise<T>): Promise<T> {
    const id = createId();
    if (!/^[a-f0-9-]{32,36}$/.test(id)) throw new Error("A temporary document could not be prepared.");
    const directory = `${cacheRoot}${id}/`;
    try {
      await files.prepare(directory);
      return await action(directory);
    } finally {
      try { await files.remove(directory); }
      catch { throw new Error("The temporary device file could not be removed. Retry clearing device data from Settings."); }
    }
  }
  return {
    openDocument: (document: { id: string; title: string }, token: string | null) => enqueue(async () => {
      if (!token) throw new Error("Sign in before opening a private document.");
      if (!document.id) throw new Error("Choose a saved document to open.");
      await temporary(async directory => {
        const extension = /\.(pdf|jpe?g|png|webp|docx?|txt)$/i.exec(document.title)?.[1]?.toLowerCase() || "bin";
        const file = `${directory}document.${extension}`;
        const result = await files.download(`${api}/api/documents?id=${encodeURIComponent(document.id)}&download=1`, file, { Authorization: `Bearer ${token}`, accept: "*/*" });
        if (result.status !== 200) throw new Error(result.status === 404 ? "This private document could not be found. You can remove the old entry from this device." : "This private document is unavailable. Check your connection and sign-in, then retry.");
        const type = result.contentType.split(";")[0].trim().toLowerCase();
        if (!supportedTypes.has(type)) throw new Error("DoctorAI could not verify the downloaded file type.");
        await view(await files.contentUri(file), type);
      });
    }),
    exportHealth: async (state: Record<string, unknown>) => {
      const health = Object.fromEntries(healthFields.filter(key => key in state).map(key => [key, state[key]]));
      const payload = JSON.stringify({
        format: "doctorai-health-export-v1",
        exportedAt: new Date().toISOString(),
        notice: "Includes entries saved in this app. Document files are separate. Copies outside DoctorAI are not removed by account or health-data deletion.",
        health,
      }, null, 2);
      return enqueue(() => temporary(async directory => {
        const file = `${directory}doctorai-health-export.json`;
        await files.write(file, payload);
        await share(file, "application/json");
      }));
    },
    clearCache: () => enqueue(() => files.remove(cacheRoot)),
  };
}
