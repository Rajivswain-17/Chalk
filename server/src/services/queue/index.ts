

import { Queue } from "bullmq"; // BullMQ queue primitive (Valkey-backed).
import { redisConnection } from "../../lib/redis"; // Shared singleton client.
import type { VideoJob } from "../../types"; // Queue payload contract.


// orphans in-flight jobs (they stay in Valkey under the old key).
const QUEUE_NAME = "chalk-video-generation";


export const videoQueue = new Queue<VideoJob>(QUEUE_NAME, {
  
  connection: redisConnection,

  // Defaults applied to EVERY job unless overridden per-add:
  defaultJobOptions: {
    
    attempts: 3,

    
    backoff: { type: "exponential", delay: 5000 },


    removeOnComplete: { count: 100 },

    
    removeOnFail: { count: 50 },
  },
});

// --- Enqueue helper ---------------------------------------------------------
/**
 * Enqueue one render attempt for a video.
 * Called by the controller AFTER inserting videos + generation_jobs rows —
 * payload.jobId is the DB job row id (generation_jobs.id), NOT a random id.
 *
 * @param payload - VideoJob { jobId, videoId, prompt, aspectRatio }.
 * @returns The BullMQ Job object (caller persists `.id` → jobs.bullmqJobId).
 *

 */

export async function enqueueVideoJob(payload: VideoJob) {
  return videoQueue.add(payload.jobId, payload);
}


// This file (src/services/queue/index.ts) is the Ticket Dispenser (The Producer) for your video rendering pipeline.

// The Big Picture: Why Do We Need This File?
// Creating an AI whiteboard video takes 20 to 60 seconds (AI planning, ElevenLabs voiceover, Remotion drawing, FFmpeg packaging).

// If your Express API tried to do all of that inside the regular HTTP request, the user's browser would spin, freeze, and time out.

// The Solution:

// When a user clicks "Generate Video", the API does NOT generate the video immediately.
// Instead, this file creates a Job Ticket and drops it into Valkey in 5 milliseconds.
// The API immediately tells the user: "Got it! Your Job ID is #123. Watch the progress live!"
// A background worker picks up the ticket from Valkey and renders the video peacefully.
// Step-by-Step Code Breakdown
// 1. The Queue Name
// ts
// const QUEUE_NAME = "chalk-video-generation";
// What it does: The unique mailbox name in Valkey where video tickets are dropped.
// Why it matters: The Producer (this file) and the Worker (which executes the job) must use the exact same name so the worker knows which mailbox to pull jobs from.
// 2. The Queue Configuration & Smart Rules (defaultJobOptions)
// ts
// export const videoQueue = new Queue<VideoJob>(QUEUE_NAME, {
//   connection: redisConnection,
//   defaultJobOptions: {
//     attempts: 3,
//     backoff: { type: "exponential", delay: 5000 },
//     removeOnComplete: { count: 100 },
//     removeOnFail: { count: 50 },
//   },
// });
// These options protect your server from crashing and memory leaks:

// connection: redisConnection: Connects this queue directly to Valkey using the shared singleton we explained in the previous file.

// attempts: 3 (Auto-Retry): If a temporary glitch happens (e.g. OpenAI has a 2-second hiccup or ElevenLabs hits a temporary network timeout), BullMQ will not fail the job immediately. It will automatically retry the job up to 3 times!

// backoff: { type: "exponential", delay: 5000 }: If a job fails, when should it retry?

// Retrying immediately (0 seconds) is bad—if an AI API is rate-limiting you, calling it again instantly will fail again.
// Exponential Backoff waits 5 seconds before Attempt 2, and 25 seconds before Attempt 3. This gives external APIs time to recover!
// removeOnComplete: { count: 100 } & removeOnFail: { count: 50 } (Memory Guard): Valkey stores data in RAM. If you generate 10,000 videos and never clean up old job records, your server will run out of memory. This rule tells Valkey: "Only keep the last 100 successful jobs and last 50 failed jobs for debugging. Automatically delete the rest to keep RAM clean."

// 3. The enqueueVideoJob Function
// ts
// export async function enqueueVideoJob(payload: VideoJob) {
//   return videoQueue.add(payload.jobId, payload);
// }
// What it does: This is the clean helper function that your API controllers will call.
// The Parameters:
// payload.jobId: Becomes the name of the job in Valkey.
// payload: Contains all the video info (the prompt, the aspect ratio 16:9 or 9:16, the database row ID).
// Result: Pushes the job into Valkey and returns the BullMQ job object so the controller can log it or track it.
// Summary:
// This file is the bridge between the Express API and the background worker. It safely wraps your video requests into durable tickets, applies smart retry rules, and places them into Valkey in under 5 milliseconds!

// // 





// so valkey be like what u did just tell me in evry sec so i notice. if any time local laptop stops or crash anything happened i have info of that so when next time we reboot i will send this part in to queue first 