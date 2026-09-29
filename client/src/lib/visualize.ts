import { apiFetch } from "@/lib/auth-client";

export type StageType = "array" | "tree" | "cards" | "flow";
export type ElementState = "default" | "active" | "compare" | "found" | "visited" | "path";
export interface StageElement { id: string; value: string; indexLabel?: string; state: ElementState; pointer?: string | null; }
export interface VisualVariable { name: string; value: string | number | null; }
export interface VisualStep {
  stepIndex: number; title: string; subtitle?: string; stageType: StageType;
  elements: StageElement[]; codeLines: string[]; activeLine: number;
  variables: VisualVariable[]; explanation: string; calculation?: string;
}

/**
 * Per-step discriminant (spec 3.1). Algorithm-only for now: `ChalkStep` is a
 * union of one, so TS already enforces registry exhaustiveness. `SceneStep`
 * joins this union in Plan 3 with its renderer. The WIRE shape (`VisualStep`,
 * above) never changes — the server still emits untyped steps; the client
 * stamps `kind` at ingestion via normalizeSteps().
 */
export interface AlgorithmStep extends VisualStep { kind: "algorithm" }
export type ChalkStep = AlgorithmStep;

/**
 * Idempotent ingestion stamp (cache hydrate + fetch). Never overwrites an
 * existing kind, so future scene steps cached without re-derivation survive
 * re-normalization. Accepts pre-existing cache entries that lack `kind`.
 * (True branch spreads the narrowed `kind` back onto `s`: TS narrows the
 * property via truthiness, not the intersection reference itself.)
 */
export function normalizeSteps(
  raw: ReadonlyArray<VisualStep & { kind?: "algorithm" }>
): ChalkStep[] {
  return raw.map((s) =>
    s.kind ? { ...s, kind: s.kind } : { ...s, kind: "algorithm" as const }
  );
}

export function fetchVisualization(prompt: string): Promise<{ steps: VisualStep[] }> {
  return apiFetch<{ steps: VisualStep[] }>("/api/visualize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }), csrf: true,
  });
}
