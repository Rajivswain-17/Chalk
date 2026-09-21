"use client";
import type { VisualStep } from "@/lib/visualize";
import { cn } from "@/lib/utils";

const nodeColor: Record<string, string> = {
  default: "bg-zinc-800 border-zinc-700 text-zinc-100",
  active: "bg-amber-500/25 border-amber-400 text-amber-100",
  compare: "bg-blue-500/25 border-blue-400 text-blue-100",
  found: "bg-emerald-500/25 border-emerald-400 text-emerald-100",
  visited: "bg-zinc-700 border-zinc-500 text-zinc-300",
  path: "bg-purple-500/25 border-purple-400 text-purple-100",
};

function pos(i: number): { x: number; y: number } {
  const depth = Math.floor(Math.log2(i + 1));
  const start = Math.pow(2, depth) - 1;
  const count = Math.pow(2, depth);
  return { x: ((i - start + 0.5) / count) * 100, y: 12 + depth * 26 };
}

export function TreeStage({ step }: { step: VisualStep }) {
  return (
    <div data-testid="tree-stage" className="relative w-full max-w-xl h-64">
      <svg className="absolute inset-0 size-full">
        {step.elements.map((el, i) => {
          if (i === 0) return null;
          const parent = pos(Math.floor((i - 1) / 2));
          const cur = pos(i);
          return <line key={`${step.elements[Math.floor((i - 1) / 2)].id}-${el.id}`} x1={`${parent.x}%`} y1={`${parent.y}%`} x2={`${cur.x}%`} y2={`${cur.y}%`} stroke="#52525b" strokeWidth={2} />;
        })}
      </svg>
      {step.elements.map((el, i) => {
        const p = pos(i);
        return (
          <div key={el.id} className={cn("absolute size-12 -translate-x-1/2 rounded-full border-2 flex items-center justify-center font-mono font-bold transition-colors duration-300", nodeColor[el.state])} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {el.value}
            {el.pointer && <span className="absolute -top-5 text-[10px] font-mono text-amber-300">{el.pointer}</span>}
          </div>
        );
      })}
    </div>
  );
}
