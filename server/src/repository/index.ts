import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { videos, type NewVideo, type Video } from "./schema/videos";
import {
  generationJobs,
  type GenerationJob,
  type NewGenerationJob,
} from "./schema/jobs";

/** Atomically create the video intent and its queue-tracking row. */
export async function createVideoAndJob(
  videoData: NewVideo,
): Promise<{ video: Video; job: GenerationJob }> {
  return db.transaction(async (tx) => {
    const [video] = await tx.insert(videos).values(videoData).returning();
    const jobId = randomUUID();
    const [job] = await tx
      .insert(generationJobs)
      .values({
        id: jobId,
        videoId: video.id,
        bullmqJobId: jobId,
        status: "queued",
      })
      .returning();
    return { video, job };
  });
}

export async function createVideo(data: NewVideo): Promise<Video> {
  const [row] = await db.insert(videos).values(data).returning();
  return row;
}

export async function updateVideo(
  id: string,
  data: Partial<Omit<Video, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(videos)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(videos.id, id));
}

export async function getVideo(id: string): Promise<Video | null> {
  const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return row ?? null;
}

export async function createJob(data: NewGenerationJob): Promise<GenerationJob> {
  const [row] = await db.insert(generationJobs).values(data).returning();
  return row;
}

export async function updateJob(
  id: string,
  data: Partial<Omit<GenerationJob, "id" | "videoId" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(generationJobs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(generationJobs.id, id));
}

export async function getJob(videoId: string): Promise<GenerationJob | null> {
  const [row] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.videoId, videoId))
    .orderBy(desc(generationJobs.createdAt), desc(generationJobs.id))
    .limit(1);
  return row ?? null;
}

export async function getJobById(id: string): Promise<GenerationJob | null> {
  const [row] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, id))
    .limit(1);
  return row ?? null;
}
