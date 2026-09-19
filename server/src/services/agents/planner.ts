

import OpenAI from "openai"; // Structured-output chat client.
import { z } from "zod"; // Array wrapper for validating the whole outline.
import type { SceneScript } from "../../types/index"; // Return-type contract.
import { sceneScriptSchema } from "../../validators/index"; // Per-scene gate.

// OpenAI client, keyed from Chalk/.env (OPENAI_API_KEY). Instantiated once per
// process — the SDK manages its own HTTPS pool, so no per-call construction.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Whole-response validator: every scene must pass sceneScriptSchema AND the
// outline must hold 3–5 scenes (compositor + duration math assume this band).
const planScenesSchema = z.array(sceneScriptSchema).min(3).max(5);

/**
 * Break a user topic into a structured whiteboard outline.
 *
 * @param prompt - Raw user input, verbatim (10–1000 chars, pre-validated by
 *   createVideoSchema). Passed through untouched so retries reproduce intent.
 * @param aspectRatio - Canvas shape ("16:9" | "9:16"). Currently informational
 *   for pacing (portrait favors fewer words/scene); bboxes are resolved later
 *   in sceneDesigner, not here.
 * @returns Validated SceneScript[] (3–5 scenes, ordered by sceneIndex).
 * @throws Descriptive Error on: missing key, API failure, empty content, or
 *   Zod rejection (model hallucinated a bad shape — safe to retry the call).
 */
export async function planScenes(
  prompt: string,
  aspectRatio: string,
): Promise<SceneScript[]> {
 
  const systemPrompt = [
    "You are a whiteboard video planner for Chalk, an educational explainer engine.",
    "Break the user's topic into 3-5 sequential educational scenes.",
    "Each scene needs: sceneIndex (0-based order), title (clear heading),",
    "narration (2-4 sentence voiceover paragraph), durationEstimateSeconds (15-45).",
    "Order scenes from hook → concepts → payoff. Keep language visual and teachable.",
    `The target canvas aspect ratio is ${aspectRatio}; favor concise scenes for portrait.`,
    'Return ONLY a JSON array, e.g. [{"sceneIndex":0,"title":"...","narration":"...","durationEstimateSeconds":20}].',
    "No markdown fences, no commentary, no trailing text.",
  ].join(" ");

  let raw: string | null;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
    raw = res.choices[0]?.message?.content ?? null;
  } catch (err) {
    
    throw new Error(
      `planner: OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!raw) {
    throw new Error("planner: OpenAI returned empty content");
  }

 
  let parsed: unknown;
  try {
    const json: unknown = JSON.parse(raw);
    parsed =
      Array.isArray(json) ||
      (typeof json === "object" && json !== null && "scenes" in json
        ? (json as { scenes: unknown }).scenes
        : json);
  } catch {
    throw new Error("planner: OpenAI returned non-JSON output");
  }

  
  const result = planScenesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `planner: response failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}
