// Chalk — request auth: access-cookie verifier + CSRF gate + HLS ownership.
// requireAuth answers 401 AUTH_REQUIRED (never redirects — the SPA owns UX).
// requireCsrf runs AFTER requireAuth on cookie-authed mutations only.

import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { hasValidCsrf, verifyAccessToken, ACCESS_COOKIE } from "../lib/session";
import { videos } from "../repository/schema/videos";

/** Express user payload. Carries the id only — rows are re-read per request. */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Reject requests without a valid access cookie. Sets req.userId on success. */
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

/** Reject cookie-authed mutations missing the double-submit CSRF header. */
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
 */
export async function requireVideoOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const videoId = req.path.split("/").filter(Boolean)[0];
  if (!videoId || !req.userId) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  try {
    const [row] = await db
      .select({ userId: videos.userId })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);
    if (!row || row.userId !== req.userId) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Could not load video" });
  }
}
