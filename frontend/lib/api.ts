export const API = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    window.location.href = "/dashboard";
  }
}

export async function api(path: string, opts: any = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    logout();
    throw new Error("Session expired — please log in again.");
  }
  if (!res.ok) throw new Error(await res.text());
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

/** Multipart upload (knowledge documents). */
export async function apiForm(path: string, form: FormData) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: form,
  });
  if (res.status === 401) {
    logout();
    throw new Error("Session expired — please log in again.");
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function isAuthed() {
  return !!token();
}
