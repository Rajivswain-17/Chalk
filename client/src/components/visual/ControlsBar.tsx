"use client";
export function ControlsBar(props: { index: number; total: number; playing: boolean; speed: number; canPrev?: boolean; canNext?: boolean; onPrev(): void; onNext(): void; onToggle(): void; onSpeed(): void; onScrub(n: number): void; onFullscreen(): void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800">
      <button onClick={props.onPrev} disabled={props.index === 0}>Prev</button>
      <button onClick={props.onToggle}>{props.playing ? "Pause" : "Play"}</button>
      <button onClick={props.onNext} disabled={props.index >= props.total - 1}>Next</button>
      <button onClick={props.onSpeed}>{props.speed}x</button>
      <input type="range" min={0} max={Math.max(props.total - 1, 0)} value={props.index} onChange={(e) => props.onScrub(Number(e.target.value))} className="flex-1" />
      <button onClick={props.onFullscreen}>Fullscreen</button>
    </div>
  );
}
