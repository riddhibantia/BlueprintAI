const RAW_API = (process.env.NEXT_PUBLIC_API || "http://localhost:8000").trim().replace(/\/$/, "");
export const API = RAW_API.startsWith("http://") || RAW_API.startsWith("https://") ? RAW_API : "http://localhost:8000";

export type ApiError = Error & { status?: number };

function toApiError(status: number, bodyText: string): ApiError {
  let message = bodyText.slice(0, 300) || `Request failed (${status})`;
  try {
    const parsed = JSON.parse(bodyText);
    const detail = (parsed as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail) message = detail.slice(0, 300);
    else if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: unknown } | undefined;
      if (first && typeof first.msg === "string") message = first.msg.slice(0, 300);
    }
  } catch { /* non-JSON body: keep truncated text */ }
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
}

/** Session lives in an httpOnly cookie (set by /auth/login|register).
 *  JS can never read the token — every request just carries credentials. */
async function req(path: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const { signal: _ignored, ...rest } = init;
    void _ignored;
    const res = await fetch(`${API}${path}`, { ...rest, credentials: "include", signal: ctrl.signal });
    if (res.status === 401 && !path.startsWith("/auth/")) {
      window.location.href = "/dashboard";
      throw new Error("Session expired — please log in again.");
    }
    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("Request timed out — try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

type JsonRecord = Record<string, unknown>;

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const { body, headers, ...rest } = opts;
  // Accept objects (preferred) or pre-stringified JSON (legacy callers) — never double-encode.
  const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  const res = await req(path, {
    ...rest,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(headers || {}) },
    body: payload,
  });
  if (!res.ok) throw toApiError(res.status, await res.text());
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

/** Multipart upload (knowledge documents). */
export async function apiForm<T = any>(path: string, form: FormData): Promise<T> {
  const res = await req(path, { method: "POST", body: form });
  if (!res.ok) throw toApiError(res.status, await res.text());
  return res.json() as Promise<T>;
}

/** Authenticated file download (exports). */
export async function apiDownload(path: string, filename: string, json: boolean) {
  const res = await req(path);
  if (!res.ok) throw toApiError(res.status, await res.text());
  const blob = json
    ? new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" })
    : await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Current session user, or null. */
export async function me(): Promise<JsonRecord | null> {
  const res = await req("/auth/me");
  if (!res.ok) return null;
  return res.json() as Promise<JsonRecord>;
}

export async function logout() {
  await req("/auth/logout", { method: "POST" });
  window.location.href = "/dashboard";
}
