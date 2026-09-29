"use client";
import type { ReactNode } from "react";
import type { ChalkStep } from "@/lib/visualize";
import { ArrayStage } from "./ArrayStage";
import { TreeStage } from "./TreeStage";
import { CodePanel } from "./CodePanel";

export type StageLayout = "split";

export interface StageEntry {
  layout: StageLayout;
  renderStage: (step: ChalkStep) => ReactNode;
  renderInspector: (step: ChalkStep) => ReactNode;
}

/** Exact grid strings, moved verbatim from VisualExplainer — interpolation
 *  must produce byte-identical class output for the algorithm path. */
export const LAYOUT_CLASSES: Record<StageLayout, string> = {
  split: "grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0",
};

export const STAGE_REGISTRY = {
  algorithm: {
    layout: "split",
    renderStage: (step) =>
      step.stageType === "tree" ? <TreeStage step={step} /> : <ArrayStage step={step} />,
    renderInspector: (step) => (
      <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
    ),
  },
} satisfies Record<ChalkStep["kind"], StageEntry>;
