import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import videoRoutes from "./routes/video.routes";
import { env } from "./lib/env";
import { checkDatabase, closeDatabase } from "./lib/db";
import { redisConnection } from "./lib/redis";
import { sseManager } from "./lib/sse";
import { sseEventSchema } from "./validators";
import { videoQueue } from "./services/queue";

const app = express();
const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by CORS"));
    },
  }),
);
app.use(helmet());
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "64kb" }));

app.get("/health/live", (_req, res) => {
  res.json({ status: "ok", service: "chalk-server", timestamp: new Date().toISOString() });
});

async function readiness(_req: Request, res: Response): Promise<void> {
  try {
    await Promise.all([checkDatabase(), redisConnection.ping()]);
    res.json({ status: "ready", service: "chalk-server", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
app.get("/health", readiness);
app.get("/health/ready", readiness);

const hlsDirectory = path.join(env.OUTPUT_DIR, "hls");
app.use(
  "/hls",
  express.static(hlsDirectory, {
    fallthrough: false,
    setHeaders(response, filePath) {
      if (filePath.endsWith(".m3u8")) {
        response.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        response.setHeader("Cache-Control", "no-store");
      } else if (filePath.endsWith(".ts")) {
        response.setHeader("Content-Type", "video/mp2t");
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);
app.use("/api/videos", videoRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[http] ${error.message}`);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

// Worker processes publish to job:{jobId}; each API replica forwards validated
// events into only its own connected SSE sockets.
const subscriber = redisConnection.duplicate();
subscriber.psubscribe("job:*").catch((error: Error) => {
  console.error(`[sse] subscription failed: ${error.message}`);
});
subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
  const jobId = channel.slice("job:".length);
  try {
    const event = sseEventSchema.parse(JSON.parse(message));
    if (event.jobId !== jobId) {
      console.warn(`[sse] discarded event whose payload did not match ${channel}`);
      return;
    }
    sseManager.emit(jobId, event);
  } catch (error) {
    console.warn(`[sse] discarded invalid event: ${(error as Error).message}`);
  }
});

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`[chalk-server] listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[chalk-server] ${signal} received; shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 15_000);
  forceExit.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  sseManager.closeAll();
  await subscriber.quit();
  await videoQueue.close();
  await redisConnection.quit();
  await closeDatabase();
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { app };
