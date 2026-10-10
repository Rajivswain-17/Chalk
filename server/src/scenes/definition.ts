// server/src/scenes/definition.ts
// Curated, render-only projection of a scene for the client (spec §4.2 boundary,
// Ruling 1). Deliberately excludes keywords (routing lexicon), license (legal),
// status (routing), and asset bytes/tris — none of those may reach the client,
// and SCENES itself is never serialized.
import type { SceneManifest, Vec3 } from "./types";

export interface SceneDefinition {
  id: string;
  assetUrl: string;
  parts: { id: string; label: string }[];
  anchors: { id: string; partId: string; pos: Vec3 }[];
  shots: { id: string; label: string; pos: Vec3; target: Vec3; fov: number }[];
}

export function buildSceneDefinition(m: SceneManifest): SceneDefinition | null {
  if (m.asset.kind !== "mesh") return null; // procedural is a later plan
  return {
    id: m.id,
    assetUrl: m.asset.url,
    parts: m.parts.map((p) => ({ id: p.id, label: p.label })),
    anchors: m.anchors.map((a) => ({ id: a.id, partId: a.partId, pos: a.pos })),
    shots: m.shots.map((s) => ({
      id: s.id,
      label: s.label,
      pos: s.pos,
      target: s.target,
      fov: s.fov,
    })),
  };
}

/** Canonical serialization — the emit script and the drift check must agree. */
export function serializeDefinition(m: SceneManifest): string | null {
  const def = buildSceneDefinition(m);
  return def === null ? null : `${JSON.stringify(def, null, 2)}\n`;
}
