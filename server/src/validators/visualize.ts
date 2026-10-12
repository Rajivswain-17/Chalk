import { z } from "zod";

export const elementStateSchema = z.enum(["default", "active", "compare", "found", "visited", "path"]);

export const visualVariableSchema = z.object({
  name: z.string().min(1).max(40),
  value: z.union([z.string(), z.number(), z.null()]),
});
export const stageElementSchema = z.object({
  id: z.string().min(1),
  value: z.string(),
  indexLabel: z.string().optional(),
  state: elementStateSchema,
  pointer: z.string().nullable().optional(),
});

export const visualStepSchema = z.object({
  stepIndex: z.number().int().min(0),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(160).optional(),
  stageType: z.enum(["array", "tree", "cards", "flow"]),
  elements: z.array(stageElementSchema).min(1).max(12),
  codeLines: z.array(z.string()).min(3).max(12),
  activeLine: z.number().int().min(0),
  variables: z.array(visualVariableSchema).max(8),
  explanation: z.string().min(1).max(600),
  calculation: z.string().max(400).optional(),
});

// --- 3D scene steps (server-expanded wire shape, spec §4.2) ------------------
// The client never sees catalog IDs alone: `shot` carries the resolved pose and
// each callout carries its resolved `pos`, so `SCENES` never has to cross the
// boundary (Plan 3 Ruling 1) and cache hydration stays steps-only.
export const sceneVec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const sceneCalloutSchema = z.object({
  anchorId: z.string().min(1),
  pos: sceneVec3Schema,
  text: z.string().min(1).max(160),
});

export const sceneStepSchema = z.object({
  kind: z.literal("scene"),
  stepIndex: z.number().int().min(0),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(160).optional(),
  explanation: z.string().min(1).max(600),
  sceneId: z.string().min(1),
  shotId: z.string().min(1),
  shot: z.object({
    pos: sceneVec3Schema,
    target: sceneVec3Schema,
    // Same envelope the gate enforces (spec §4.4) — an out-of-range pose must
    // never leave the server.
    fov: z.number().min(15).max(120),
  }),
  assetUrl: z.string().min(1),
  highlights: z.array(z.string().min(1)).max(12),
  callouts: z.array(sceneCalloutSchema).max(2),
  notes: z.array(z.string().min(1).max(240)).max(6).optional(),
});

/**
 * Wire step union. `sceneStepSchema` is tried first: a scene step fails
 * `visualStepSchema` (no stageType/elements/codeLines), and an algorithm step
 * fails `sceneStepSchema` (no `kind`), so the discrimination is structural.
 */
export const wireStepSchema = z.union([sceneStepSchema, visualStepSchema]);

export const visualizeRequestSchema = z.object({
  prompt: z.string().trim().min(10, "Prompt must be at least 10 characters").max(1000),
});

export const visualizeResponseSchema = z.object({
  steps: z.array(visualStepSchema).min(6).max(12),
});

/**
 * Full wire response — either kind. `visualizeResponseSchema` above stays
 * algorithm-only so `generateVisualization`'s signature and behavior are
 * untouched (spec §6.1); this one is what the route's response contract and
 * the client mirror are checked against.
 */
export const visualizeWireResponseSchema = z.object({
  steps: z.array(wireStepSchema).min(6).max(12),
});

/** HTTP 200 "no match" body — a first-class outcome, not an error (spec §6.1). */
export const unsupportedResponseSchema = z.object({
  status: z.literal("unsupported"),
  suggestions: z.array(z.string().min(1)).max(3),
});

export type UnsupportedResponse = z.infer<typeof unsupportedResponseSchema>;

export type VisualStep = z.infer<typeof visualStepSchema>;
