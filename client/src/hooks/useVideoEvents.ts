"use client";

// useVideoEvents — SSE subscription for one render job.
// Opens EventSource on GET /api/videos/:jobId/events and reduces the backend's
// named frames (progress | scene_ready | completed | error) into watch state.
// EventSource auto-reconnects on drop; the server replays a snapshot on every
// (re)subscribe, so state self-heals without client-side replay logic.

import { useEffect, useState } from "react";

/** Backend SSE envelope (data payload of every frame; `event:` header is lowercase). */
type ProgressData = {
  status: string;
  stage: string | null;
  progress: number;
};
type SceneReadyData = {
  sceneIndex: number;
  completedScenes: number;
  totalScenes: number;
  playlistUrl: string;
};
type CompletedData = { outputUrl: string; totalScenes: number };
type ErrorData = { message: string };

/** Render lifecycle as seen by the watch page. */
export type WatchStatus = "connecting" | "active" | "completed" | "failed";

export interface WatchState {
  status: WatchStatus;
  /** Raw stage string (planning, scripting_scene_0, …) — stepper maps it. */
  stage: string | null;
  /** 0–100 overall progress from the worker. */
  progress: number;
  /** Growing playlist URL — set on first SCENE_READY, play immediately. */
  playlistUrl: string | null;
  /** Sealed playlist URL — set on COMPLETED. */
  outputUrl: string | null;
  completedScenes: number;
  totalScenes: number | null;
  error: string | null;
}

const initialState: WatchState = {
  status: "connecting",
  stage: null,
  progress: 0,
  playlistUrl: null,
  outputUrl: null,
  completedScenes: 0,
  totalScenes: null,
  error: null,
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function parseData(e: Event): { data?: unknown } | null {
  try {
    return JSON.parse((e as MessageEvent).data) as {
      data: Record<string, never>;
    };
  } catch {
    return null; // Poison frame — ignore, stream stays open.
  }
}

/**
 * Subscribe to a job's event stream. No-op until jobId is set.
 * Closes the stream on unmount or jobId change (strict-mode safe).
 */
export function useVideoEvents(jobId: string | null): WatchState {
  const [state, setState] = useState<WatchState>(initialState);

  useEffect(() => {
    if (!jobId) return;
    setState(initialState);

    const source = new EventSource(
      `${API_URL}/api/videos/${encodeURIComponent(jobId)}/events`,
    );

    const onProgress = (e: Event) => {
      const envelope = parseData(e);
      const data = envelope?.data as unknown as ProgressData | undefined;
      if (!data) return;
      setState((s) => ({
        ...s,
        status: "active",
        stage: data.stage,
        progress: data.progress,
      }));
    };
    const onSceneReady = (e: Event) => {
      const envelope = parseData(e);
      const data = envelope?.data as unknown as SceneReadyData | undefined;
      if (!data) return;
      setState((s) => ({
        ...s,
        status: "active",
        playlistUrl: s.playlistUrl ?? data.playlistUrl, // First URL wins; later scenes share it.
        completedScenes: data.completedScenes,
        totalScenes: data.totalScenes,
        progress: Math.round(
          (data.completedScenes / Math.max(data.totalScenes, 1)) * 100,
        ),
      }));
    };
    const onCompleted = (e: Event) => {
      const envelope = parseData(e);
      const data = envelope?.data as unknown as CompletedData | undefined;
      if (!data) return;
      setState((s) => ({
        ...s,
        status: "completed",
        outputUrl: data.outputUrl,
        playlistUrl: s.playlistUrl ?? data.outputUrl,
        totalScenes: data.totalScenes,
        completedScenes: data.totalScenes,
        progress: 100,
      }));
      source.close(); // Terminal — no more frames will arrive.
    };
    const onErrorEvent = (e: Event) => {
      // Two sources share the "error" name: the backend's terminal ERROR frame
      // (a MessageEvent WITH data) and EventSource connection blips (plain
      // Event, no data). Only the former fails the render — the latter must
      // keep the socket open so EventSource auto-reconnects and the server
      // replays its snapshot on resubscribe.
      const raw = (e as MessageEvent).data as unknown;
      if (typeof raw !== "string") return;
      let data: ErrorData | undefined;
      try {
        data = (JSON.parse(raw) as { data?: ErrorData }).data;
      } catch {
        return;
      }
      setState((s) => ({
        ...s,
        status: "failed",
        error: data?.message ?? "Video generation failed",
      }));
      source.close(); // Terminal — stop reconnecting.
    };

    source.addEventListener("progress", onProgress);
    source.addEventListener("scene_ready", onSceneReady);
    source.addEventListener("completed", onCompleted);
    source.addEventListener("error", onErrorEvent);

    return () => {
      source.removeEventListener("progress", onProgress);
      source.removeEventListener("scene_ready", onSceneReady);
      source.removeEventListener("completed", onCompleted);
      source.removeEventListener("error", onErrorEvent);
      source.close();
    };
  }, [jobId]);

  return state;
}
