"use client";
/**
 * Browser fetch helper for StayShare APIs. Automatically refreshes the access token once on 401
 * (refresh-token rotation) and unwraps `{ data }` / throws `ApiClientError` with a friendly message.
 */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const opts: RequestInit = {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  };
  let res = await fetch(url, opts);
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    if (await refresh()) res = await fetch(url, opts);
  }
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiClientError(res.status, err.code ?? "ERROR", err.message ?? `Request failed (${res.status})`, err.details);
  }
  return (body?.data ?? body) as T;
}

export async function uploadFile(file: File, purpose: string): Promise<{ id: string; url: string; fileName: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", purpose);
  return apiFetch("/api/uploads", { method: "POST", body: fd });
}

/** Paise ↔ rupee helpers for form inputs */
export const toPaise = (rupees: string | number) => Math.round(Number(rupees || 0) * 100);
export const toRupeeInput = (paise: number | null | undefined) => (paise == null ? "" : String(paise / 100));
