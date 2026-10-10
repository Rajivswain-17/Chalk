// client/src/lib/sceneDefinition.ts
import type { Vec3 } from "@/lib/visualize";
import heartJson from "./sceneDefinitions/heart.json";

/**
 * Curated render-only scene projection (Ruling 1). This is the ONLY
 * catalog-derived data that crosses to the client; it is generated from the
 * server catalog by `npm run scenes:definition` and must never be edited by
 * hand. It intentionally carries no keywords/license/status/bytes/tris.
 * Dev-only consumers (the Scene Workshop) use it; routed scene steps are
 * self-contained and need no definition (spec §4.2).
 */
export interface SceneDefinition {
  id: string;
  assetUrl: string;
  parts: { id: string; label: string }[];
  anchors: { id: string; partId: string; pos: Vec3 }[];
  shots: { id: string; label: string; pos: Vec3; target: Vec3; fov: number }[];
}

// JSON imports widen tuples to number[]; the generated file is validated
// against the projection server-side, so one cast at the boundary is enough.
export const SCENE_DEFINITIONS: Record<string, SceneDefinition> = {
  heart: heartJson as unknown as SceneDefinition,
};
