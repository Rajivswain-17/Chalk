import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { visualizeRequestSchema } from "../validators/visualize";
import { generateVisualization } from "../services/visualize.service";
import { requireAuth, requireCsrf } from "../middleware/auth";

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

router.post("/", limiter, requireAuth, requireCsrf, async (req, res) => {
  const body = visualizeRequestSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid prompt" }); return; }
  try {
    const steps = await generateVisualization(body.data.prompt);
    res.json({ steps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Visualization failed";
    const statusProp = (err as Error & { status?: number }).status;
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
