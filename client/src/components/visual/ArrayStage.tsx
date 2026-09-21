"use client";

import { motion } from "framer-motion";
import type { VisualStep } from "@/lib/visualize";
import { cn } from "@/lib/utils";

const pointerColorMap: Record<
  string,
  { color: string; shadow: string }
> = {
  left: {
    color: "text-amber-400",
    shadow: "shadow-[0_0_12px_rgba(251,191,36,0.5)]",
  },
  right: {
    color: "text-cyan-400",
    shadow: "shadow-[0_0_12px_rgba(34,211,238,0.5)]",
  },
  curr: {
    color: "text-purple-400",
    shadow: "shadow-[0_0_12px_rgba(192,132,252,0.5)]",
  },
  current: {
    color: "text-purple-400",
    shadow: "shadow-[0_0_12px_rgba(192,132,252,0.5)]",
  },
  mid: {
    color: "text-emerald-400",
    shadow: "shadow-[0_0_12px_rgba(52,211,153,0.5)]",
  },
  i: {
    color: "text-amber-400",
    shadow: "shadow-[0_0_12px_rgba(251,191,36,0.5)]",
  },
  j: {
    color: "text-cyan-400",
    shadow: "shadow-[0_0_12px_rgba(34,211,238,0.5)]",
  },
  low: {
    color: "text-amber-400",
    shadow: "shadow-[0_0_12px_rgba(251,191,36,0.5)]",
  },
  high: {
    color: "text-cyan-400",
    shadow: "shadow-[0_0_12px_rgba(34,211,238,0.5)]",
  },
};

function getPointerStyle(name: string) {
  const lower = name.toLowerCase().trim();
  return (
    pointerColorMap[lower] || {
      color: "text-amber-400",
      shadow: "shadow-[0_0_12px_rgba(251,191,36,0.5)]",
    }
  );
}

function parsePointers(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,&/ ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const stateStyles: Record<string, string> = {
  active:
    "ring-2 ring-amber-400 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] bg-[#1c1917]",
  compare:
    "ring-2 ring-cyan-400 border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.4)] bg-[#0e1e26]",
  found:
    "ring-2 ring-emerald-400 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] bg-emerald-500/20",
  visited: "opacity-60 border-neutral-700 text-neutral-400 bg-[#161821]",
  path: "ring-2 ring-purple-400/70 border-purple-400 shadow-[0_0_16px_rgba(192,132,252,0.4)] bg-purple-500/15",
  default: "border-2 border-neutral-700 bg-[#161821]",
};

export function ArrayStage({ step }: { step: VisualStep }) {
  const isCompact = step.elements.length > 8;

  return (
    <div
      data-testid="array-stage"
      className="w-full flex flex-col items-center justify-center p-2"
    >
      <div className="w-full overflow-x-auto pb-4 pt-2 flex items-center justify-center">
        <div className="flex flex-row items-start justify-center gap-3 flex-nowrap min-w-max px-4">
          {step.elements.map((el, i) => {
            const pointers = parsePointers(el.pointer);
            const stateClass = stateStyles[el.state] || stateStyles.default;

            return (
              <div
                key={el.id}
                className="flex flex-col items-center justify-start shrink-0"
              >
                {/* Array Box */}
                <div
                  className={cn(
                    "rounded-xl flex items-center justify-center font-bold text-white transition-all duration-500 ease-in-out select-none",
                    isCompact ? "w-12 h-12 text-lg" : "w-16 h-16 text-2xl",
                    stateClass
                  )}
                >
                  <span className="font-mono">{el.value}</span>
                </div>

                {/* Index Label */}
                <div className="text-xs font-mono text-neutral-500 mt-1.5 text-center select-none">
                  {el.indexLabel || `[${i}]`}
                </div>

                {/* Pointer arrows container */}
                <div className="min-h-[44px] flex flex-col items-center justify-start gap-1 mt-1">
                  {pointers.map((name) => {
                    const style = getPointerStyle(name);
                    return (
                      <motion.div
                        key={`pointer-${name}`}
                        layoutId={`pointer-${name}`}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 30,
                        }}
                        className={cn(
                          "flex flex-col items-center select-none",
                          style.shadow
                        )}
                      >
                        <span className={cn("text-xs leading-none", style.color)}>
                          ▲
                        </span>
                        <span
                          className={cn(
                            "text-[11px] font-mono font-bold leading-tight",
                            style.color
                          )}
                        >
                          {name}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
