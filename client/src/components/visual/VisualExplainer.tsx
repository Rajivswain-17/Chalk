"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { VisualStep } from "@/lib/visualize";
import { useVisualPlayer } from "@/hooks/useVisualPlayer";
import { ArrayStage } from "./ArrayStage";
import { TreeStage } from "./TreeStage";
import { CodePanel } from "./CodePanel";
import { VariableBadges } from "./VariableBadges";
import { CaptionBar } from "./CaptionBar";
import { ControlsBar } from "./ControlsBar";
import { StepDots } from "./StepDots";

export function VisualExplainer({ steps, title }: { steps: VisualStep[]; title: string }) {
  const player = useVisualPlayer(steps.length);
  const step = steps[player.index];
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") player.next();
      if (e.key === "ArrowLeft") player.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boxRef.current?.requestFullscreen();
  };

  if (!step) return null;
  return (
    <div ref={boxRef} className="bg-[#0d0f14] text-zinc-100 rounded-xl overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-sm font-medium">{title}</span>
        <StepDots total={steps.length} index={player.index} onGo={player.goTo} />
      </header>
      <div data-testid="canvas" className="min-h-64 flex items-center justify-center p-6">
        {step.stageType === "tree" ? <TreeStage step={step} /> : <ArrayStage step={step} />}
      </div>
      <div className="grid md:grid-cols-2 gap-3 px-4">
        <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
        <VariableBadges variables={step.variables} />
      </div>
      <CaptionBar title={step.title} subtitle={step.subtitle} explanation={step.explanation} />
      <ControlsBar index={player.index} total={steps.length} playing={player.playing}
        speed={player.speed} onPrev={player.prev} onNext={player.next}
        onToggle={player.togglePlay} onSpeed={player.cycleSpeed} onScrub={player.goTo} onFullscreen={toggleFullscreen} />
      <motion.div key={step.stepIndex} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} />
    </div>
  );
}
