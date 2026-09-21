import { apiFetch } from "@/lib/auth-client";

export type StageType = "array" | "tree" | "cards" | "flow";
export type ElementState = "default" | "active" | "compare" | "found" | "visited" | "path";
export interface StageElement { id: string; value: string; indexLabel?: string; state: ElementState; pointer?: string | null; }
export interface VisualVariable { name: string; value: string | number | null; }
export interface VisualStep {
  stepIndex: number; title: string; subtitle?: string; stageType: StageType;
  elements: StageElement[]; codeLines: string[]; activeLine: number;
  variables: VisualVariable[]; explanation: string;
}

export function fetchVisualization(prompt: string): Promise<{ steps: VisualStep[] }> {
  return apiFetch<{ steps: VisualStep[] }>("/api/visualize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }), csrf: true,
  });
}
