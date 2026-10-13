"use client";

import { Compass } from "lucide-react";

/**
 * Honest "we can't show that yet" card (spec §6.1). Deliberately NOT the red
 * error+retry panel: nothing failed, the question simply has no scene. Never
 * persisted — it lives in component state so a refresh re-asks.
 */
export function UnsupportedCard({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/60 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Compass className="size-4 text-amber-400" />
        No 3D scene for that yet
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        We can&apos;t build a scene for that one right now. Try one of these
        instead, or rephrase — algorithm and systems questions always work.
      </p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((title) => (
            <button
              key={title}
              type="button"
              onClick={() => onPick(`Explain ${title} step by step.`)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
