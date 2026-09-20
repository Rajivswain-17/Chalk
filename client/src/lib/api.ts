// Chalk API client — typed fetch wrappers over the Express backend.
// Base URL comes from .env.local (NEXT_PUBLIC_API_URL); the localhost:3001
// fallback keeps `npm run dev` working with zero config.

/** Canvas shape. Must match the backend's aspectRatio enum exactly. */
export type AspectRatio = "16:9" | "9:16";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

/** Parse an error body, tolerating non-JSON failures (proxy 502 HTML, etc.). */
async function throwForStatus(res: Response, fallback: string): Promise<never> {
  let detail = fallback;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) detail = body.error;
  } catch {
    // Non-JSON body — keep the fallback message.
  }
  throw new Error(detail);
}

/**
 * Start a render. Returns 202 { jobId, videoId } on success.
 * Throws on 400 (prompt too short/long) and 503 (rate limit 10/hr or worker down).
 */
export async function generateVideo(
  input: GenerateInput,
): Promise<GenerateResponse> {
  const res = await fetch(`${API_URL}/api/videos/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    await throwForStatus(res, "Could not start video generation");
  }
  return (await res.json()) as GenerateResponse;
}

/** Fetch one video snapshot. Throws on 404 (unknown id) or 500. */
export async function getVideoStatus(
  videoId: string,
): Promise<VideoStatusDto> {
  const res = await fetch(
    `${API_URL}/api/videos/${encodeURIComponent(videoId)}/status`,
    { cache: "no-store" }, // Status mutates every scene — never cache it.
  );
  if (!res.ok) {
    await throwForStatus(res, "Could not load video status");
  }
  return (await res.json()) as VideoStatusDto;
}

/** Absolute HLS URL for a server-provided playlist path (e.g. /hls/...). */
export function toAbsoluteMediaUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}
