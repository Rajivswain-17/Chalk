// Chalk — cookie sessions: short JWT access + rotating opaque refresh + CSRF.
// Transport recap: EventSource and <video>/hls.js cannot send Authorization
// headers, so both tokens ride httpOnly cookies (SameSite=Lax works because
// :3000→:3001 is same-site on localhost; cross-site deploys need SameSite=None
// + Secure — see cookieFlags). CSRF double-submit covers cookie ambient authority.

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env";

const DEV_JWT_SECRET = "dev-only-jwt-secret-change-me";

/** Fail closed: production must never sign tokens with the dev placeholder. */
if (env.NODE_ENV === "production" && env.JWT_SECRET === DEV_JWT_SECRET) {
  throw new Error("JWT_SECRET must be set to a strong random value in production");
}

export const ACCESS_COOKIE = "chalk_at";
export const REFRESH_COOKIE = "chalk_rt";
export const CSRF_COOKIE = "chalk_csrf"; // readable (double-submit), NOT httpOnly.
const CSRF_HEADER = "x-csrf-token";

const ACCESS_TTL_SECONDS = 15 * 60; // 15 min — stolen access tokens die fast.
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — rotation bounds it.

function cookieFlags(): Pick<
  CookieOptions,
  "httpOnly" | "secure" | "sameSite" | "path"
> {
  return {
    httpOnly: true,
    // Secure cookies are dropped over http, so dev (http://localhost) must
    // leave this false; production (https) must set it or sessions leak.
    secure: env.NODE_ENV === "production",
    sameSite: "lax", // Sent on top-level OAuth GET callbacks + same-site API.
    path: "/",
  };
}

/** Sign a 15-minute access JWT. Payload is minimal (sub only) by design. */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: ACCESS_TTL_SECONDS,
  });
}

/** Verify an access JWT. Returns userId or null (expired/forged → re-auth). */
export function verifyAccessToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Mint an opaque refresh token + its sha256 row hash (raw never hits the DB). */
export function newRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex"); // 256-bit, unguessable.
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

/** Hash a presented refresh token for DB lookup (same function as minting). */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a CSRF token for the readable double-submit cookie. */
export function newCsrfToken(): string {
  return randomBytes(24).toString("hex");
}

/** Write the full session cookie trio after login/signup/refresh/OAuth. */
export function setSessionCookies(
  res: Response,
  input: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const base = cookieFlags();
  res.cookie(ACCESS_COOKIE, input.accessToken, {
    ...base,
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, input.refreshToken, {
    ...base,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
  // Readable by design: the SPA echoes it back as x-csrf-token on mutations.
  res.cookie(CSRF_COOKIE, input.csrfToken, {
    secure: base.secure,
    sameSite: base.sameSite,
    path: "/",
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

/** Clear all session cookies (logout + OAuth abort paths). */
export function clearSessionCookies(res: Response): void {
  const base = cookieFlags();
  res.clearCookie(ACCESS_COOKIE, { ...base });
  res.clearCookie(REFRESH_COOKIE, { ...base });
  res.clearCookie(CSRF_COOKIE, {
    secure: base.secure,
    sameSite: base.sameSite,
    path: "/",
  });
}

/**
 * Double-submit CSRF check for cookie-authed mutations. Compares the readable
 * cookie against the x-csrf-token header with timingSafeEqual (length-mismatch
 * short-circuits to false — never throws). Safe cross-site GETs skip this.
 */
export function hasValidCsrf(req: Request): boolean {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (typeof cookie !== "string" || typeof header !== "string") return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export { CSRF_HEADER, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS };
