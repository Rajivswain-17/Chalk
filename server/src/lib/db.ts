// ============================================================================
// Chalk — Postgres connection (Chalk/server/src/lib/db.ts)
// ----------------------------------------------------------------------------
// Single shared Drizzle instance imported by every repository query.
// Uses the lightweight `postgres` (postgres-js) driver — one TCP pool per
// Node process, reused by both the Express API and the BullMQ worker.
// ============================================================================

import postgres from "postgres"; // postgres-js: pooled PG client (not node-postgres).
import { drizzle } from "drizzle-orm/postgres-js"; // Drizzle adapter for postgres-js.

// Re-export the `sql` tagged-template helper so repositories can write raw
// fragments (e.g. `sql`now()``, `sql`${x} + 1``) without importing drizzle-orm
// directly. Keeps all DB access funnelled through this module.
export { sql } from "drizzle-orm";

// --- Connection string ------------------------------------------------------
// Inside Docker, HOST=postgres (compose DNS). Outside Docker (psql, studio),
// use localhost. Falls back to the local default so `tsx watch` works even
// if .env failed to load — real deploys must still set DATABASE_URL.
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://chalk:chalk@localhost:5432/chalk";

// --- Pooling ----------------------------------------------------------------
// postgres-js manages a connection pool internally — NO manual Pool() needed:
//   • max: 10 caps concurrent sockets so one render burst can't exhaust PG.
//     API (small queries) + worker (stage updates) share this budget.
//   • idle_timeout: 20s closes unused sockets, freeing PG slots between jobs.
//   • connect_timeout: 10s fails fast at boot (compose depends_on is ordering
//     only — app-level retry in index.ts handles the actual race).
// The client is created ONCE at module load (singleton). Every `import { db }`
// reuses the same pool — never call postgres() per-request or sockets leak.
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// --- Drizzle instance -------------------------------------------------------
// Typed query builder over the pooled client. Table types come from
// src/repository/schema/*. Repositories import this — controllers/services
// must NEVER create their own client.
export const db = drizzle(client);
