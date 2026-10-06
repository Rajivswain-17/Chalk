// server/src/scenes/types.ts
// Scene catalog types — spec §4.1. Server-owned: never sent to the client (§4.2).

export type Vec3 = [x: number, y: number, z: number];

/** Procedural scene recipe (solar system, lattices, waves) — spec §4.1 asset union. */
export interface ProcRecipe {
  generator: "solar-system" | "lattice" | "wave";
  params: Record<string, number | string>;
}

export interface SceneManifest {
  /** Stable slug; must equal its key in SCENES (validate enforces). */
  id: string;
  /** wip → routes to the fallback ladder, never renders (spec §4.1). */
  status: "wip" | "live";
  asset:
    | { kind: "mesh"; url: string; bytes: number; tris: number }
    | { kind: "procedural"; recipe: ProcRecipe };
  /** Selectable parts → GLB mesh-node names (mesh scenes), become z.enum IDs. */
  parts: { id: string; label: string }[];
  /** Callout anchor points; pos in normalized world units (spec §4.1). */
  anchors: { id: string; partId: string; pos: Vec3 }[];
  /** Shot library the sequencer picks from (spec §4.1). */
  shots: { id: string; label: string; pos: Vec3; target: Vec3; fov: number }[];
  /** Routing lexicon consumed by the Plan-4 router (spec §4.1). */
  keywords: string[];
  /** CC0/PD only; attribution required (spec §4.3, §10.2 — ruling 1). */
  license: { source: string; license: "CC0" | "PD"; attribution: string };
}

/** ID-domain step the LLM emits; coords expanded server-side (spec §4.2). */
export interface SceneStepPayload {
  sceneId: string;
  shotId: string;
  highlights: string[];
  callouts: { anchorId: string; text: string }[];
}
