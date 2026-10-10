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
 * Per-step discriminant (spec 3.1). `ChalkStep` is a two-member union
 * (`algorithm` | `scene`); `satisfies Record<ChalkStep["kind"], StageEntry>` in
 * stageRegistry.tsx enforces that every member has a stage + inspector entry.
 * The WIRE shape (`VisualStep`, above) never changes — the server still emits
 * untyped steps; the client stamps `kind` at ingestion via normalizeSteps().
 */
export interface AlgorithmStep extends VisualStep { kind: "algorithm" }

export type Vec3 = [x: number, y: number, z: number];

/** Expanded shot pose (spec §4.2): the server resolves shotId → pos/target/fov
 *  before the step reaches the browser, so the renderer needs no catalog data. */
export interface SceneShot {
  pos: Vec3;
  target: Vec3;
  fov: number;
}

/** A callout pin: expanded anchor coordinates + authored text (spec §3.1/§4.2). */
export interface SceneCallout {
  anchorId: string;
  pos: Vec3;
  text: string;
}

/**
 * Scene step (spec §3.1). Self-contained per §4.2: `shot` and `callouts[].pos`
 * carry expanded geometry, so cache hydration stays steps-only (§3.3) and
 * `SCENES` never needs to reach the client. `shotId`/`anchorId` are retained as
 * provenance/labels (inspector, workshop round-trip).
 */
export interface SceneStep {
  kind: "scene";
  stepIndex: number;
  title: string;
  subtitle?: string;
  explanation: string;
  sceneId: string;
  shotId: string;
  shot: SceneShot;
  assetUrl: string;
  /** Part IDs; equal to the GLB mesh-node names (validate enforces this). */
  highlights: string[];
  callouts: SceneCallout[];
  /** SceneInspector content (Zone 3 slot, spec §3.2). */
  notes?: string[];
}

export type ChalkStep = AlgorithmStep | SceneStep;

/**
 * Idempotent ingestion stamp (cache hydrate + fetch). Preserves an existing
 * `kind` of any union member (scene steps survive re-normalization) and stamps
 * pre-union cache entries `"algorithm"`. Accepts both the untyped wire shape
 * (`VisualStep`) and already-stamped `ChalkStep`s.
 */
export function normalizeSteps(
  raw: ReadonlyArray<VisualStep | ChalkStep>
): ChalkStep[] {
  return raw.map((s) =>
    "kind" in s && s.kind ? s : { ...s, kind: "algorithm" as const }
  );
}

export function fetchVisualization(prompt: string): Promise<{ steps: VisualStep[] }> {
  return apiFetch<{ steps: VisualStep[] }>("/api/visualize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }), csrf: true,
  });
}
