import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  generateVideo,
  getVideoStatus,
  streamEvents,
} from "../controllers/video.controller";

const router = Router();

// Generation triggers paid providers and heavy rendering, so even the first
// unauthenticated prototype needs a conservative per-IP abuse boundary.
const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

router.post("/generate", generationLimiter, generateVideo);
router.get("/:videoId/status", getVideoStatus);
router.get("/:jobId/events", streamEvents);

export default router;
