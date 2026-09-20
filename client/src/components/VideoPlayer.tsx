"use client";

// VideoPlayer — hls.js playback for the growing EVENT playlist.
// Attaches on playlistUrl arrival (first SCENE_READY ≈ Scene 1) and keeps
// playing across playlist refreshes; hls.js long-polls .m3u8 natively.
// Safari (native HLS) falls back to plain <video src>. Destroys hls on
// unmount/URL change so retries never stack duplicate loaders.

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import type { AspectRatio } from "@/lib/api";
import { toAbsoluteMediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  /** Server-provided playlist path (/hls/…); null until first scene is ready. */
  playlistPath: string | null;
  aspectRatio: AspectRatio;
}

export function VideoPlayer({ playlistPath, aspectRatio }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true); // Autoplay requires muted start.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playlistPath) return;
    setFailed(false);
    const url = toAbsoluteMediaUrl(playlistPath);

    // Native HLS (Safari/iOS): no library needed, handles EVENT playlists.
    if (!Hls.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => setMuted(true));
      return;
    }
    if (!Hls.isSupported()) {
      setFailed(true);
      return;
    }

    const hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      // Try audible first (user gesture may already unlock it); fall back to
      // muted autoplay rather than a stalled black frame.
      video.muted = false;
      video
        .play()
        .then(() => setMuted(false))
        .catch(() => {
          video.muted = true;
          setMuted(true);
          video.play().catch(() => {});
        });
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      // Growing playlist 404s mid-render are transient — resume loading.
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else setFailed(true);
      }
    });
    return () => hls.destroy();
  }, [playlistPath]);

  const unmute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    video.play().catch(() => {});
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-black",
        aspectRatio === "9:16" ? "mx-auto aspect-[9/16] max-w-sm" : "aspect-video",
      )}
    >
      <video
        ref={videoRef}
        controls
        playsInline
        className="size-full"
        aria-label="Generated whiteboard video"
      />
      {!playlistPath && !failed && (
        <div className="absolute inset-0 grid place-items-center text-sm text-zinc-400">
          First scene is rendering — playback starts automatically…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-zinc-300">
          This browser cannot play HLS. Try Chrome, Edge, or Safari.
        </div>
      )}
      {playlistPath && !failed && muted && (
        <button
          type="button"
          onClick={unmute}
          className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-lg hover:bg-zinc-200"
        >
          Tap to unmute
        </button>
      )}
    </div>
  );
}
