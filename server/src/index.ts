import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes";
import visualizeRoutes from "./routes/visualize.routes";
import { env } from "./lib/env";
import { checkDatabase, closeDatabase } from "./lib/db";
import { redisConnection } from "./lib/redis";

const app = express();
const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by CORS"));
    },
    // Required: the SPA (other origin) must send/receive httpOnly cookies.
    credentials: true,
  }),
);
app.use(helmet());
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser()); // Populates req.cookies for session + CSRF checks.

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

app.use("/api/auth", authRoutes);
app.use("/api/visualize", visualizeRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[http] ${error.message}`);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
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
  await redisConnection.quit();
  await closeDatabase();
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { app };
