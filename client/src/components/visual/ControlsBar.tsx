"use client";
import { useRef } from "react";
import { Maximize, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

export function ControlsBar(props: {
  index: number;
  total: number;
  playing: boolean;
  speed: number;
  onPrev(): void;
  onNext(): void;
  onToggle(): void;
  onSpeed(): void;
  onScrub(n: number): void;
  onFullscreen(): void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const last = Math.max(props.total - 1, 0);
  const progress = last > 0 ? (props.index / last) * 100 : 0;

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || last === 0) return;
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    props.onScrub(Math.round(ratio * last));
  };

  const iconBtn =
    "w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors";

  return (
    <div className="h-14 px-4 flex items-center gap-3 border-t border-neutral-800/50 bg-[#0a0b10]">
      <button className={iconBtn} onClick={() => props.onScrub(0)} aria-label="Replay from first step">
        <RotateCcw className="size-4" />
      </button>
      <button
        className={`${iconBtn} disabled:opacity-30 disabled:pointer-events-none`}
        onClick={props.onPrev}
        disabled={props.index === 0}
        aria-label="Previous step"
      >
        <SkipBack className="size-4" />
      </button>
      <button
        className="w-11 h-11 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center shadow-lg shadow-white/10 transition-all"
        onClick={props.onToggle}
        aria-label={props.playing ? "Pause" : "Play"}
      >
        {props.playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5 ml-0.5" fill="currentColor" />}
      </button>
      <button
        className={`${iconBtn} disabled:opacity-30 disabled:pointer-events-none`}
        onClick={props.onNext}
        disabled={props.index >= last}
        aria-label="Next step"
      >
        <SkipForward className="size-4" />
      </button>

      {/* Custom scrubber — click anywhere on the track to seek */}
      <div className="flex-1 mx-3 group">
        <div
          ref={trackRef}
          onClick={seek}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={props.index}
          aria-label="Step progress"
          tabIndex={0}
          className="h-1.5 bg-neutral-800 rounded-full relative overflow-hidden cursor-pointer focus:outline-none"
        >
          <div
            className="absolute left-0 top-0 h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
      </div>

      <button
        className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono font-bold px-2.5 py-1 rounded-md cursor-pointer transition-colors"
        onClick={props.onSpeed}
        aria-label="Playback speed"
      >
        {props.speed}x
      </button>
      <button className={iconBtn} onClick={props.onFullscreen} aria-label="Toggle fullscreen">
        <Maximize className="size-4" />
      </button>
    </div>
  );
}
