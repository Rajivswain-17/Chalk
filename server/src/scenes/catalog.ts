// server/src/scenes/catalog.ts
import type { SceneManifest } from "./types";

/** Single source of truth for scenes (spec §4.1). Never sent to the client (§4.2). */
export const SCENES: Record<string, SceneManifest> = {};
