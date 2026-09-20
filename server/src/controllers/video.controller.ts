import type { Request, Response } from "express";
import { createVideoSchema, idParamSchema } from "../validators";
import { sseManager } from "../lib/sse";
import {
  createVideoAndJob,
  getJobById,
  getVideo,
  updateJob,
  updateVideo,
} from "../repository";
import { enqueueVideoJob } from "../services/queue";

export async function generateVideo(req: Request, res: Response): Promise<void> {
  const parsed = createVideoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { prompt, aspectRatio, title } = parsed.data;
  let created: Awaited<ReturnType<typeof createVideoAndJob>> | undefined;
  try {
    created = await createVideoAndJob({
      title: title ?? prompt.slice(0, 80),
      prompt,
      aspectRatio,
      status: "pending",
    });
    await enqueueVideoJob({
      jobId: created.job.id,
      videoId: created.video.id,
      prompt,
      aspectRatio,
    });
    res.status(202).json({
      jobId: created.job.id,
      videoId: created.video.id,
      message: "Video generation started",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[controller] failed to enqueue video: ${message}`);
    if (created) {
      await Promise.allSettled([
        updateVideo(created.video.id, { status: "failed", errorMessage: message }),
        updateJob(created.job.id, { status: "failed", errorMessage: message }),
      ]);
    }
    res.status(503).json({ error: "Video generation is temporarily unavailable" });
  }
}

export async function streamEvents(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params.jobId);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  try {
    const job = await getJobById(parsedId.data);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const video = await getVideo(job.videoId);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    sseManager.addClient(job.id, res);
    if (video.outputUrl && video.completedScenes > 0 && video.totalScenes) {
      sseManager.send(res, {
        type: "SCENE_READY",
        jobId: job.id,
        data: {
          sceneIndex: video.completedScenes - 1,
          completedScenes: video.completedScenes,
          totalScenes: video.totalScenes,
          playlistUrl: video.outputUrl,
        },
      });
    }
    if (job.status === "completed" && video.outputUrl && video.totalScenes) {
      sseManager.send(res, {
        type: "COMPLETED",
        jobId: job.id,
        data: { outputUrl: video.outputUrl, totalScenes: video.totalScenes },
      });
    } else if (job.status === "failed") {
      sseManager.send(res, {
        type: "ERROR",
        jobId: job.id,
        data: { message: job.errorMessage ?? "Video generation failed" },
      });
    } else {
      sseManager.send(res, {
        type: "PROGRESS",
        jobId: job.id,
        data: {
          status: job.status,
          stage: job.currentStage,
          progress: job.progress,
        },
      });
    }
  } catch (error) {
    console.error(`[controller] SSE lookup failed: ${(error as Error).message}`);
    if (!res.headersSent) res.status(500).json({ error: "Could not open event stream" });
    else res.end();
  }
}

export async function getVideoStatus(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params.videoId);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid video ID" });
    return;
  }

  try {
    const video = await getVideo(parsedId.data);
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.json({
      id: video.id,
      title: video.title,
      status: video.status,
      aspectRatio: video.aspectRatio,
      outputUrl: video.outputUrl,
      totalScenes: video.totalScenes,
      completedScenes: video.completedScenes,
      errorMessage: video.status === "failed" ? video.errorMessage : null,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    });
  } catch (error) {
    console.error(`[controller] status lookup failed: ${(error as Error).message}`);
    res.status(500).json({ error: "Could not load video status" });
  }
}
