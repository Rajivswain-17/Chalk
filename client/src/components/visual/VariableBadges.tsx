"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualVariable } from "@/lib/visualize";
import { cn } from "@/lib/utils";

export function VariableBadges({
  variables,
}: {
  variables: VisualVariable[];
}) {
  const [flashingVars, setFlashingVars] = useState<Record<string, boolean>>({});
  const prevValuesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const changed: Record<string, boolean> = {};
    let hasChange = false;

    for (const v of variables) {
      const strVal = String(v.value);
      const prev = prevValuesRef.current[v.name];
      if (prev !== undefined && prev !== strVal) {
        changed[v.name] = true;
        hasChange = true;
      }
      prevValuesRef.current[v.name] = strVal;
    }

    if (hasChange) {
      setFlashingVars(changed);
      const timer = setTimeout(() => {
        setFlashingVars({});
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [variables]);

  if (!variables || variables.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-5 py-2.5">
      {variables.map((v) => {
        const isFlashing = flashingVars[v.name];

        return (
          <span
            key={v.name}
            className={cn(
              "bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono transition-all duration-300 flex items-center gap-1 select-none",
              isFlashing
                ? "ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.3)] bg-amber-950/40 border-amber-500/50"
                : ""
            )}
          >
            <span className="text-neutral-400">{v.name}</span>
            <span className="text-neutral-600">=</span>
            <span className="text-amber-300 font-semibold">
              {String(v.value)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
