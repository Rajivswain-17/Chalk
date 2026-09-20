import { Job, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { redisConnection } from "../../lib/redis";
import { hlsPlaylistUrl } from "../../lib/artifacts";
import { generationJobs, type GenerationJob } from "../../repository/schema/jobs";
import { videos, type Video } from "../../repository/schema/videos";
import type { SSEEvent, VideoJob } from "../../types";
import { planScenes } from "../agents/planner";
import { refineNarration } from "../agents/scriptwriter";
import { designScene } from "../agents/sceneDesigner";
import { synthesizeVoice } from "../voice/elevenlabs";
import { buildWordTimestampMap } from "../voice/timestampMapper";
import { resolveIcon } from "../icons/iconifyResolver";
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

/** Execute one complete video generation attempt. */
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
    await reportProgress(job, "planning", 2);

    const scenes = await planScenes(prompt, aspectRatio);
    const totalScenes = scenes.length;
    await patchVideo(videoId, { totalScenes });
    await reportProgress(job, "planning", 8);

    const segmentPaths: string[] = [];
    let playlistUrl = hlsPlaylistUrl(videoId, attempt);

    for (let index = 0; index < totalScenes; index += 1) {
      const scene = { ...scenes[index], sceneIndex: index };
      const sceneBase = 8 + (index / totalScenes) * 87;
      const sceneShare = 87 / totalScenes;

      await reportProgress(job, `scripting_scene_${index}`, sceneBase + sceneShare * 0.08);
      const narration = await refineNarration(scene);

      await reportProgress(job, `voice_synthesis_scene_${index}`, sceneBase + sceneShare * 0.2);
      const { audioPath, rawTimestamps } = await synthesizeVoice(
        narration,
        index,
        jobId,
        attempt,
      );
      const wordTimestamps = buildWordTimestampMap(rawTimestamps);

      await reportProgress(job, `scene_design_scene_${index}`, sceneBase + sceneShare * 0.38);
      const layout = await designScene(
        { ...scene, narration },
        audioPath,
        wordTimestamps,
        aspectRatio,
      );

      await reportProgress(job, `icon_resolution_scene_${index}`, sceneBase + sceneShare * 0.52);
      await Promise.all(
        layout.elements.map(async (element) => {
          if (element.type !== "icon" || !element.content) return;
          element.svg = (await resolveIcon(element.content)) ?? undefined;
        }),
      );

      await reportProgress(job, `rendering_scene_${index}`, sceneBase + sceneShare * 0.65);
      const sceneVideoPath = await renderScene(
        layout,
        index,
        aspectRatio,
        jobId,
        attempt,
      );

      await reportProgress(job, `packaging_scene_${index}`, sceneBase + sceneShare * 0.9);
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

    // Update BullMQ telemetry before the authoritative terminal database state;
    // a telemetry error must not regress an already-completed video to failed.
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
