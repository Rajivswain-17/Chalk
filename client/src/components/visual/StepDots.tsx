"use client";

import { cn } from "@/lib/utils";

export function StepDots({
  total,
  index,
  onGo,
}: {
  total: number;
  index: number;
  onGo(n: number): void;
}) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }).map((_, i) => {
        const isCurrent = i === index;
        const isCompleted = i < index;

        return (
          <button
            key={i}
            aria-label={`Go to step ${i + 1}`}
            onClick={() => onGo(i)}
            className={cn(
              "w-2 h-2 rounded-full cursor-pointer transition-all duration-300 focus:outline-none",
              isCurrent
                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] scale-125"
                : isCompleted
                ? "bg-emerald-400 hover:opacity-80"
                : "bg-neutral-700 hover:bg-neutral-600"
            )}
          />
        );
      })}
    </div>
  );
}
