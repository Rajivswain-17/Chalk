import { z } from "zod";

export const createVideoSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(5, "Prompt must be at least 5 characters")
    .max(1000, "Prompt must be at most 1000 characters"),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  title: z.string().trim().min(1).max(200).optional(),
});

export const idParamSchema = z.string().uuid();

// --- Universal Visual State Machine Schemas ---
export const stageElementSchema = z.object({
  id: z.string().describe("Identifier e.g. 'elem-1'"),
  label: z.string().describe("Main label or number, e.g. '8', 'FAIR', 'CO2'"),
  subLabel: z.string().nullable().describe("Index or secondary text e.g. '[1]', '580-669'"),
  highlight: z.boolean().describe("Whether this item is currently active"),
  highlightColor: z.enum(["orange", "blue", "green", "red"]).nullable(),
  pointerLabel: z.string().nullable().describe("Optional pointer label e.g. 'left', 'right', 'current'"),
  pointerPosition: z.enum(["top", "bottom"]).nullable(),
  pointerColor: z.enum(["orange", "blue"]).nullable(),
});

export const logicRuleSchema = z.object({
  line: z.number().int().min(1),
  text: z.string().describe("Rule or step description, e.g. 'left <- 0'"),
});

export const stateVariableSchema = z.object({
  key: z.string().describe("Variable name e.g. 'left', 'right', 'Score'"),
  value: z.string().describe("Variable value e.g. '1', '6', '720'"),
});

export const visualStepSchema = z.object({
  stepIndex: z.number().int().min(0),
  conceptTitle: z.string().describe("Main title e.g. 'Two Pointers Intro' or 'The Three-Digit Scale'"),
  subtitle: z.string().describe("Short subtitle e.g. 'Opposite-ends two pointers'"),
  stageType: z.enum(["array_boxes", "comparison_cards", "stat_scale", "flow_nodes"]),
  stageElements: z.array(stageElementSchema).min(1).max(8),
  logicRules: z.array(logicRuleSchema).min(2).max(6),
  activeLine: z.number().int().min(1),
  stateVariables: z.array(stateVariableSchema).max(5),
  caption: z.string().describe("Clear 1-2 sentence explanation of what is happening at this step"),
  durationSeconds: z.number().min(3).max(6).describe("Duration in seconds (3 to 5)"),
});

export const visualExplainerPlanSchema = z.object({
  steps: z.array(visualStepSchema).min(3).max(6),
});

export const sseEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PROGRESS"),
    jobId: z.string().uuid(),
    data: z.object({
      status: z.enum(["queued", "active", "retrying", "completed", "failed"]),
      stage: z.string().nullable(),
      progress: z.number().int().min(0).max(100),
    }),
  }),
  z.object({
    type: z.literal("SCENE_READY"),
    jobId: z.string().uuid(),
    data: z.object({
      sceneIndex: z.number().int().min(0),
      completedScenes: z.number().int().min(0),
      totalScenes: z.number().int().positive(),
      playlistUrl: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("COMPLETED"),
    jobId: z.string().uuid(),
    data: z.object({
      outputUrl: z.string().min(1),
      totalScenes: z.number().int().positive(),
    }),
  }),
  z.object({
    type: z.literal("ERROR"),
    jobId: z.string().uuid(),
    data: z.object({ message: z.string().min(1).max(2000) }),
  }),
]);

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type VisualStepOutput = z.infer<typeof visualStepSchema>;
export type VisualExplainerPlanOutput = z.infer<typeof visualExplainerPlanSchema>;

// --- Auth ---
export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

export const oauthProviderSchema = z.enum(["google", "github"]);

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;
