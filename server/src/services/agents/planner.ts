import { zodResponseFormat } from "openai/helpers/zod";
import type { AspectRatio, SceneScript } from "../../types";
import { scenePlanSchema } from "../../validators";
import { getOpenAIClient, openAIModel } from "../../lib/openai";

/** Convert one topic into a validated, ordered 3–5 scene teaching plan. */
export async function planScenes(
  prompt: string,
  aspectRatio: AspectRatio,
): Promise<SceneScript[]> {
  try {
    const completion = await getOpenAIClient().beta.chat.completions.parse({
      model: openAIModel,
      messages: [
        {
          role: "system",
          content: [
            "You plan concise educational whiteboard videos for Chalk.",
            "Return 3 to 5 sequential scenes inside a root object named scenes.",
            "Each scene needs a short title, a 2-4 sentence narration, and a",
            "15-45 second estimate. Move from hook to explanation to payoff.",
            `The target aspect ratio is ${aspectRatio}.`,
          ].join(" "),
        },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(scenePlanSchema, "chalk_scene_plan"),
      temperature: 0.7,
    });

    const plan = completion.choices[0]?.message.parsed;
    if (!plan) throw new Error("OpenAI returned no parsed scene plan");

    // Array position is authoritative. Never trust model-generated indexes for
    // filenames or playback order because duplicates would overwrite artifacts.
    return plan.scenes.map((scene, sceneIndex) => ({ ...scene, sceneIndex }));
  } catch (error) {
    throw new Error(
      `planner: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
