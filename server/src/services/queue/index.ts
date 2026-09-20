import { Queue } from "bullmq";
import { redisConnection } from "../../lib/redis";
import type { VideoJob } from "../../types";
import { VIDEO_QUEUE_NAME } from "./constants";

export { VIDEO_QUEUE_NAME } from "./constants";

export const videoQueue = new Queue<VideoJob>(VIDEO_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

/**
 * Use the database job UUID as BullMQ's actual job ID, not merely its display
 * name. Repeated controller calls therefore cannot enqueue duplicate work.
 */
export async function enqueueVideoJob(payload: VideoJob) {
  return videoQueue.add("generate-video", payload, { jobId: payload.jobId });
}
