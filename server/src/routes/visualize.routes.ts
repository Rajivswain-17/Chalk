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
    const status = (err as Error & { status?: number }).status ?? 503;
    const message = err instanceof Error ? err.message : "Visualization failed";
    res.status(status).json({ error: status === 502 ? "VISUAL_INVALID" : status === 503 && message !== "VISUAL_INVALID" ? "VISUAL_TIMEOUT" : message });
  }
});

export default router;
