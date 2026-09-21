"use client";
import { motion } from "framer-motion";
import type { VisualStep } from "@/lib/visualize";
import { cn } from "@/lib/utils";

const stateColor: Record<string, string> = {
  default: "bg-zinc-800 border-zinc-700 text-zinc-100",
  active: "bg-amber-500/25 border-amber-400 text-amber-100",
  compare: "bg-blue-500/25 border-blue-400 text-blue-100",
  found: "bg-emerald-500/25 border-emerald-400 text-emerald-100",
  visited: "bg-zinc-700 border-zinc-500 text-zinc-300",
  path: "bg-purple-500/25 border-purple-400 text-purple-100",
};

export function ArrayStage({ step }: { step: VisualStep }) {
  const pointers = [...new Set(step.elements.map((e) => e.pointer).filter(Boolean))] as string[];
  return (
    <div data-testid="array-stage" className="flex flex-col items-center gap-6">
      <div className="flex gap-2">
        {pointers.map((p) => {
          const target = step.elements.find((e) => e.pointer === p);
          return target ? (
            <motion.div key={`pointer-${p}`} layoutId={`pointer-${p}`} transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="text-xs font-mono text-amber-300" style={{ transform: "translateX(0)" }}>
              {p} ▼
            </motion.div>
          ) : null;
        })}
      </div>
      <div className="flex gap-2">
        {step.elements.map((el) => (
          <div key={el.id} className={cn("size-14 rounded-xl border-2 flex flex-col items-center justify-center transition-colors duration-300", stateColor[el.state])}>
            <span className="font-mono font-bold">{el.value}</span>
            {el.indexLabel && <span className="text-[10px] opacity-70">{el.indexLabel}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
