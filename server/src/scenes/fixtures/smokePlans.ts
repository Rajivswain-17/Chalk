// server/src/scenes/fixtures/smokePlans.ts
import type { SceneStepPayload } from "../types";

/** Must-parse plan fragments (spec §4.4 schema smoke). */
export const VALID_PLANS: Record<string, SceneStepPayload[]> = {
  heart: [
    {
      sceneId: "heart",
      shotId: "overview",
      highlights: ["heart_red"],
      callouts: [{ anchorId: "a_red", text: "The center heart" }],
    },
    {
      sceneId: "heart",
      shotId: "red_closeup",
      highlights: ["heart_red", "heart_purple"],
      callouts: [
        { anchorId: "a_red", text: "Closest to camera" },
        { anchorId: "a_purple", text: "Top-left heart" },
      ],
    },
  ],
};

/** Must-REJECT payloads (spec §4.4): `scene` names the schema that must refuse them. */
export const INVALID_PLANS: { scene: string; name: string; payload: unknown }[] = [
  {
    scene: "heart",
    name: "cross-scene shotId",
    payload: { sceneId: "heart", shotId: "solar-system::orbit-1", highlights: [], callouts: [] },
  },
  {
    scene: "heart",
    name: "foreign sceneId",
    payload: { sceneId: "mars-base", shotId: "overview", highlights: [], callouts: [] },
  },
  {
    scene: "heart",
    name: "hallucinated part",
    payload: { sceneId: "heart", shotId: "overview", highlights: ["atrium"], callouts: [] },
  },
  {
    scene: "heart",
    name: "hallucinated anchor",
    payload: {
      sceneId: "heart",
      shotId: "overview",
      highlights: ["heart_red"],
      callouts: [{ anchorId: "ghost-anchor", text: "x" }],
    },
  },
  {
    scene: "heart",
    name: "strict unknown field",
    payload: { sceneId: "heart", shotId: "overview", highlights: [], callouts: [], cameraZoom: 3 },
  },
];
