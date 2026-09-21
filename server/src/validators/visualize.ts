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
});

export const visualizeRequestSchema = z.object({
  prompt: z.string().trim().min(10, "Prompt must be at least 10 characters").max(1000),
});

export const visualizeResponseSchema = z.object({
  steps: z.array(visualStepSchema).min(6).max(12),
});

export type VisualStep = z.infer<typeof visualStepSchema>;
