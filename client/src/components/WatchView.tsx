"use client";

// WatchView — live render screen: player + pipeline stepper side by side.
// SSE (useVideoEvents) is the live source; a one-time status fetch supplies
// the title + aspect ratio (absent from SSE frames) and covers refresh recovery.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineStepper } from "@/components/PipelineStepper";
import { VideoPlayer } from "@/components/VideoPlayer";
import { useVideoEvents } from "@/hooks/useVideoEvents";
import {
  getVideoStatus,
  type AspectRatio,
  type VideoStatusDto,
} from "@/lib/api";

interface WatchViewProps {
  jobId: string;
  videoId: string | null;
}

export function WatchView({ jobId, videoId }: WatchViewProps) {
  const live = useVideoEvents(jobId);
  const [meta, setMeta] = useState<Pick<
    VideoStatusDto,
    "title" | "aspectRatio" | "outputUrl"
  > | null>(null);

  useEffect(() => {
    if (!videoId) return;
    getVideoStatus(videoId)
      .then((v) =>
        setMeta({
          title: v.title,
          aspectRatio: v.aspectRatio,
          outputUrl: v.outputUrl,
        }),
      )
      .catch(() => {}); // Backend down — SSE state still renders the page.
  }, [videoId]);

  const aspectRatio: AspectRatio = meta?.aspectRatio ?? "16:9";
  // Prefer live URLs; fall back to the status snapshot (completed before SSE attach).
  const playlist = live.playlistUrl ?? meta?.outputUrl ?? null;
  const finished = live.outputUrl ?? (live.status === "completed" ? playlist : null);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> New video
        </Link>
        <Badge
          variant={
            live.status === "failed"
              ? "destructive"
              : live.status === "completed"
                ? "default"
                : "secondary"
          }
        >
          {live.status === "failed"
            ? "Failed"
            : live.status === "completed"
              ? "Completed"
              : live.status === "active"
                ? "Rendering"
                : "Connecting…"}
        </Badge>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        {meta?.title ?? "Rendering your video…"}
      </h1>

      {!videoId && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            This watch link is missing its video id.{" "}
            <Link href="/" className="underline">
              Start a new generation
            </Link>{" "}
            to get a working link.
          </CardContent>
        </Card>
      )}

      {live.status === "failed" && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Render failed</p>
              <p className="text-muted-foreground">
                {live.error ?? "Unknown error."} Retries happen automatically —
                if this persists, try a shorter prompt.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {live.status === "completed" && finished && (
        <Card className="border-green-600/30">
          <CardContent className="flex items-start gap-3 pt-6">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
            <p className="text-sm">
              Your video is ready. It keeps playing from the start — scrub back
              to rewatch any scene.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <VideoPlayer playlistPath={playlist} aspectRatio={aspectRatio} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Live progress</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineStepper
              stage={live.status === "completed" ? "done" : live.stage}
              progress={live.progress}
              completedScenes={live.completedScenes}
              totalScenes={live.totalScenes}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
