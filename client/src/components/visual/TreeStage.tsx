"use client";

import type { VisualStep } from "@/lib/visualize";
import { cn } from "@/lib/utils";

const nodeStateStyles: Record<string, string> = {
  active:
    "ring-2 ring-amber-400 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] bg-[#1c1917] scale-110",
  compare:
    "ring-2 ring-cyan-400 border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.4)] bg-[#0e1e26]",
  found:
    "ring-2 ring-emerald-400 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] bg-emerald-500/20",
  visited: "opacity-60 border-purple-500/50 text-purple-300 bg-[#161821]",
  path: "ring-2 ring-purple-400/70 border-purple-400 shadow-[0_0_16px_rgba(192,132,252,0.4)] bg-purple-500/15",
  default: "border-2 border-neutral-700 bg-[#161821] text-white",
};

export function TreeStage({ step }: { step: VisualStep }) {
  const elements = step.elements;
  const total = elements.length;

  if (total === 0) return null;

  const maxDepth = Math.max(0, Math.floor(Math.log2(total)));
  const levelHeight = 95;
  const minWidth = Math.max(520, Math.pow(2, maxDepth) * 105);
  const containerHeight = (maxDepth + 1) * levelHeight + 50;

  const getNodePos = (i: number) => {
    const depth = Math.floor(Math.log2(i + 1));
    const start = Math.pow(2, depth) - 1;
    const count = Math.pow(2, depth);
    const slot = i - start;
    const xPercent = ((slot + 0.5) / count) * 100;
    const yPx = 36 + depth * levelHeight;
    return { x: xPercent, y: yPx };
  };

  return (
    <div
      data-testid="tree-stage"
      className="w-full overflow-x-auto flex items-center justify-center p-4"
    >
      <div
        className="relative"
        style={{ width: `${minWidth}px`, height: `${containerHeight}px` }}
      >
        {/* SVG Edges */}
        <svg className="absolute inset-0 size-full pointer-events-none">
          {elements.map((el, i) => {
            if (i === 0) return null;
            const parentIdx = Math.floor((i - 1) / 2);
            if (parentIdx >= total) return null;

            const parentPos = getNodePos(parentIdx);
            const childPos = getNodePos(i);

            return (
              <line
                key={`edge-${elements[parentIdx].id}-${el.id}`}
                x1={`${parentPos.x}%`}
                y1={parentPos.y}
                x2={`${childPos.x}%`}
                y2={childPos.y}
                stroke="#52525b"
                strokeWidth={2}
                strokeDasharray="none"
              />
            );
          })}
        </svg>

        {/* Tree Nodes */}
        {elements.map((el, i) => {
          const pos = getNodePos(i);
          const stateClass = nodeStateStyles[el.state] || nodeStateStyles.default;

          return (
            <div
              key={el.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}px` }}
            >
              {/* Pointer indicator above node */}
              {el.pointer && (
                <div className="absolute -top-7 flex flex-col items-center select-none whitespace-nowrap shadow-[0_0_12px_rgba(251,191,36,0.5)]">
                  <span className="text-[11px] font-mono font-bold text-amber-400">
                    {el.pointer}
                  </span>
                  <span className="text-[10px] leading-none text-amber-400">
                    ▼
                  </span>
                </div>
              )}

              {/* Node circle */}
              <div
                className={cn(
                  "min-w-14 min-h-14 max-w-[110px] px-2 py-1 rounded-2xl flex items-center justify-center border-2 transition-all duration-500 ease-in-out select-none",
                  stateClass
                )}
              >
                <span
                  className={
                    el.value.length > 12
                      ? "break-words text-[11px] font-semibold leading-tight text-center px-1 font-mono"
                      : "font-mono text-lg font-bold"
                  }
                >
                  {el.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
