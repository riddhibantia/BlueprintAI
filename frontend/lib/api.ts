export const API = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

/** Session lives in an httpOnly cookie (set by /auth/login|register).
 *  JS can never read the token — every request just carries credentials. */
async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, credentials: "include" });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    window.location.href = "/dashboard";
    throw new Error("Session expired — please log in again.");
  }
  return res;
}

export async function api(path: string, opts: any = {}) {
  const res = await req(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

/** Multipart upload (knowledge documents). */
export async function apiForm(path: string, form: FormData) {
  const res = await req(path, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Authenticated file download (exports). */
export async function apiDownload(path: string, filename: string, json: boolean) {
  const res = await req(path);
  if (!res.ok) throw new Error(await res.text());
  const blob = json
    ? new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" })
    : await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Current session user, or null. */
export async function me() {
  const res = await req("/auth/me");
  if (!res.ok) return null;
  return res.json();
}

export async function logout() {
  await req("/auth/logout", { method: "POST" });
  window.location.href = "/dashboard";
}
