"use client";

// AuthProvider — global auth state: user profile, boot loading, login/signup/
// logout actions, silent background refresh (via apiFetch), and auth-lost
// broadcast handling (refresh failed anywhere → signed out everywhere here).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_LOST_EVENT,
  apiFetch,
} from "@/lib/auth-client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True only during the initial /me boot (not during actions). */
  booting: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  signup: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);

  // Boot: who owns these cookies? 401 (no session) is normal → anonymous.
  useEffect(() => {
    let alive = true;
    apiFetch<AuthUser>("/api/auth/me")
      .then((me) => {
        if (alive) setUser(me);
      })
      .catch(() => {
        if (alive) setUser(null); // Anonymous — login page handles the rest.
      })
      .finally(() => {
        if (alive) setBooting(false);
      });
    const onLost = () => setUser(null);
    window.addEventListener(AUTH_LOST_EVENT, onLost);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_LOST_EVENT, onLost);
    };
  }, []);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const me = await apiFetch<AuthUser>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        retryOnAuthLost: false, // No session exists yet — nothing to refresh.
      });
      setUser(me);
    },
    [],
  );

  const signup = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const me = await apiFetch<AuthUser>("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        retryOnAuthLost: false,
      });
      setUser(me);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        csrf: true,
        retryOnAuthLost: false,
      });
    } finally {
      setUser(null); // Local state clears even if the revoke call failed.
    }
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, signup, logout }),
    [user, booting, login, signup, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Consume auth state. Throws outside <AuthProvider> (fail fast on wiring bugs). */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
