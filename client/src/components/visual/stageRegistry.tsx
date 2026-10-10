"use client";
import type { ReactNode } from "react";
import type { ChalkStep } from "@/lib/visualize";
import { ArrayStage } from "./ArrayStage";
import { TreeStage } from "./TreeStage";
import { CodePanel } from "./CodePanel";
import dynamic from "next/dynamic";
import { SceneInspector } from "./scene/SceneInspector";

// Lazy chunk (spec §3.4): three/fiber/drei load ONLY on the first scene step.
const Scene3DStage = dynamic(() => import("./scene/Scene3DStage"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
      Loading 3D scene…
    </div>
  ),
});

export type StageLayout = "split" | "scene";

export interface StageEntry {
  layout: StageLayout;
  renderStage: (step: ChalkStep) => ReactNode;
  renderInspector: (step: ChalkStep) => ReactNode;
}

/** Exact grid strings, moved verbatim from VisualExplainer — interpolation
 *  must produce byte-identical class output for the algorithm path. */
export const LAYOUT_CLASSES: Record<StageLayout, string> = {
  split: "grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0",
  // Full-bleed single column: stage on top, inspector slot below (spec §3.2).
  scene: "grid grid-cols-1",
};

export const STAGE_REGISTRY = {
  algorithm: {
    layout: "split",
    renderStage: (step) =>
      step.kind === "algorithm"
        ? step.stageType === "tree"
          ? <TreeStage step={step} />
          : <ArrayStage step={step} />
        : null,
    renderInspector: (step) =>
      step.kind === "algorithm" ? (
        <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
      ) : null,
  },
  scene: {
    layout: "scene",
    renderStage: (step) =>
      step.kind === "scene" ? <Scene3DStage step={step} /> : null,
    renderInspector: (step) =>
      step.kind === "scene" ? <SceneInspector step={step} /> : null,
  },
} satisfies Record<ChalkStep["kind"], StageEntry>;
