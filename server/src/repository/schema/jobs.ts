import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { videos } from "./videos";

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "active",
  "retrying",
  "completed",
  "failed",
]);

/** One logical BullMQ job. BullMQ's own retries update this same row. */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    bullmqJobId: text("bullmq_job_id").unique(),
    status: jobStatusEnum("status").notNull().default("queued"),
    currentStage: text("current_stage"),
    progress: integer("progress").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    progressRange: check(
      "generation_jobs_progress_range",
      sql`${table.progress} between 0 and 100`,
    ),
    videoCreatedIndex: index("generation_jobs_video_created_idx").on(
      table.videoId,
      table.createdAt,
      table.id,
    ),
  }),
);

export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;
