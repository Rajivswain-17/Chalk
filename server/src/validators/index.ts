// ============================================================================
// Chalk — Zod validators (Chalk/server/src/validators/index.ts)
// ----------------------------------------------------------------------------
// Runtime mirrors of src/types contracts. Used at TWO trust boundaries:
//   1. API edge (createVideoSchema) — reject bad POST bodies before DB insert.
//   2. AI edge (sceneScriptSchema / sceneLayoutSchema) — reject hallucinated
//      agent JSON before it reaches TTS / Remotion (fail fast, retry agent).
// No logic here — pure schemas + inferred types.
// ============================================================================

import { z } from "zod"; // Zod: runtime validation + TS inference.

// --- 1. POST /api/videos/generate body --------------------------------------
/**
 * Validates the create-video request before any DB/queue work.
 * - prompt: the raw explainer topic. min 10 weeds out "hi"/empty, max 1000
 *   caps OpenAI planner tokens + cost per request.
 * - aspectRatio: canvas shape. Optional (defaults 16:9 landscape); enum
 *   rejects anything the compositor cannot lay out.
 * - title: optional dashboard label. Capped at 200 chars for list UI.
 */
export const createVideoSchema = z.object({
  prompt: z
    .string()
    .min(10, "Prompt must be at least 10 characters")
    .max(1000, "Prompt must be at most 1000 characters"),
  aspectRatio: z.enum(["16:9", "9:16"]).optional().default("16:9"),
  title: z.string().max(200, "Title must be at most 200 characters").optional(),
});

// --- 2. Scriptwriter agent output -------------------------------------------
/**
 * Zod mirror of SceneScript (src/types). Validates ONE scene's narration.
 * - sceneIndex: non-negative int, defines video order (0 = opener).
 * - title: non-empty heading for progress UI + chapter markers.
 * - narration: non-empty TTS input. Cap ~2000 chars ≈ 2-3 min of speech per
 *   scene, preventing runaway ElevenLabs cost on a single scene.
 * - durationEstimateSeconds: planner guess, positive (real duration comes
 *   from the mp3 after synthesis).
 */
export const sceneScriptSchema = z.object({
  sceneIndex: z.number().int().min(0),
  title: z.string().min(1, "Scene title must not be empty"),
  narration: z
    .string()
    .min(1, "Narration must not be empty")
    .max(2000, "Narration must be at most 2000 characters per scene"),
  durationEstimateSeconds: z.number().positive(),
});

// --- 3. SceneDesigner agent output ------------------------------------------
/** One drawable — Zod mirror of VisualElement. Bboxes are clamped to the
 * 1920×1080 landscape space (portrait 9:16 is letterboxed by the compositor,
 * so the same coordinate contract holds for validation). */
const visualElementSchema = z.object({
  type: z.enum(["text", "icon", "arrow", "rectangle", "circle", "line"]),
  x: z.number().min(0).max(1920),
  y: z.number().min(0).max(1080),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  content: z.string().optional(),
  style: z.enum(["sketch", "clean"]).optional(),
  animateIn: z.number().min(0).optional(),
});

/** One word timing — Zod mirror of WordTimestamp (ms offsets in scene audio). */
const wordTimestampSchema = z.object({
  word: z.string().min(1),
  startMs: z.number().min(0),
  endMs: z.number().min(0),
});

/**
 * Zod mirror of SceneLayout. Gates AI output BEFORE render:
 * - sceneIndex links back to its SceneScript (join key).
 * - backgroundColor must be hex (Remotion fill accepts only #RGB/#RRGGBB).
 * - elements may be empty (voice-only beat) but each entry is bbox-checked.
 * - audioFile is the absolute mp3 path from the voice service.
 * - wordTimestamps keys are word indexes ("0", "1", ...) → timing entries.
 */
export const sceneLayoutSchema = z.object({
  sceneIndex: z.number().int().min(0),
  backgroundColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex color"),
  elements: z.array(visualElementSchema),
  audioFile: z.string().min(1, "audioFile path must not be empty"),
  wordTimestamps: z.record(z.string(), wordTimestampSchema),
});

// --- 4. Inferred types (schema → TypeScript) --------------------------------
// Single-direction flow: Zod schema is the source of truth, TS type is derived.
// Controllers/agents annotate with these so a schema change breaks callers at
// compile time instead of silently passing bad data at runtime.

/** Validated POST /api/videos/generate body (aspectRatio always resolved). */
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
/** Validated single scriptwriter scene (== SceneScript contract). */
export type SceneScriptOutput = z.infer<typeof sceneScriptSchema>;
/** Validated single designer scene (== SceneLayout contract). */
export type SceneLayoutOutput = z.infer<typeof sceneLayoutSchema>;
