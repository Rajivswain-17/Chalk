// Chalk — auth controller (HTTP layer; logic lives in services/auth).
// Cookies set here are the session; JSON bodies carry only public profiles.

import type { Request, Response } from "express";
import { env } from "../lib/env";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from "../lib/session";
import {
  login,
  logout,
  oauthCallback,
  oauthStartUrl,
  authProviders,
  getProfile,
  newOAuthState,
  refreshSession,
  signup,
  AuthError,
  OAUTH_STATE_TTL_MS,
} from "../services/auth";
import {
  loginSchema,
  oauthProviderSchema,
  signupSchema,
} from "../validators";

const OAUTH_STATE_COOKIE = "chalk_oauth";

/** OAuth `next` targets must be same-origin paths (blocks open redirects). */
function safeNext(raw: unknown): string {
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw.slice(0, 200);
  }
  return "/generate";
}

function authFailure(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(`[auth] ${(err as Error).message}`);
  res.status(500).json({ error: "Authentication failed" });
}

/** POST /api/auth/signup — validate → create → session cookies + profile. */
export async function signupHandler(req: Request, res: Response): Promise<void> {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  try {
    const { user, session } = await signup(parsed.data);
    setSessionCookies(res, session);
    res.status(201).json(user);
  } catch (err) {
    authFailure(res, err);
  }
}

/** POST /api/auth/login — verify → session cookies + profile. */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  try {
    const { user, session } = await login(parsed.data);
    setSessionCookies(res, session);
    res.json(user);
  } catch (err) {
    authFailure(res, err);
  }
}

/** POST /api/auth/logout — revoke presenting refresh token + clear cookies. */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    await logout(req.cookies?.[REFRESH_COOKIE]);
  } finally {
    clearSessionCookies(res); // Cookie cleared even when DB revoke fails.
  }
  res.json({ ok: true });
}

/** POST /api/auth/refresh — rotate refresh token (CSRF-guarded at route). */
export async function refreshHandler(req: Request, res: Response): Promise<void> {
  try {
    const session = await refreshSession(req.cookies?.[REFRESH_COOKIE]);
    setSessionCookies(res, session);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) clearSessionCookies(res); // Dead session, drop it.
    authFailure(res, err);
  }
}

/** GET /api/auth/me — public profile for the access-cookie owner. */
export async function meHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json(await getProfile(req.userId as string));
  } catch (err) {
    authFailure(res, err);
  }
}

/** GET /api/auth/providers — which OAuth buttons the UI should render. */
export async function providersHandler(_req: Request, res: Response): Promise<void> {
  res.json(authProviders());
}

/**
 * GET /api/auth/oauth/:provider — stash state+next in a short cookie, then
 * 302 to the provider. `next` (post-login landing) is validated same-origin.
 */
export async function oauthStartHandler(req: Request, res: Response): Promise<void> {
  const parsed = oauthProviderSchema.safeParse(req.params.provider);
  if (!parsed.success) {
    res.status(404).json({ error: "Unknown provider" });
    return;
  }
  const state = newOAuthState();
  res.cookie(OAUTH_STATE_COOKIE, JSON.stringify({ state, next: safeNext(req.query.next) }), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_MS,
  });
  try {
    res.redirect(oauthStartUrl(parsed.data, state));
  } catch (err) {
    authFailure(res, err);
  }
}

/**
 * GET /api/auth/oauth/:provider/callback — verify state, link-or-create,
 * set cookies, 302 to the client landing. Failures redirect to /login?error=
 * (the browser — not the SPA — owns this navigation, so JSON is useless).
 */
export async function oauthCallbackHandler(req: Request, res: Response): Promise<void> {
  const fail = (code: string) =>
    res.redirect(`${env.CLIENT_URL}/login?error=${code}`);
  const parsed = oauthProviderSchema.safeParse(req.params.provider);
  if (!parsed.success) {
    res.status(404).json({ error: "Unknown provider" });
    return;
  }
  let stored: { state?: string; next?: string } = {};
  try {
    stored = JSON.parse(req.cookies?.[OAUTH_STATE_COOKIE] ?? "{}");
  } catch {
    return fail("oauth");
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state || state !== stored.state) return fail("oauth");
  try {
    const { session } = await oauthCallback(parsed.data, code);
    setSessionCookies(res, session);
    res.redirect(`${env.CLIENT_URL}${safeNext(stored.next)}`);
  } catch (err) {
    console.error(`[auth] oauth callback: ${(err as Error).message}`);
    return fail(err instanceof AuthError && err.status === 409 ? "no_email" : "oauth");
  }
}
