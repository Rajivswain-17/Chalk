// ============================================================================
// Chalk — Drizzle Kit config (Chalk/server/drizzle.config.ts)
// ----------------------------------------------------------------------------
// Used ONLY by the drizzle-kit CLI (`npm run db:generate / db:migrate`).
// Runtime queries use src/lib/db.ts + src/repository/schema/*. Never import
// this file from Express code — it is build-time tooling, not app code.
// ============================================================================

import { defineConfig } from "drizzle-kit";

// dotenv is loaded here (not via src/lib/env.ts) because drizzle-kit runs
// OUTSIDE tsx — plain `drizzle-kit migrate` has no app bootstrap. Without
// this, process.env.DATABASE_URL would be undefined when the CLI runs.
import "dotenv/config";

export default defineConfig({
  // Postgres dialect: generates `pgTable`-compatible SQL + serial/uuid DDL.
  // Must match the `pgTable` + `postgres-js` driver used in src/lib/db.ts.
  dialect: "postgresql",

  // Glob to every table definition. Drizzle diffs these files against the
  // last snapshot in ./drizzle to auto-generate migration SQL.
  schema: "./src/repository/schema",

  // Where `drizzle-kit generate` writes versioned SQL + snapshots.
  // Committed to git so deploys replay the same DDL via `db:migrate`.
  out: "./drizzle",

  // Connection used by `drizzle-kit studio` / `migrate` to inspect the live
  // DB. Falls back to the local Docker default so the CLI works even if
  // Chalk/.env is missing (CI safety net). App code uses strict env instead.
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://chalk:chalk@localhost:5432/chalk",
  },

  // Print every statement + diff during generate/migrate. Noisy but makes
  // schema drift obvious in `docker compose` logs and code review.
  verbose: true,

  // Fail `generate` on ambiguous renames/drops instead of guessing.
  // Forces explicit table/column renames — protects videos/jobs production data.
  strict: true,
});
