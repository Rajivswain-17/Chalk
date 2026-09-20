import { closeDatabase } from "./lib/db";
import { redisConnection } from "./lib/redis";
import { createVideoWorker } from "./services/queue/worker";

const worker = createVideoWorker();
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received; finishing active work before shutdown`);

  const forceExit = setTimeout(() => process.exit(1), 30_000);
  forceExit.unref();
  await worker.close();
  await redisConnection.quit();
  await closeDatabase();
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
console.log("[worker] listening for Chalk video jobs");
