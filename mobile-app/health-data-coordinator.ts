// A cleared record must not be repopulated by callbacks from an earlier record.
export function createHealthDataCoordinator() {
  let epoch = 0;
  const pending = new Set<Promise<unknown>>();
  return {
    epoch: () => epoch,
    isCurrent: (value: number) => value === epoch,
    invalidate: () => ++epoch,
    track: <T>(job: Promise<T>): Promise<T> => {
      pending.add(job);
      void job.then(() => pending.delete(job), () => pending.delete(job));
      return job;
    },
    waitForPending: async (timeoutMs = 30000): Promise<boolean> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.allSettled([...pending]).then(() => true),
          new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
    },
  };
}
