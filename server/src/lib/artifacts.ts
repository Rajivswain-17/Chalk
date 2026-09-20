import path from "path";
import { env } from "./env";

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function assertSafePart(value: string, label: string): void {
  if (!SAFE_ID.test(value)) {
    throw new Error(`Invalid ${label} used in an artifact path`);
  }
}

/** Stable name for one BullMQ execution attempt. */
export function attemptName(attempt: number): string {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Artifact attempt must be a positive integer");
  }
  return `attempt_${String(attempt).padStart(3, "0")}`;
}

/** Private audio/video workspace, isolated by database job and retry attempt. */
export function jobAttemptDir(jobId: string, attempt: number): string {
  assertSafePart(jobId, "job id");
  return path.join(env.OUTPUT_DIR, "jobs", jobId, attemptName(attempt));
}

/** Public HLS workspace, isolated so retries never rewrite media being played. */
export function hlsAttemptDir(videoId: string, attempt: number): string {
  assertSafePart(videoId, "video id");
  return path.join(env.OUTPUT_DIR, "hls", videoId, attemptName(attempt));
}

/** Browser path corresponding to an attempt's playlist on disk. */
export function hlsPlaylistUrl(videoId: string, attempt: number): string {
  assertSafePart(videoId, "video id");
  return `/hls/${videoId}/${attemptName(attempt)}/playlist.m3u8`;
}
