// ============================================================================
// Chalk — videos table (Chalk/server/src/repository/schema/videos.ts)
// ----------------------------------------------------------------------------
// One row per user request ("explain X as a whiteboard video").
// Parent of generation_jobs (1 video → N attempts/retries).
// Status lifecycle: pending → processing → completed | failed.
// ============================================================================

import {
  pgTable, // Defines a Postgres table with type-safe columns.
  uuid, // UUID PK/FK columns.
  text, // Variable-length strings (title, prompt, URLs, errors).
  integer, // Scene counters + progress math.
  timestamp, // createdAt / updatedAt audit fields.
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm"; // For gen_random_uuid() + now() SQL defaults.

export const videos = pgTable("videos", {
  // Primary key. Default gen_random_uuid() (pgcrypto) so the API never has to
  // mint IDs — safe to return immediately after insert for SSE subscription.
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Short display title ("Photosynthesis in 60s"). Shown in dashboard lists.
  // Not null: controller derives it from topic or first planner heading.
  title: text("title").notNull(),

  // The user's ORIGINAL raw input, stored verbatim. Planner reads this — never
  // the derived title — so retries/re-prompts reproduce the same video intent.
  prompt: text("prompt").notNull(),

  // Coarse lifecycle flag for the whole video. Kept as text (not pgEnum) so
  // new states can be added without a migration:
  // pending (queued, no worker yet) | processing (worker active) |
  // completed (outputUrl ready) | failed (see errorMessage).
  status: text("status").notNull().default("pending"),

  // Canvas shape for the compositor. 16:9 = YouTube/landscape, 9:16 =
  // Shorts/Reels portrait. Fixed at creation — changing it mid-render would
  // invalidate every Rough.js bbox, so updates are rejected in validators.
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),

  // Public HLS path once packaging finishes, e.g. /hls/:id/playlist.m3u8.
  // Null until then — frontend shows SSE progress while null.
  outputUrl: text("output_url"),

  // Total scenes the planner produced. Null until planning completes; used as
  // the denominator for completedScenes/totalScenes progress bars.
  totalScenes: integer("total_scenes"),

  // How many scenes are fully rendered (mp4 segment on disk). Worker
  // increments this; SSE reads it for per-scene progress. Starts at 0.
  completedScenes: integer("completed_scenes").notNull().default(0),

  // Last fatal error (agent validation fail, TTS 4xx, ffmpeg crash...).
  // Null on success. Surfaced by GET /api/videos/:id on failed status.
  errorMessage: text("error_message"),

  // Insert time. Default now() in SQL (not JS) so API + worker clocks agree.
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // Last write time. No auto-bump trigger — repositories set it explicitly
  // via `.set({ updatedAt: new Date() })` so every stage transition is visible.
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- Inferred TypeScript types ----------------------------------------------
// Video = row as READ from the DB (all defaults resolved, e.g. id: string).
// NewVideo = row as WRITTEN (title/prompt required, the rest optional).
// Validators (drizzle-zod) + controllers import these — never redeclare shapes.
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
