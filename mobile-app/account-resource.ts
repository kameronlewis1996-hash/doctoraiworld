export class SessionExpiredError extends Error {
  constructor() { super("Your secure sign-in has expired. Please sign in again."); }
}

type Resource = { ok: boolean; status: number; payload: any };
type Requester = (path: string) => Promise<Resource>;

export async function requestAccountResource(api: string, path: string, token: string, { method = "GET", timeoutMs = 6000, expectedSub = "", fetchImpl = fetch }: {
  method?: string;
  timeoutMs?: number;
  expectedSub?: string;
  fetchImpl?: typeof fetch;
} = {}): Promise<Resource> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = (async () => {
      const expectedSubject = String(expectedSub || "").trim();
      const headers = {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(expectedSubject ? { "x-doctorai-expected-sub": expectedSubject } : {}),
      };
      // Mobile bearer sessions must not inherit a same-origin browser cookie
      // when the app is shown in a web preview. That cookie could belong to a
      // different DoctorAI account than the mobile token.
      const response = await fetchImpl(`${api}${path}`, { method, headers, credentials: "omit", signal: controller.signal });
      const payload = await response.json().catch(error => {
        if (response.status === 401 || response.status === 403) return {};
        throw error;
      });
      return { ok: response.ok, status: response.status, payload };
    })();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("DoctorAI account sync timed out. Your saved device entries remain available.")); }, timeoutMs);
    });
    return await Promise.race([request, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadAccountResources(request: Requester) {
  const identity = await request("/api/auth/google");
  if (identity.status === 401 || identity.status === 403) throw new SessionExpiredError();
  if (!identity.ok || !identity.payload?.user?.email) throw new Error("DoctorAI could not check your sign-in. Your saved device entries remain available.");
  const unavailable: Resource = { ok: false, status: 0, payload: {} };
  const [entitlement, cloud] = await Promise.all([
    request("/api/stripe/entitlement").catch(() => unavailable),
    request("/api/health/state").catch(() => unavailable),
  ]);
  return { user: identity.payload.user, entitlement: entitlement.ok ? entitlement.payload : { active: false }, cloud };
}
