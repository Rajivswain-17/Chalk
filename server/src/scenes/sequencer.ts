// Scene plan generation (spec §6.2). The model may only emit IDs and prose:
// geometry is resolved server-side by expandSceneSteps, so a hallucinated
// coordinate is impossible by construction (the schema has no coordinate
// fields and is .strict()).

import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient } from "../lib/openai";
import { env } from "../lib/env";
import { buildSceneStepSchema } from "./schemas";
import { expandSceneSteps, type ScenePlanEntry, type SceneStepWire } from "./expand";
import type { SceneManifest } from "./types";

const SYSTEM_PROMPT = (manifest: SceneManifest): string => `You are Chalk, directing a 3D scene called "${manifest.title}".
Available shots: ${manifest.shots.map((s) => `${s.id} (${s.label})`).join("; ")}.
Selectable parts: ${manifest.parts.map((p) => `${p.id} (${p.label})`).join("; ")}.
Anchors you may pin callouts to: ${manifest.anchors.map((a) => a.id).join("; ")}.

RULES:
- Produce 6 to 12 steps. Never invent a shotId, part id, or anchorId: they must
  come from the lists above. You cannot set camera positions; you CHOOSE shots.
- MANDATORY 3-PHASE FLOW: (1) ESTABLISH WIDE — step 1 uses the widest shot and
  frames the whole subject; (2) EXPLORE PARTS — middle steps move between shots,
  highlighting one or two parts at a time and naming them with callouts;
  (3) CONCLUDE — the final step returns to a wide shot and ties the parts
  together.
- One concept per step. At most 2 callouts per step, each pinned to a listed
  anchor. 'highlights' must be 1-3 part ids from the list.
- 'explanation' is 2 to 4 sentences (under 600 characters): say WHY, not just
  what happens, and end by pointing at what the next step will show.
- 'notes' is an optional short list (max 6) of inspector lines - plain facts
  about what the viewer is looking at. Never repeat the explanation.
- Warm, precise, teaching tone. No emoji, no markdown headers.`;

export function buildScenePlanSchema(manifest: SceneManifest) {
  return z
    .object({
      steps: z
        .array(
          z
            .object({
              title: z.string().min(1).max(120),
              subtitle: z.string().max(160).optional(),
              explanation: z.string().min(1).max(600),
              notes: z.array(z.string().min(1).max(240)).max(6).optional(),
              step: buildSceneStepSchema(manifest),
            })
            .strict(),
        )
        .min(6)
        .max(12),
    })
    .strict();
}

export async function generateScenePlan(
  prompt: string,
  manifest: SceneManifest,
): Promise<SceneStepWire[]> {
  const client = getOpenAIClient();
  const schema = buildScenePlanSchema(manifest);
  const completion = await client.beta.chat.completions.parse(
    {
      model: env.OPENAI_MODEL_SCENE,
      messages: [
        { role: "system", content: SYSTEM_PROMPT(manifest) },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(schema, "scene_plan"),
      temperature: 0.6,
    },
    { timeout: 90_000 },
  );

  const parsed = schema.safeParse(completion.choices[0]?.message.parsed);
  if (!parsed.success) {
    console.error(
      "SCENE_INVALID",
      JSON.stringify(parsed.error.issues),
      `received ${completion.choices[0]?.message.parsed?.steps.length ?? 0} steps`,
    );
    throw Object.assign(new Error("SCENE_INVALID"), { status: 502 });
  }

  const entries: ScenePlanEntry[] = parsed.data.steps.map((step) => ({
    title: step.title,
    subtitle: step.subtitle,
    explanation: step.explanation,
    notes: step.notes,
    payload: step.step,
  }));
  return expandSceneSteps(manifest, entries);
}
