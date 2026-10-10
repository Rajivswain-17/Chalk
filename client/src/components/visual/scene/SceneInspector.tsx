"use client";

import type { SceneStep } from "@/lib/visualize";

/**
 * Zone 3 slot for scene steps (spec §3.2): renders `notes[]` with the existing
 * amber line-pill styling plus the step's callout list. Not a fork of CodePanel
 * — a distinct inspector selected by the registry.
 */
export function SceneInspector({ step }: { step: SceneStep }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">
        Scene · {step.sceneId} · {step.shotId}
      </div>

      {step.notes && step.notes.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {step.notes.map((note, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-neutral-200 leading-relaxed">
                {note}
              </span>
            </li>
          ))}
        </ol>
      )}

      {step.callouts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-400">Callouts</span>
          {step.callouts.map((c) => (
            <div
              key={c.anchorId}
              className="text-xs font-mono px-3 py-1.5 rounded-md bg-[#12141c] border border-neutral-800 text-neutral-300"
            >
              <span className="text-amber-300">{c.anchorId}</span> — {c.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
