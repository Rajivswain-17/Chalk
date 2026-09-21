"use client";
import { cn } from "@/lib/utils";
export function StepDots({ total, index, onGo }: { total: number; index: number; onGo(n: number): void }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} aria-label={`Go to step ${i + 1}`} onClick={() => onGo(i)} className={cn("size-2 rounded-full transition-colors duration-300", i === index ? "bg-amber-400" : "bg-zinc-700")} />
      ))}
    </div>
  );
}
