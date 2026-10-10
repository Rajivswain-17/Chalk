// client/src/lib/sceneFixtures/heartSequence.ts
// The first hand-sequenced scene plan (spec §8 rollout step 2): authored via the
// Scene Workshop, committed here so the renderer has a real multi-step plan
// before the Plan-4 router exists. Poses resolve from the generated definition.
import { SCENE_DEFINITIONS } from "@/lib/sceneDefinition";
import type { SceneCallout, SceneShot, SceneStep, Vec3 } from "@/lib/visualize";

const heart = SCENE_DEFINITIONS.heart;

function pickShot(id: string): SceneShot {
  const s = heart.shots.find((x) => x.id === id);
  if (!s) throw new Error(`heartSequence: unknown shot "${id}"`);
  return { pos: s.pos, target: s.target, fov: s.fov };
}

function pickCallout(anchorId: string, text: string): SceneCallout {
  const a = heart.anchors.find((x) => x.id === anchorId);
  if (!a) throw new Error(`heartSequence: unknown anchor "${anchorId}"`);
  return { anchorId: a.id, pos: a.pos as Vec3, text };
}

export const HEART_SEQUENCE: SceneStep[] = [
  {
    kind: "scene",
    stepIndex: 0,
    title: "Hearts",
    subtitle: "Five hearts, one composition",
    explanation:
      "We are looking at a cluster of five hearts. Each one is a separate part of the model, and later steps will point the camera at individual pieces.",
    sceneId: heart.id,
    shotId: "overview",
    shot: pickShot("overview"),
    assetUrl: heart.assetUrl,
    highlights: [],
    callouts: [],
    notes: ["Wide establishing shot", "All five parts are in frame"],
  },
  {
    kind: "scene",
    stepIndex: 1,
    title: "Hearts",
    subtitle: "The center heart",
    explanation:
      "The red heart sits at the center of the composition. A closeup shot brings it forward and the highlight glow marks it.",
    sceneId: heart.id,
    shotId: "red_closeup",
    shot: pickShot("red_closeup"),
    assetUrl: heart.assetUrl,
    highlights: ["heart_red"],
    callouts: [pickCallout("a_red", "Center heart")],
    notes: ["Camera moves in on the center part", "Emissive glow marks the active part"],
  },
  {
    kind: "scene",
    stepIndex: 2,
    title: "Hearts",
    subtitle: "Top-right and top-left",
    explanation:
      "Two hearts sit above the center. The top-down shot lays the whole arrangement out flat so their relative positions are clear.",
    sceneId: heart.id,
    shotId: "top_down",
    shot: pickShot("top_down"),
    assetUrl: heart.assetUrl,
    highlights: ["heart_pink", "heart_purple"],
    callouts: [pickCallout("a_pink", "Top-right"), pickCallout("a_purple", "Top-left")],
    notes: ["Tilted top-down view (never straight down)", "Two highlights, two callouts"],
  },
  {
    kind: "scene",
    stepIndex: 3,
    title: "Hearts",
    subtitle: "The bottom pair",
    explanation:
      "The green and blue hearts close the ring at the bottom. With every part named, the composition is complete.",
    sceneId: heart.id,
    shotId: "overview",
    shot: pickShot("overview"),
    assetUrl: heart.assetUrl,
    highlights: ["heart_green", "heart_blue"],
    callouts: [pickCallout("a_green", "Bottom-left"), pickCallout("a_blue", "Bottom-right")],
    notes: ["Return to the wide shot", "Remaining parts highlighted and named"],
  },
];
