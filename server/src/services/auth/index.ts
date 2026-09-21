// Chalk — auth business logic (framework-free; controllers handle HTTP).
// Credentials: bcrypt verify → session trio. Refresh: single-use rotation with
// reuse detection (presenting a revoked token revokes the whole family).
// OAuth: manual code exchange (no passport) for Google + GitHub.

import { randomBytes } from "crypto";
import {
  canonicalEmail,
  createRefreshToken,
  createUser,
  getOAuthAccount,
  getRefreshToken,
  getUserByEmail,
  getUserById,
  linkOAuthAccount,
  revokeAllUserRefreshTokens,
  revokeRefreshToken,
  toPublicUser,
} from "../../repository";
import { hashPassword, verifyPassword } from "../../lib/password";
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  hashRefreshToken,
  newCsrfToken,
  newRefreshToken,
  signAccessToken,
} from "../../lib/session";
import { env } from "../../lib/env";
import type { OAuthProvider } from "../../validators";

export interface SessionTrio {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Issue access + refresh (persisted row) + CSRF for a fresh session. */
async function issueSession(userId: string): Promise<SessionTrio> {
  const { token, tokenHash } = newRefreshToken();
  await createRefreshToken({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return {
    accessToken: signAccessToken(userId),
    refreshToken: token,
    csrfToken: newCsrfToken(),
  };
}

/** POST /api/auth/signup — create credential user (409 on duplicate email). */
export async function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: ReturnType<typeof toPublicUser>; session: SessionTrio }> {
  const email = canonicalEmail(input.email);
  if (await getUserByEmail(email)) {
    throw new AuthError(409, "An account with this email already exists");
  }
  const user = await createUser({
    name: input.name.trim(),
    email,
    passwordHash: await hashPassword(input.password),
  });
  return { user: toPublicUser(user), session: await issueSession(user.id) };
}

/** POST /api/auth/login — verify password (401, same message either way). */
export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: ReturnType<typeof toPublicUser>; session: SessionTrio }> {
  const user = await getUserByEmail(input.email);
  // Single generic message: distinguishes neither unknown email nor bad
  // password (prevents account enumeration), including OAuth-only accounts
  // whose passwordHash is null.
  if (!user || !(await verifyPassword(input.password, user.passwordHash ?? ""))) {
    throw new AuthError(401, "Invalid email or password");
  }
  return { user: toPublicUser(user), session: await issueSession(user.id) };
}

/**
 * POST /api/auth/refresh — rotate the presenting token.
 * Valid → successor trio (parent revoked). Revoked reuse → family-wide revoke
 * (theft response) + 401. Missing/expired/unknown → plain 401.
 */
export async function refreshSession(
  presented: string | undefined,
): Promise<SessionTrio> {
  if (!presented) throw new AuthError(401, "AUTH_REQUIRED");
  const row = await getRefreshToken(hashRefreshToken(presented));
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    throw new AuthError(401, "AUTH_REQUIRED");
  }
  if (row.revokedAt) {
    // Already-used token presented again: assume theft, kill every session.
    await revokeAllUserRefreshTokens(row.userId);
    throw new AuthError(401, "SESSION_REVOKED");
  }
  await revokeRefreshToken(row.id); // Single-use: parent dies here.
  return issueSession(row.userId);
}

/** POST /api/auth/logout — revoke the presenting token (idempotent). */
export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const row = await getRefreshToken(hashRefreshToken(presented));
  if (row && !row.revokedAt) await revokeRefreshToken(row.id);
}

/** GET /api/auth/me payload (401 handled by requireAuth, not here). */
export async function getProfile(userId: string) {
  const user = await getUserById(userId);
  if (!user) throw new AuthError(401, "AUTH_REQUIRED");
  return toPublicUser(user);
}

// --- OAuth (manual, no passport) --------------------------------------------

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 min — short replay window.

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return provider === "google"
    ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    : Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

/** Public capability map so the UI renders only working provider buttons. */
export function authProviders(): Record<OAuthProvider, boolean> {
  return { google: isProviderConfigured("google"), github: isProviderConfigured("github") };
}

function callbackUrl(provider: OAuthProvider): string {
  return `${env.APP_URL}/api/auth/oauth/${provider}/callback`;
}

/** Mint an opaque state token; the controller stores/verifies it via cookie. */
export function newOAuthState(): string {
  return randomBytes(24).toString("hex");
}

/** Authorization redirect URL for the provider (throws 503 if unconfigured). */
export function oauthStartUrl(provider: OAuthProvider, state: string): string {
  if (!isProviderConfigured(provider)) {
    throw new AuthError(503, `${provider} login is not configured`);
  }
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl(provider),
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: callbackUrl(provider),
    scope: "user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

interface ProviderProfile {
  providerUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

async function postForm(url: string, body: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new AuthError(502, "OAuth token exchange failed");
  return res.json() as Promise<unknown>;
}

/** Exchange the callback code for a normalized profile (throws AuthError). */
async function fetchOAuthProfile(
  provider: OAuthProvider,
  code: string,
): Promise<ProviderProfile> {
  if (provider === "google") {
    const token = (await postForm("https://oauth2.googleapis.com/token", {
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(provider),
      grant_type: "authorization_code",
    })) as { access_token?: string };
    if (!token.access_token) throw new AuthError(502, "Google did not return a token");
    const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!me.ok) throw new AuthError(502, "Google userinfo request failed");
    const info = (await me.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!info.sub) throw new AuthError(502, "Google profile is incomplete");
    return {
      providerUserId: info.sub,
      email: info.email_verified ? (info.email ?? null) : null,
      name: info.name ?? null,
      avatarUrl: info.picture ?? null,
    };
  }
  const token = (await postForm("https://github.com/login/oauth/access_token", {
    code,
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    redirect_uri: callbackUrl(provider),
  })) as { access_token?: string; error_description?: string };
  if (!token.access_token) {
    throw new AuthError(502, token.error_description ?? "GitHub did not return a token");
  }
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "chalk-auth", // GitHub rejects API calls without a UA.
  };
  const [userRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);
  if (!userRes.ok) throw new AuthError(502, "GitHub profile request failed");
  const gh = (await userRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string;
    email?: string | null;
  };
  if (gh.id === undefined) throw new AuthError(502, "GitHub profile is incomplete");
  // Public email is often null — the dedicated endpoint lists verified ones.
  let email: string | null = gh.email ?? null;
  if (!email && emailsRes.ok) {
    const emails = (await emailsRes.json()) as {
      email: string;
      primary: boolean;
      verified: boolean;
    }[];
    email =
      emails.find((e) => e.primary && e.verified)?.email ??
      emails.find((e) => e.verified)?.email ??
      null;
  }
  return {
    providerUserId: String(gh.id),
    email,
    name: gh.name ?? gh.login ?? null,
    avatarUrl: gh.avatar_url ?? null,
  };
}

/**
 * OAuth callback: link-or-create the user, then issue a session.
 * Match order: provider identity → verified email → brand-new user.
 * Throws when the provider yields no email and nothing matches (we cannot
 * create a credential-less, email-less account — user must expose an email).
 */
export async function oauthCallback(
  provider: OAuthProvider,
  code: string,
): Promise<{ user: ReturnType<typeof toPublicUser>; session: SessionTrio }> {
  const profile = await fetchOAuthProfile(provider, code);

  const linked = await getOAuthAccount(provider, profile.providerUserId);
  if (linked) {
    const user = await getUserById(linked.userId);
    if (!user) throw new AuthError(401, "Account no longer exists");
    return { user: toPublicUser(user), session: await issueSession(user.id) };
  }

  if (profile.email) {
    const email = canonicalEmail(profile.email);
    const existing = await getUserByEmail(email);
    if (existing) {
      await linkOAuthAccount({
        userId: existing.id,
        provider,
        providerUserId: profile.providerUserId,
        email,
      });
      return { user: toPublicUser(existing), session: await issueSession(existing.id) };
    }
    const created = await createUser({
      name: (profile.name ?? email.split("@")[0]).slice(0, 100),
      email,
      passwordHash: null, // OAuth-only until the user sets a password (no v1 flow).
      avatarUrl: profile.avatarUrl,
    });
    await linkOAuthAccount({
      userId: created.id,
      provider,
      providerUserId: profile.providerUserId,
      email,
    });
    return { user: toPublicUser(created), session: await issueSession(created.id) };
  }

  throw new AuthError(
    409,
    "No verified email from provider — expose one contributor or sign up with email",
  );
}

export { OAUTH_STATE_TTL_MS, ACCESS_TTL_SECONDS };
