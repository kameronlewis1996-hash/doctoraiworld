type StoreFactory<T> = (scope: string, medicationAckKey: string) => T;

/** Resolve encrypted local health storage from the verified, stable account ID. */
export function createAccountPrivateStateStoreResolver<T>({
  digestSubject,
  medicationAckKeyForDigest,
  createStore,
}: {
  digestSubject: (subject: string) => Promise<string>;
  medicationAckKeyForDigest: (digest: string) => string;
  createStore: StoreFactory<T>;
}) {
  const stores = new Map<string, T>();

  return async function privateStateStoreForAccount(subject: string) {
    const normalizedSubject = String(subject || "").trim();
    if (!normalizedSubject) throw new Error("DoctorAI could not identify the signed-in account.");

    const digest = String(await digestSubject(normalizedSubject) || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("DoctorAI could not prepare private account storage.");

    const scope = `account-${digest}`;
    const medicationAckKey = medicationAckKeyForDigest(digest);
    if (!stores.has(scope)) stores.set(scope, createStore(scope, medicationAckKey));
    return { scope, medicationAckKey, store: stores.get(scope)! };
  };
}
