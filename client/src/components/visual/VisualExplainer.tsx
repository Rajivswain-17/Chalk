"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { PencilLine } from "lucide-react";
import type { VisualStep } from "@/lib/visualize";
import { useVisualPlayer } from "@/hooks/useVisualPlayer";
import { ArrayStage } from "./ArrayStage";
import { TreeStage } from "./TreeStage";
import { CodePanel } from "./CodePanel";
import { VariableBadges } from "./VariableBadges";
import { ControlsBar } from "./ControlsBar";
import { StepDots } from "./StepDots";

export function VisualExplainer({
  steps,
  title,
}: {
  steps: VisualStep[];
  title: string;
}) {
  const player = useVisualPlayer(steps.length);
  const step = steps[player.index];
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        player.next();
      } else if (e.key === "ArrowLeft") {
        player.prev();
      } else if (e.key === " ") {
        e.preventDefault();
        player.togglePlay();
      } else if (e.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  };

  if (!step) return null;

  return (
    <div
      ref={containerRef}
      className="w-full max-w-6xl xl:max-w-7xl mx-auto min-h-[520px] bg-[#0c0d12] border border-neutral-800/60 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
    >
      {/* 1. TOP HEADER BAR */}
      <header className="h-14 px-5 flex items-center justify-between border-b border-neutral-800/50 bg-[#0e1018]">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="font-semibold text-white text-base truncate">
            {step.title || title}
          </span>
          {step.subtitle && (
            <span className="bg-neutral-800 text-neutral-400 text-xs px-2 py-0.5 rounded-full truncate hidden sm:inline-block">
              {step.subtitle}
            </span>
          )}
        </div>

        {/* Progress dots in center */}
        <div className="hidden sm:flex items-center justify-center">
          <StepDots
            total={steps.length}
            index={player.index}
            onGo={player.goTo}
          />
        </div>

        {/* Step indicator pill */}
        <div className="bg-neutral-800 text-neutral-300 text-xs font-mono px-2.5 py-1 rounded-md shrink-0">
          Step {player.index + 1} / {steps.length}
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA (Wide 2-Column Studio Grid) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0">
        {/* LEFT COLUMN: Visual Stage (Never unmounts) */}
        <div
          data-testid="canvas"
          className="p-8 flex flex-col items-center justify-center relative overflow-hidden bg-[#0c0d12] min-h-[380px]"
        >
          {step.stageType === "tree" ? (
            <TreeStage step={step} />
          ) : (
            <ArrayStage step={step} />
          )}
        </div>

        {/* RIGHT COLUMN: Code Panel */}
        <div className="border-t lg:border-t-0 lg:border-l border-neutral-800/50 bg-[#12141c] flex flex-col">
          <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
        </div>
      </div>

      {/* 3. VARIABLE BADGES ROW (if variables exist) */}
      {step.variables && step.variables.length > 0 && (
        <div className="border-t border-neutral-800/50 bg-[#0e1018]">
          <VariableBadges variables={step.variables} />
        </div>
      )}

      {/* 4. EXPLANATION BAR */}
      <div className="px-5 py-3 border-t border-neutral-800/50 bg-[#0e1018] flex items-start gap-3">
        <PencilLine className="size-4 text-amber-400 mt-0.5 shrink-0" />
        {step.activeLine !== undefined && step.activeLine >= 0 && (
          <span className="bg-amber-500/20 text-amber-400 text-xs font-mono font-bold px-2 py-0.5 rounded-md shrink-0">
            Line {step.activeLine + 1}
          </span>
        )}
        <motion.p
          key={step.stepIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-neutral-300 text-sm leading-relaxed"
        >
          {step.explanation}
        </motion.p>
      </div>

      {/* 5. PLAYER CONTROLS TOOLBAR */}
      <ControlsBar
        index={player.index}
        total={steps.length}
        playing={player.playing}
        speed={player.speed}
        onPrev={player.prev}
        onNext={player.next}
        onToggle={player.togglePlay}
        onSpeed={player.cycleSpeed}
        onScrub={player.goTo}
        onFullscreen={toggleFullscreen}
      />
    </div>
  );
}
