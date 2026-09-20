import { z } from "zod";
import type { AspectRatio } from "../types";

export const createVideoSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, "Prompt must be at least 10 characters")
    .max(1000, "Prompt must be at most 1000 characters"),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  title: z.string().trim().min(1).max(200).optional(),
});

export const idParamSchema = z.string().uuid();

export const sceneScriptSchema = z.object({
  sceneIndex: z.number().int().min(0),
  title: z.string().trim().min(1).max(120),
  narration: z.string().trim().min(1).max(2000),
  durationEstimateSeconds: z.number().min(15).max(45),
});

export const scenePlanSchema = z.object({
  scenes: z.array(sceneScriptSchema).min(3).max(5),
});

export const refinedNarrationSchema = z.string().trim().min(1).max(2000);

export const wordTimestampSchema = z
  .object({
    word: z.string().trim().min(1).max(100),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
  })
  .refine((value) => value.endMs >= value.startMs, {
    message: "Word end time must not precede its start time",
  });

const visualElementBase = z.object({
  type: z.enum(["text", "icon", "arrow", "rectangle", "circle", "line"]),
  x: z.number().min(0),
  y: z.number().min(0),
  // OpenAI strict schemas require every property to be present. `null` means
  // "not applicable" and is normalized to undefined after parsing.
  width: z.number().positive().max(1920).nullable(),
  height: z.number().positive().max(1920).nullable(),
  content: z.string().trim().max(300).nullable(),
  style: z.enum(["sketch", "clean"]),
  animateAtWordIndex: z.number().int().min(0).nullable(),
});

/**
 * Build a layout validator for the selected canvas. This prevents portrait
 * coordinates from being checked against landscape dimensions and validates
 * the complete bounding box rather than only its top-left corner.
 */
export function createSceneDesignSchema(aspectRatio: AspectRatio) {
  const width = aspectRatio === "9:16" ? 1080 : 1920;
  const height = aspectRatio === "9:16" ? 1920 : 1080;

  const element = visualElementBase.superRefine((value, ctx) => {
    const elementWidth = value.width ?? (value.type === "text" ? 0 : 200);
    const elementHeight = value.height ?? (value.type === "text" ? 0 : 120);
    if (value.x + elementWidth > width || value.y + elementHeight > height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Element exceeds the ${width}x${height} canvas`,
      });
    }
    if ((value.type === "text" || value.type === "icon") && !value.content) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: `${value.type} elements require content`,
      });
    }
  });

  return z.object({
    backgroundColor: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex color"),
    elements: z.array(element).max(30),
  });
}

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
export type SceneScriptOutput = z.infer<typeof sceneScriptSchema>;
export type ScenePlanOutput = z.infer<typeof scenePlanSchema>;
