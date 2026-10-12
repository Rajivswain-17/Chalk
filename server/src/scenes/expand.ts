// server/src/scenes/expand.ts
// Server-side ID expansion (spec §4.2): the plan carries prose + catalog IDs
// only, and this module resolves them to wire geometry in a single pass.
// Every ID lookup is a hard failure — a hallucinated scene/shot/anchor id
// throws a named SCENE_* error (status 502) rather than silently dropping
// or defaulting the step.

import { z } from "zod";
import { sceneStepSchema } from "../validators/visualize";
import type { SceneManifest, SceneStepPayload } from "./types";

/** Resolved scene step as it crosses the wire: pose attached, IDs still visible. */
export type SceneStepWire = z.infer<typeof sceneStepSchema>;

/** Throws a named SCENE_* error the route layer maps to HTTP 502. */
function fail(message: string): never {
  throw Object.assign(new Error(message), { status: 502 });
}

export interface ScenePlanEntry {
  title: string;
  subtitle?: string;
  explanation: string;
  notes?: string[];
  payload: SceneStepPayload;
}

export function expandSceneSteps(
  m: SceneManifest,
  entries: ScenePlanEntry[],
): SceneStepWire[] {
  if (m.asset.kind !== "mesh") fail(`SCENE_UNSUPPORTED_ASSET: ${m.id}`);
  // Captured as a local: the guard's narrowing of `m.asset` (a property
  // access) does not flow into the map callback below.
  const assetUrl = m.asset.url;
  const shots = new Map(m.shots.map((shot) => [shot.id, shot]));
  const anchors = new Map(m.anchors.map((anchor) => [anchor.id, anchor]));

  return entries.map((entry, index) => {
    const { payload } = entry;
    if (payload.sceneId !== m.id) fail(`SCENE_ID_MISMATCH: ${payload.sceneId} != ${m.id}`);
    const shot = shots.get(payload.shotId);
    if (!shot) fail(`SCENE_UNKNOWN_SHOT: ${payload.shotId}`);

    const callouts = payload.callouts.map((callout) => {
      const anchor = anchors.get(callout.anchorId);
      if (!anchor) fail(`SCENE_UNKNOWN_ANCHOR: ${callout.anchorId}`);
      return { anchorId: anchor.id, pos: anchor.pos, text: callout.text.trim() };
    });

    return {
      kind: "scene",
      stepIndex: index,
      title: entry.title,
      subtitle: entry.subtitle,
      explanation: entry.explanation,
      sceneId: m.id,
      shotId: shot.id,
      shot: { pos: shot.pos, target: shot.target, fov: shot.fov },
      assetUrl,
      highlights: [...payload.highlights],
      callouts,
      notes: entry.notes,
    };
  });
}
