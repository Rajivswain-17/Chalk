import { Job, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { redisConnection } from "../../lib/redis";
import { hlsPlaylistUrl } from "../../lib/artifacts";
import { generationJobs, type GenerationJob } from "../../repository/schema/jobs";
import { videos, type Video } from "../../repository/schema/videos";
import type { SSEEvent, VideoJob } from "../../types";
import { planVisualSteps } from "../agents/planner";
import { renderScene } from "../compositor/remotionRenderer";
import { packageSceneToHLS, updatePlaylist } from "../ffmpeg/hlsPackager";
import { VIDEO_QUEUE_NAME } from "./constants";

async function publish(event: SSEEvent): Promise<void> {
  try {
    await redisConnection.publish(`job:${event.jobId}`, JSON.stringify(event));
  } catch (error) {
    console.warn(`[worker] could not publish ${event.type}: ${(error as Error).message}`);
  }
}

async function patchJob(
  jobId: string,
  patch: Partial<Omit<GenerationJob, "id" | "videoId" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(generationJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

async function patchVideo(
  videoId: string,
  patch: Partial<Omit<Video, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(videos)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(videos.id, videoId));
}

async function reportProgress(
  job: Job<VideoJob>,
  stage: string,
  progress: number,
): Promise<void> {
  const boundedProgress = Math.max(0, Math.min(99, Math.round(progress)));
  await patchJob(job.data.jobId, {
    status: "active",
    currentStage: stage,
    progress: boundedProgress,
    errorMessage: null,
  });
  await job.updateProgress(boundedProgress);
  await publish({
    type: "PROGRESS",
    jobId: job.data.jobId,
    data: { status: "active", stage, progress: boundedProgress },
  });
}

/** Execute one complete visual explainer generation attempt (zero voice). */
export async function processVideoJob(
  job: Job<VideoJob>,
): Promise<{ playlistUrl: string }> {
  const { jobId, videoId, prompt, aspectRatio } = job.data;
  const attempt = job.attemptsMade + 1;

  try {
    await patchVideo(videoId, {
      status: "processing",
      totalScenes: null,
      completedScenes: 0,
      outputUrl: null,
      errorMessage: null,
    });
    await reportProgress(job, "planning", 10);

    const steps = await planVisualSteps(prompt, aspectRatio);
    const totalScenes = steps.length;
    await patchVideo(videoId, { totalScenes });
    await reportProgress(job, "planning", 25);

    const segmentPaths: string[] = [];
    let playlistUrl = hlsPlaylistUrl(videoId, attempt);

    for (let index = 0; index < totalScenes; index += 1) {
      const step = steps[index];
      const stepBase = 25 + (index / totalScenes) * 70;
      const stepShare = 70 / totalScenes;

      await reportProgress(job, `rendering_step_${index}`, stepBase + stepShare * 0.4);
      const sceneVideoPath = await renderScene(
        { step, aspectRatio },
        index,
        aspectRatio,
        jobId,
        attempt,
      );

      await reportProgress(job, `packaging_step_${index}`, stepBase + stepShare * 0.85);
      const segmentPath = await packageSceneToHLS(
        sceneVideoPath,
        index,
        videoId,
        attempt,
      );
      segmentPaths.push(segmentPath);
      await updatePlaylist(
        videoId,
        attempt,
        segmentPaths,
        index === totalScenes - 1,
      );

      const completedScenes = index + 1;
      playlistUrl = hlsPlaylistUrl(videoId, attempt);
      await patchVideo(videoId, { completedScenes, outputUrl: playlistUrl });
      await publish({
        type: "SCENE_READY",
        jobId,
        data: {
          sceneIndex: index,
          completedScenes,
          totalScenes,
          playlistUrl,
        },
      });
    }

    await job.updateProgress(100);
    await patchVideo(videoId, {
      status: "completed",
      outputUrl: playlistUrl,
      completedScenes: totalScenes,
      errorMessage: null,
    });
    await patchJob(jobId, {
      status: "completed",
      currentStage: "done",
      progress: 100,
      errorMessage: null,
    });
    await publish({
      type: "COMPLETED",
      jobId,
      data: { outputUrl: playlistUrl, totalScenes },
    });
    return { playlistUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const maximumAttempts = Number(job.opts.attempts ?? 1);
    const isTerminal = attempt >= maximumAttempts;

    await Promise.allSettled([
      patchJob(jobId, {
        status: isTerminal ? "failed" : "retrying",
        currentStage: isTerminal ? null : "retrying",
        errorMessage: message,
      }),
      patchVideo(videoId, {
        status: isTerminal ? "failed" : "processing",
        errorMessage: isTerminal ? message : null,
      }),
      publish(
        isTerminal
          ? { type: "ERROR", jobId, data: { message } }
          : {
              type: "PROGRESS",
              jobId,
              data: {
                status: "retrying",
                stage: "retrying",
                progress: 0,
              },
            },
      ),
    ]);
    throw error;
  }
}

/** Create the consumer only from the dedicated worker entrypoint. */
export function createVideoWorker(): Worker<VideoJob> {
  const worker = new Worker<VideoJob>(VIDEO_QUEUE_NAME, processVideoJob, {
    connection: redisConnection,
    concurrency: 1,
  });
  worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
  worker.on("failed", (job, error) =>
    console.warn(`[worker] attempt failed ${job?.id}: ${error.message}`),
  );
  worker.on("error", (error) => console.error(`[worker] ${error.message}`));
  return worker;
}
