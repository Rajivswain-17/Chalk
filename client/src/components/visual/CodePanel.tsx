"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function CodePanel({ lines, activeLine }: { lines: string[]; activeLine: number }) {
  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2 font-mono text-xs">
      {lines.map((line, i) => (
        <div key={i} className={cn("relative px-2 py-1 rounded", i === activeLine ? "text-amber-100" : "text-zinc-400")}>
          {i === activeLine && <motion.div layoutId="code-pill" className="absolute inset-0 bg-amber-500/15 border border-amber-500/40 rounded" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <span className="relative">{line}</span>
        </div>
      ))}
    </div>
  );
}
