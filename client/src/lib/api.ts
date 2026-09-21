// Chalk API client — typed wrappers over the Express backend.
// All calls ride apiFetch: cookies attached, CSRF on mutations, one silent
// refresh+retry on 401. Backend error strings surface as err.message.

import { API_URL, apiFetch } from "@/lib/auth-client";

/** Canvas shape. Must match the backend's aspectRatio enum exactly. */
export type AspectRatio = "16:9" | "9:16";

/** POST /api/videos/generate body. prompt 10–1000 chars (backend Zod gate). */
export interface GenerateInput {
  prompt: string;
  aspectRatio: AspectRatio;
  title?: string;
}

/** 202 response: both ids — jobId feeds SSE, videoId feeds status polling. */
export interface GenerateResponse {
  jobId: string;
  videoId: string;
  message: string;
}

/** GET /api/videos/:videoId/status snapshot (poll fallback + refresh recovery). */
export interface VideoStatusDto {
  id: string;
  title: string;
  status: "pending" | "processing" | "completed" | "failed";
  aspectRatio: AspectRatio;
  outputUrl: string | null;
  totalScenes: number | null;
  completedScenes: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Start a render. Returns 202 { jobId, videoId }.
 * Throws 400 (validation), 401 (login needed), 503 (rate limit / backend down).
 */
export async function generateVideo(
  input: GenerateInput,
): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>("/api/videos/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    csrf: true, // Cookie-authed mutation → double-submit header required.
  });
}

/** Fetch one owned video snapshot. Throws 404 (unknown/foreign id) or 401. */
export async function getVideoStatus(
  videoId: string,
): Promise<VideoStatusDto> {
  return apiFetch<VideoStatusDto>(
    `/api/videos/${encodeURIComponent(videoId)}/status`,
  );
}

/** Absolute HLS URL for a server-provided playlist path (e.g. /hls/…). */
export function toAbsoluteMediaUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

/** OAuth providers with working credentials (hides dead login buttons). */
export async function getAuthProviders(): Promise<{
  google: boolean;
  github: boolean;
}> {
  return apiFetch("/api/auth/providers");
}
