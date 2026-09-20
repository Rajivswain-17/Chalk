import type { SceneScript } from "../../types";
import { refinedNarrationSchema } from "../../validators";
import { getOpenAIClient, openAIModel } from "../../lib/openai";

/** Rewrite planner prose into natural narration while retaining its facts. */
export async function refineNarration(scene: SceneScript): Promise<string> {
  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: openAIModel,
      messages: [
        {
          role: "system",
          content: [
            "You write spoken narration for educational whiteboard videos.",
            "Use conversational, plain language and short, well-paced sentences.",
            "Keep the original facts. Do not add markdown, stage directions,",
            "bullet points, labels, or commentary. Return only narration text.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Scene title: ${scene.title}`,
            `Target speaking time: ${scene.durationEstimateSeconds} seconds`,
            `Original narration: ${scene.narration}`,
          ].join("\n"),
        },
      ],
      temperature: 0.7,
    });

    return refinedNarrationSchema.parse(
      completion.choices[0]?.message.content ?? "",
    );
  } catch (error) {
    throw new Error(
      `scriptwriter: scene ${scene.sceneIndex}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
