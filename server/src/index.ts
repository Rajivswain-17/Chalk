// ============================================================================
// Chalk — API entrypoint (Chalk/server/src/index.ts)
// ----------------------------------------------------------------------------
// Boot order: dotenv → express → middleware → routes → listen.
// Run in dev via `npm run dev` (tsx watch). Dockerfile CMD uses this file.
// ============================================================================

// --- 1. Load env FIRST ------------------------------------------------------
// dotenv populates process.env from Chalk/.env BEFORE any lib/env.ts import
// reads it. Must stay the topmost import (side-effect import) or DATABASE_URL
// / REDIS_URL / API keys will be undefined at module-init time.
import "dotenv/config";

// --- 2. Framework + middleware imports --------------------------------------
import express from "express"; // Core HTTP server (routes/controllers mount here).
import cors from "cors"; // Allow future Chalk/client origin (localhost:5173 etc.).
import helmet from "helmet"; // Secure defaults: hides X-Powered-By, sets CSP-ish headers.
import morgan from "morgan"; // Dev request logs: METHOD PATH STATUS ms.

// --- 3. App + config --------------------------------------------------------
const app = express();

// PORT comes from .env (compose env_file). Default 3001 matches
// Dockerfile EXPOSE + docker-compose ports "3001:3001".
const PORT = Number(process.env.PORT) || 3001;

// --- 4. Global middleware (order matters) -----------------------------------
app.use(cors()); // Permissive in dev; tighten `origin:` when client/ exists.
app.use(helmet()); // Must run early so all responses carry security headers.
app.use(morgan("dev")); // "dev" format = concise colored logs for local work.
app.use(express.json()); // Parse JSON bodies for POST /api/videos (Step 11).

// --- 5. Health check --------------------------------------------------------
// Used by Docker HEALTHCHECK, uptime monitors, and Step 1 smoke tests.
// Deliberately dependency-free: must return ok even if DB/Valkey are down.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "chalk-server",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Routes will be registered here in Step 11
// e.g. app.use("/api/videos", videoRoutes) — controllers → services → queue.
// SSE lives at GET /api/videos/:id/events, HLS at /hls/:id/* (static).
// ============================================================================

// --- 6. Start listener ------------------------------------------------------
app.listen(PORT, () => {
  // Visible in `docker compose logs -f server` to confirm boot + port.
  console.log(`[chalk-server] listening on http://localhost:${PORT}`);
});
