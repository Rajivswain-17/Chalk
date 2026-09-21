"use client";

// VideoPlayer  hls.js playback for the growing EVENT playlist.
// Attaches on playlistUrl arrival (first SCENE_READY / Step 1) and keeps
// playing across playlist refreshes; hls.js long-polls .m3u8 natively.
// Safari (native HLS) falls back to plain <video src>. Destroys hls on
// unmount/URL change so retries never stack duplicate loaders.

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import type { AspectRatio } from "@/lib/api";
import { toAbsoluteMediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  /** Server-provided playlist path (/hls/...); null until first scene is ready. */
  playlistPath: string | null;
  aspectRatio: AspectRatio;
}

export function VideoPlayer({ playlistPath, aspectRatio }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playlistPath) {
      setIsLoading(true);
      return;
    }
    setFailed(false);
    const url = toAbsoluteMediaUrl(playlistPath);

    // Native HLS (Safari/iOS): no library needed, handles EVENT playlists.
    if (!Hls.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.muted = true;
      video.play().catch(() => {});
      setIsLoading(false);
      return;
    }
    if (!Hls.isSupported()) {
      setFailed(true);
      setIsLoading(false);
      return;
    }

    // withCredentials: segment + playlist fetches carry session cookies
    const hls = new Hls({
      maxBufferLength: 30,
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
      },
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.muted = true;
      video.play().catch(() => {});
      setIsLoading(false);
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      // Growing playlist 404s mid-render are transient  resume loading.
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else setFailed(true);
      }
    });
    return () => hls.destroy();
  }, [playlistPath]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl bg-zinc-950 border border-zinc-800 shadow-2xl group",
        aspectRatio === "9:16" ? "mx-auto aspect-[9/16] max-w-sm" : "aspect-video"
      )}
    >
      <video
        ref={videoRef}
        controls
        playsInline
        muted
        loop
        className="size-full object-contain"
        aria-label="Chalk visual explainer animation"
      />

      {/* Zero Voice pill indicator */}
      <div className="absolute top-3 right-3 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-zinc-900/90 text-amber-300 border border-zinc-700/80 backdrop-blur-sm shadow-sm">
          Visual Explainer
        </span>
      </div>

      {!playlistPath && !failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/90 backdrop-blur-xs text-zinc-400 space-y-3">
          <div className="size-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-200">Rendering visual step 1...</p>
            <p className="text-xs text-zinc-400">Stream begins playing as soon as the first step is ready.</p>
          </div>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-zinc-300 bg-zinc-950">
          This browser cannot play HLS stream. Try Chrome, Edge, or Safari.
        </div>
      )}
    </div>
  );
}
