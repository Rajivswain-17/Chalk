// server/src/scenes/catalog.ts
import type { SceneManifest } from "./types";

/** Single source of truth for scenes (spec §4.1). Never sent to the client (§4.2). */
export const SCENES: Record<string, SceneManifest> = {
  heart: {
    id: "heart",
    status: "live", // ruling 4: no router exists yet; smoke gate needs live
    asset: { kind: "mesh", url: "/scenes/heart.glb", bytes: 36_676, tris: 2_860 },
    parts: [
      { id: "heart_red", label: "Red heart (center)" },
      { id: "heart_purple", label: "Purple heart (top-left)" },
      { id: "heart_pink", label: "Pink heart (top-right)" },
      { id: "heart_green", label: "Green heart (bottom-left)" },
      { id: "heart_blue", label: "Blue heart (bottom-right)" },
    ],
    anchors: [
      // z = +0.24 sits in front of the heart surface (~0.196) in normalized units
      { id: "a_red", partId: "heart_red", pos: [0, 0.04, 0.24] },
      { id: "a_purple", partId: "heart_purple", pos: [-0.7, 0.51, 0.24] },
      { id: "a_pink", partId: "heart_pink", pos: [0.7, 0.49, 0.24] },
      { id: "a_green", partId: "heart_green", pos: [-0.5, -0.49, 0.24] },
      { id: "a_blue", partId: "heart_blue", pos: [0.5, -0.51, 0.24] },
    ],
    shots: [
      { id: "overview", label: "Overview", pos: [0, 0, 4.2], target: [0, 0, 0], fov: 45 },
      { id: "red_closeup", label: "Center heart closeup", pos: [0, 0.1, 2.0], target: [0, 0.04, 0], fov: 40 },
      { id: "top_down", label: "Top-down layout", pos: [0, 3.6, 1.6], target: [0, 0, 0], fov: 45 },
      // tilted, never straight down: lookAt with up=+Y degenerates vertically (Review Focus 3)
    ],
    keywords: ["heart", "hearts", "cardiac", "circulation", "blood", "pump", "anatomy", "organ"],
    license: {
      source: "https://poly.pizza/m/dACfv60ILZ",
      license: "CC0",
      attribution: "Hearts by MiniPoly (poly.pizza, CC0)",
    },
  },
};
