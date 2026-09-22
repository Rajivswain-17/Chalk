"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CodePanel({
  lines,
  activeLine,
}: {
  lines: string[];
  activeLine: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in unsupported environments
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#12141c]">
      {/* Panel header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-neutral-800/50">
        <span className="text-xs font-bold text-neutral-500 tracking-wider">
          CONCEPT
        </span>
        <button
          onClick={handleCopy}
          className="text-neutral-500 hover:text-white cursor-pointer transition-colors flex items-center gap-1 text-xs"
          title="Copy code"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[10px] font-mono">
                Copied
              </span>
            </>
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="flex-1 p-4 overflow-y-auto overflow-x-hidden font-mono text-sm leading-relaxed max-h-[380px]">
        <div className="flex flex-col">
          {lines.map((line, i) => {
            const isActive = i === activeLine;

            return (
              <div
                key={i}
                className={cn(
                  "relative flex items-start gap-3 py-1 transition-all duration-300 rounded-r-md select-text",
                  isActive
                    ? "bg-amber-500/12 border-l-4 border-amber-500 pl-2 text-amber-200 shadow-[inset_0_0_40px_rgba(251,191,36,0.06)]"
                    : "text-neutral-300 pl-3"
                )}
              >
                {/* Sliding indicator pill */}
                {isActive && (
                  <motion.div
                    layoutId="code-active-pill"
                    className="absolute inset-0 bg-amber-500/12 border-l-4 border-amber-500 shadow-[inset_0_0_40px_rgba(251,191,36,0.06)] rounded-r-md pointer-events-none"
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 35,
                    }}
                  />
                )}

                {/* Line pointer marker & line number */}
                <span className="w-6 text-right text-xs select-none shrink-0 pt-0.5 flex items-center justify-end gap-1 font-mono">
                  {isActive ? (
                    <span className="text-amber-400 text-[10px] leading-none">
                      ▶
                    </span>
                  ) : null}
                  <span
                    className={
                      isActive ? "text-amber-400 font-bold" : "text-neutral-600"
                    }
                  >
                    {i + 1}
                  </span>
                </span>

                {/* Line content (wraps instead of forcing a horizontal scrollbar) */}
                <span className="relative z-10 flex-1 min-w-0 whitespace-pre-wrap break-words font-mono">
                  {line}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
