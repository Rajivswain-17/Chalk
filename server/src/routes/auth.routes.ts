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

// Credential brute-force boundary: 20 attempts/hour/IP per endpoint is generous
// for humans, useless for password sprays (plus bcrypt cost 12 per attempt).
const credentialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

router.post("/signup", credentialLimiter, signupHandler);
router.post("/login", credentialLimiter, loginHandler);
router.post("/logout", requireCsrf, logoutHandler);
router.post("/refresh", requireCsrf, refreshHandler);
router.get("/me", requireAuth, meHandler);
router.get("/providers", providersHandler);
router.get("/oauth/:provider", oauthStartHandler);
router.get("/oauth/:provider/callback", oauthCallbackHandler);

export default router;
