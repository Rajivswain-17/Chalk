// ============================================================================
// Chalk — Valkey client (Chalk/server/src/lib/redis.ts)
// ----------------------------------------------------------------------------
// Single shared ioredis connection used by BullMQ (queue + worker) and later
// by SSE pub/sub (`video:{id}` progress channel).
// Valkey speaks the Redis protocol, so REDIS_URL uses redis:// and the
// `ioredis` driver works unchanged.
// ============================================================================

import IORedis from "ioredis"; // Redis-compatible client (talks to Valkey).
import { env } from "./env";

// --- Connection string ------------------------------------------------------
// Inside Docker HOST=valkey (compose DNS). Outside Docker use localhost.
// Falls back to localhost default so `tsx watch` works without .env — real
// deploys must still set REDIS_URL (see Chalk/.env).
const redisUrl = env.REDIS_URL;

// --- Shared connection ------------------------------------------------------
/**
 * The ONE Valkey connection for this process. Imported by:
 *   - services/queue/index.ts (BullMQ Queue producer)
 *   - services/queue/worker.ts Step 10 (BullMQ Worker consumer)
 *   - future SSE publisher (worker) / subscriber (API).
 * Singleton: module-load creates it once. Never `new IORedis()` per request —
 * each instance opens fresh TCP sockets and breaks BullMQ's blocker protocol.
 */
export const redisConnection = new IORedis(redisUrl, {
  // BullMQ MANDATE: must be null. BullMQ drives long-lived blocking commands
  // (BRPOPLPUSH-style job polling). The default (20 retries) would abort those
  // mid-block and throw "maxRetriesPerRequest" errors under load. null = let
  // BullMQ own the retry/backoff lifecycle via defaultJobOptions instead.
  maxRetriesPerRequest: null,

  // BullMQ MANDATE: must be false. The default ready-check sends INFO on
  // connect and stalls the client until it passes — BullMQ's own connection
  // handshake already covers readiness, and the extra check breaks Valkey
  // failover / fast-restart flows (stuck "wait" state on reconnect).
  enableReadyCheck: false,
});

// --- Lifecycle logging ------------------------------------------------------
// Visible in `docker compose logs -f server`. Concise one-liners — no secrets.
// "connect" = TCP up (not yet usable). "ready" = usable for commands.
// "close" = socket lost (retry in background). "error" = surfaced to logs
// (BullMQ retries the job; process does NOT crash on Valkey blips).
redisConnection.on("connect", () => {
  console.log("[redis] connecting to Valkey...");
});

redisConnection.on("ready", () => {
  console.log("[redis] ready — Valkey connection established");
});

redisConnection.on("close", () => {
  console.log("[redis] connection closed — retrying in background");
});

redisConnection.on("error", (err: Error) => {
  console.error("[redis] connection error:", err.message);
});
