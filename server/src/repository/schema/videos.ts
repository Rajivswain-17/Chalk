import { sql } from "drizzle-orm";
import { check, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const videoStatusEnum = pgEnum("video_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const aspectRatioEnum = pgEnum("aspect_ratio", ["16:9", "9:16"]);

/** One persistent video-generation request. */
export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    status: videoStatusEnum("status").notNull().default("pending"),
    aspectRatio: aspectRatioEnum("aspect_ratio").notNull().default("16:9"),
    /** Public growing HLS URL, populated as soon as the first scene is packaged. */
    outputUrl: text("output_url"),
    totalScenes: integer("total_scenes"),
    completedScenes: integer("completed_scenes").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    totalScenesNonnegative: check(
      "videos_total_scenes_nonnegative",
      sql`${table.totalScenes} is null or ${table.totalScenes} >= 0`,
    ),
    completedScenesValid: check(
      "videos_completed_scenes_valid",
      sql`${table.completedScenes} >= 0 and (${table.totalScenes} is null or ${table.completedScenes} <= ${table.totalScenes})`,
    ),
  }),
);

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
