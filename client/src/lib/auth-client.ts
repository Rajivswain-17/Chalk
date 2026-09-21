// Chalk credentialed fetch — React-free so api.ts and hooks can share it.
// Every request carries cookies (session lives in httpOnly chalk_at/chalk_rt).
// Mutations attach the double-submit CSRF header from the readable cookie.
// 401s trigger one silent refresh + retry; refresh failure broadcasts
// "chalk:auth-lost" for the AuthProvider (avoids a React import cycle here).

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const AUTH_LOST_EVENT = "chalk:auth-lost";

/** Read a non-httpOnly cookie (chalk_csrf). Null on server / when absent. */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

interface ApiFetchOptions extends RequestInit {
  /** Attach x-csrf-token (POST/PUT/PATCH/DELETE under cookie auth). */
  csrf?: boolean;
  /** Set false for the refresh call itself (prevents retry recursion). */
  retryOnAuthLost?: boolean;
}

function isAuthRequired(res: Response): boolean {
  return res.status === 401;
}

/**
 * Proactively renew the session (SSE reconnect path). The access cookie dies
 * every 15 minutes while long renders stream for much longer — EventSource
 * retries automatically, but only a fresh cookie makes the retry succeed.
 * Fire-and-forget safe: resolves false when there is nothing to renew.
 */
/** POST /api/auth/refresh with CSRF. True when the session was renewed. */
async function tryRefresh(): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    const csrf = getCookie("chalk_csrf");
    if (csrf) headers["x-csrf-token"] = csrf;
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Proactively renew the session (SSE reconnect path). The access cookie dies
 * every 15 minutes while long renders stream for much longer — EventSource
 * retries automatically, but only a fresh cookie makes the retry succeed.
 * Fire-and-forget safe: resolves false when there is nothing to renew.
 */
export function refreshSessionNow(): Promise<boolean> {
  return tryRefresh();
}

/**
 * fetch() with cookies, optional CSRF, and one silent refresh+retry.
 * Throws Error(detail) on HTTP failure — callers surface err.message in UI.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { csrf, retryOnAuthLost = true, headers, ...init } = options;
  const merged: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };
  if (csrf) {
    const token = getCookie("chalk_csrf");
    if (token) merged["x-csrf-token"] = token;
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: merged,
  });

  if (isAuthRequired(res) && retryOnAuthLost) {
    if (await tryRefresh()) {
      // Refresh rotates the CSRF token with the session — re-read it, or the
      // retry sends the stale header and dies on CSRF_FAILED despite renewal.
      if (csrf) {
        const rotated = getCookie("chalk_csrf");
        if (rotated) merged["x-csrf-token"] = rotated;
        else delete merged["x-csrf-token"];
      }
      res = await fetch(`${API_URL}${path}`, {
        ...init,
        credentials: "include",
        headers: merged,
      });
    } else {
      // Session is dead everywhere — tell the provider to drop local state.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_LOST_EVENT));
      }
    }
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // Non-JSON body — keep the status fallback.
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  // 204/empty (logout ok:true has JSON; guard anyway for void endpoints).
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
