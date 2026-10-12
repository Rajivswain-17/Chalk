import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { visualizeRequestSchema } from "../validators/visualize";
import { resolveVisualization } from "../services/visualize.service";
import { requireAuth, requireCsrf } from "../middleware/auth";
import { env } from "../lib/env";

const router = Router();
// Generous cap outside production so local dev/refresh flows never hit 429;
// keep the strict 10/hour budget in production.
const hourlyLimit = env.NODE_ENV === "production" ? 10 : 250;
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: hourlyLimit, standardHeaders: "draft-7", legacyHeaders: false });

router.post("/", limiter, requireAuth, requireCsrf, async (req, res) => {
  const body = visualizeRequestSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid prompt" }); return; }
  try {
    const result = await resolveVisualization(body.data.prompt);
    if ("status" in result) {
      // A successful no-match: HTTP 200, never an error, never cached.
      res.json(result);
      return;
    }
    res.json({ steps: result.steps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Visualization failed";
    const statusProp = (err as Error & { status?: number }).status;
    // SCENE_* first: scene failures also carry status 502, so the generic 502
    // branch below would otherwise swallow them and report VISUAL_INVALID
    // (found in Task 4 review).
    if (message.startsWith("SCENE_")) {
      res.status(502).json({ error: "SCENE_INVALID" });
      return;
    }
    if (statusProp === 502 || message === "VISUAL_INVALID") {
      res.status(502).json({ error: "VISUAL_INVALID" });
      return;
    }
    if (err instanceof Error && (/timeout|abort/i.test(message) || /timeout|abort/i.test(err.name))) {
      res.status(503).json({ error: "VISUAL_TIMEOUT" });
      return;
    }
    res.status(statusProp ?? 500).json({ error: message });
  }
});

export default router;
