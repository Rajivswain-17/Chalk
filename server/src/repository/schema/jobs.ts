// ============================================================================
// Chalk — generation jobs table (Chalk/server/src/repository/schema/jobs.ts)
// ----------------------------------------------------------------------------
// Tracks ONE BullMQ execution attempt for a video. A video row is the intent;
// a job row is the run. Retries create NEW job rows (history preserved).
// Status lifecycle: queued → active → completed | failed.
// ============================================================================

import {
  pgTable, // Defines a Postgres table with type-safe columns.
  uuid, // UUID PK + FK to videos.id.
  text, // Status/stage strings, BullMQ ID, error text.
  integer, // 0–100 progress for SSE bars.
  timestamp, // createdAt / updatedAt audit fields.
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm"; // For gen_random_uuid() SQL default.
import { videos } from "./videos"; // Parent table for the FK reference.

export const generationJobs = pgTable("generation_jobs", {
  // Primary key (DB-level attempt ID). Distinct from BullMQ's own job ID —
  // this survives queue wipes and links SSE events to a stable row.
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Parent video this attempt renders. onDelete: cascade — deleting a video
  // wipes its run history (storage files are cleaned by the controller).
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),

  // BullMQ's job.id once `queue.add()` succeeds. Null between DB insert and
  // enqueue (crash window) — worker reconciles nulls on boot. Used for
  // BullMQ obs removal / retry lookups.
  bullmqJobId: text("bullmq_job_id"),

  // Queue-level state (mirrors BullMQ, denormalized for cheap polling):
  // queued (waiting in Valkey) | active (worker picked up) |
  // completed (packaging done) | failed (see errorMessage).
  status: text("status").notNull().default("queued"),

  // Fine-grained pipeline step for SSE labels. Null before worker starts.
  // Examples: planning | scripting | voice | rendering_scene_1 | packaging.
  // Free-form text (not enum) so new stages need no migration.
  currentStage: text("current_stage"),

  // 0–100 overall percent. Worker updates per stage (plan 5-15%, script
  // 15-35%...). Frontend renders this directly — keep writes cheap/batched.
  progress: integer("progress").notNull().default(0),

  // Last fatal error for this attempt (TTS quota, ffmpeg exit code...).
  // Copied to videos.errorMessage on terminal failure for API convenience.
  errorMessage: text("error_message"),

  // Attempt creation time (queue-in). Used to order retry history oldest→newest.
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // Last progress/heartbeat write. Repositories set explicitly on each stage
  // transition — lets the API detect stalled workers (now - updatedAt > TTL).
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- Inferred TypeScript types ----------------------------------------------
// GenerationJob = row as READ (id/videoId resolved).
// NewGenerationJob = row as WRITTEN (videoId required, rest defaulted).
// Queue service + worker import these — never redeclare shapes.
export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;
