"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { PencilLine } from "lucide-react";
import type { VisualStep, VisualVariable } from "@/lib/visualize";
import { useVisualPlayer } from "@/hooks/useVisualPlayer";
import { ArrayStage } from "./ArrayStage";
import { TreeStage } from "./TreeStage";
import { CodePanel } from "./CodePanel";
import { LiveMathBadge, VariableBadges } from "./VariableBadges";
import { ControlsBar } from "./ControlsBar";
import { StepDots } from "./StepDots";

const POINTER_NAMES = new Set([
  "i",
  "j",
  "k",
  "lo",
  "low",
  "hi",
  "high",
  "mid",
  "left",
  "right",
  "curr",
  "current",
  "start",
  "end",
  "l",
  "r",
]);

/** Problem name from step 1's title, stripping the 3-phase prefix and a trailing "Problem". */
function problemNameOf(raw: string, fallback: string) {
  const base = (raw || fallback || "Problem").trim();
  return (
    base
      .replace(/^\s*(problem breakdown|problem statement|overview)\s*[:\-\u2013\u2014]\s*/i, "")
      .replace(/\s*problem\s*$/i, "")
      .trim() || base
  );
}

/** The constraint badge: a target-like variable, else the first non-pointer variable. */
function constraintOf(variables?: VisualVariable[]) {
  if (!variables?.length) return null;
  return (
    variables.find((v) => v.name.toLowerCase().includes("target")) ??
    variables.find((v) => !POINTER_NAMES.has(v.name.toLowerCase().trim())) ??
    null
  );
}

/**
 * Persistent problem & goal banner: pinned to the top of the visual stage for
 * EVERY step. It is derived from step 1 only, so it never re-animates as the
 * player advances and the viewer always sees the input, the constraint and the
 * real goal.
 */
function ProblemBanner({
  step,
  fallbackTitle,
}: {
  step: VisualStep;
  fallbackTitle: string;
}) {
  const problemName = problemNameOf(step.title, fallbackTitle);
  const target = constraintOf(step.variables);
  const values = step.elements.map((el) => el.value);
  const allNumeric =
    values.length > 0 &&
    values.every((v) => v.trim() !== "" && !isNaN(Number(v)));
  const input =
    step.stageType === "array" && values.length > 0
      ? `Input: ${allNumeric ? "nums = " : ""}[${values.join(", ")}]`
      : null;

  return (
    <div className="w-full px-5 py-3 bg-[#12141c] border-b border-neutral-800/60 flex items-center justify-between flex-wrap gap-2">
      <span className="text-base font-bold text-white tracking-wide">
        {problemName}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {input && (
          <span className="bg-neutral-800/90 text-neutral-300 text-xs font-mono px-3 py-1 rounded-md border border-neutral-700 break-all">
            {input}
          </span>
        )}
        {target && (
          <span className="bg-amber-500/15 text-amber-300 text-xs font-mono font-bold px-3 py-1 rounded-md border border-amber-500/30">
            {target.name.toLowerCase().includes("target") ? "Target" : target.name}:{" "}
            {String(target.value)}
          </span>
        )}
        {step.subtitle && (
          <span className="bg-emerald-500/15 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-md border border-emerald-500/30">
            Goal: {step.subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

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
  const overview = steps[0];

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
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0">
        {/* LEFT COLUMN: Visual Stage (Never unmounts) */}
        <div className="flex flex-col bg-[#0c0d12] min-h-[380px]">
          {overview && <ProblemBanner step={overview} fallbackTitle={title} />}
          <div
            data-testid="canvas"
            className="flex-1 p-8 flex flex-col items-center justify-center gap-6 relative overflow-hidden"
          >
            {step.stageType === "tree" ? (
              <TreeStage step={step} />
            ) : (
              <ArrayStage step={step} />
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Code Panel */}
        <div className="border-t lg:border-t-0 lg:border-l border-neutral-800/50 bg-[#12141c] flex flex-col">
          <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
        </div>
      </div>

      {/* 3. LIVE MATH / CALCULATION BADGE (below the canvas stage) */}
      {step.calculation && (
        <div className="border-t border-neutral-800/50 bg-[#0e1018] px-5 py-3">
          <LiveMathBadge
            calculation={step.calculation}
            variables={step.variables}
          />
        </div>
      )}

      {/* 4. VARIABLE BADGES ROW (if variables exist) */}
      {step.variables && step.variables.length > 0 && (
        <div className="border-t border-neutral-800/50 bg-[#0e1018]">
          <VariableBadges variables={step.variables} />
        </div>
      )}

      {/* 5. EXPLANATION BAR */}
      <div className="min-h-[72px] px-6 py-4 bg-[#0e1018] border-t border-neutral-800/60 flex items-start gap-4">
        <PencilLine className="size-5 text-amber-400 mt-0.5 shrink-0" />
        {step.activeLine !== undefined && step.activeLine >= 0 && (
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
            Line {step.activeLine + 1}
          </span>
        )}
        <motion.p
          key={step.stepIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-base sm:text-lg font-medium text-neutral-200 leading-relaxed max-w-5xl select-text"
        >
          {step.explanation}
        </motion.p>
      </div>

      {/* 6. PLAYER CONTROLS TOOLBAR */}
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
