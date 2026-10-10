// Chalk — auth routes. Session mutations (refresh/logout) carry requireCsrf;
// credential posts (signup/login) are CSRF-exempt — no ambient authority yet.
// OAuth start/callback are top-level GET navigations (state param, not CSRF).

import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  loginHandler,
  logoutHandler,
  meHandler,
  oauthCallbackHandler,
  oauthStartHandler,
  providersHandler,
  refreshHandler,
  signupHandler,
} from "../controllers/auth.controller";
import { requireAuth, requireCsrf } from "../middleware/auth";

const router = Router();

// Route tiers — they differ in HOW authority is established, which is what
// decides the middleware chain:
//   1. Credential posts (/signup, /login): no ambient authority exists yet, so
//      there is nothing for CSRF to protect. Rate limiting is the boundary.
//   2. Session mutations (/logout, /refresh): browser-attached cookies ARE
//      ambient authority, so both carry requireCsrf. They intentionally skip
//      requireAuth — they authenticate off the refresh cookie, which is exactly
//      the credential an expired access token cannot renew without. (Routes that
//      need an authenticated identity chain requireAuth first, so an anonymous
//      caller gets 401 before any 403 — see middleware/auth.ts.)
//   3. User-scoped reads (/me): requireAuth populates req.userId; GET is a safe
//      method, so no CSRF.
//   4. Public discovery/navigation (/providers, /oauth/*): no cookie is read and
//      nothing user-specific is returned.

// Credential brute-force boundary: 20 attempts/hour/IP per endpoint is generous
// for humans, useless for password sprays (plus bcrypt cost 12 per attempt).
// standardHeaders "draft-7" advertises RateLimit-* (including Retry-After) so
// the SPA can say "try again later" instead of showing a bare 429; legacyHeaders
// off so the older X-RateLimit-* pair is not emitted alongside them.
const credentialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Tier 1 — credential posts. CSRF-exempt by design; per-IP limited above.
router.post("/signup", credentialLimiter, signupHandler);
router.post("/login", credentialLimiter, loginHandler);

// Tier 2 — session mutations. CSRF-guarded, refresh-cookie authenticated.
router.post("/logout", requireCsrf, logoutHandler);
router.post("/refresh", requireCsrf, refreshHandler);

// Tier 3 — user-scoped read. requireAuth verifies the access cookie and sets
// req.userId, which meHandler reads (profile rows are re-read per request).
router.get("/me", requireAuth, meHandler);

// Tier 4 — public. /providers only reports which OAuth buttons exist, so it can
// be cached and hit before anyone is logged in.
router.get("/providers", providersHandler);

// Top-level OAuth navigations: the browser arrives here with a GET (full-page
// redirect to the provider and back), so mounting requireCsrf would be wrong —
// the anti-forgery control is the `state` value stashed by oauthStartHandler and
// checked on callback. `next` is validated same-origin there for the same reason.
router.get("/oauth/:provider", oauthStartHandler);
router.get("/oauth/:provider/callback", oauthCallbackHandler);

export default router;
