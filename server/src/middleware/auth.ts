// Chalk — request auth: access-cookie verifier + CSRF gate + HLS ownership.
// requireAuth answers 401 AUTH_REQUIRED (never redirects — the SPA owns UX).
// requireCsrf runs AFTER requireAuth on cookie-authed mutations only.
//
// Why cookies (not Authorization headers)? The browser primitives the client
// leans on — EventSource for live updates and <video>/hls.js for playback —
// cannot attach custom headers, so the 15-minute access JWT rides an httpOnly
// cookie instead. Cookie transport makes requests "ambiently" authenticated,
// which is exactly what CSRF attacks exploit; requireCsrf is the guard for that.

import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { hasValidCsrf, verifyAccessToken, ACCESS_COOKIE } from "../lib/session";
import { videos } from "../repository/schema/videos";

/**
 * Express user payload. Carries the id only — rows are re-read per request.
 *
 * Augments Express's Request type so downstream handlers can read `req.userId`
 * after requireAuth has run. Only the id is attached (never roles/profile):
 * anything authorization-sensitive is re-read from the DB per request so a
 * stale or tampered token cannot smuggle extra privileges in the request.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Reject requests without a valid access cookie. Sets req.userId on success.
 *
 * Flow:
 *   1. Read the access JWT from the httpOnly cookie (optional-chained because
 *      cookie-parser may not have populated req.cookies on malformed requests).
 *   2. Verify signature + expiry via verifyAccessToken, which returns `null`
 *      for any failure (expired, forged, wrong secret) rather than throwing.
 *   3. On failure respond 401 AUTH_REQUIRED. Deliberately NOT a redirect: the
 *      API is stateless, and the SPA is responsible for sending the user to
 *      /login and for attempting a refresh — a 302 here would corrupt fetch().
 *   4. On success stash the id for downstream handlers and continue.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE];
  const userId = typeof token === "string" ? verifyAccessToken(token) : null;
  if (!userId) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }
  req.userId = userId;
  next();
}

/**
 * Reject cookie-authed mutations missing the double-submit CSRF header.
 *
 * The browser automatically attaches cookies to cross-site requests, so a
 * malicious page could trigger state-changing calls with the user's session.
 * Mitigation is the "double submit" pattern: an attacker cannot read our
 * readable (non-httpOnly) CSRF cookie due to the same-origin policy, so a
 * forged request cannot reproduce its value in the x-csrf-token header.
 * `hasValidCsrf` performs the constant-time comparison.
 *
 * Mount this only on mutating routes (POST/PUT/PATCH/DELETE) and AFTER
 * requireAuth, so unauthenticated callers get 401 before any 403 noise. Safe
 * cross-site GETs (e.g. OAuth callbacks) skip it by design.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!hasValidCsrf(req)) {
    res.status(403).json({ error: "CSRF_FAILED" });
    return;
  }
  next();
}

/**
 * HLS segment guard for app.use("/hls", …). Extracts the videoId from
 * /hls/:videoId/… and 404s unless the row belongs to the caller (404, not
 * 403, so ids are not oracle-testable). Runs per segment — cheap indexed read.
 *
 * HLS playback fetches a playlist then a stream of .ts segment files, so this
 * middleware fires many times per video; the ownership check is therefore kept
 * to a single indexed primary-key read. Return 404 (not 403) so an attacker
 * cannot distinguish "exists but not yours" from "does not exist" and probe
 * for valid video ids. Requires requireAuth to have run first to populate
 * req.userId.
 */
export async function requireVideoOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Mounted under "/hls", req.path is relative to that mount and looks like
  // "/<videoId>/segment0.ts". Split on "/", drop empty leading segment, take id.
  const videoId = req.path.split("/").filter(Boolean)[0];
  if (!videoId || !req.userId) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  try {
    // Fetch only the owner column — no need to hydrate the full video row.
    const [row] = await db
      .select({ userId: videos.userId })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);
    // Missing row and wrong owner collapse to the same 404 (see above).
    if (!row || row.userId !== req.userId) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    next();
  } catch {
    // DB/connectivity failure is a genuine server error, not an auth failure,
    // so surface 500 rather than masking it as 404.
    res.status(500).json({ error: "Could not load video" });
  }
}
