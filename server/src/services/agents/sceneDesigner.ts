import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, openAIModel } from "../../lib/openai";
import type {
  AspectRatio,
  SceneLayout,
  SceneScript,
  WordTimestampMap,
} from "../../types";
import { createSceneDesignSchema } from "../../validators";

/**
 * Design one whiteboard scene. The model selects semantic word indexes; trusted
 * ElevenLabs timestamps are converted to milliseconds locally after parsing.
 */
export async function designScene(
  scene: SceneScript,
  audioFile: string,
  wordTimestamps: WordTimestampMap,
  aspectRatio: AspectRatio,
): Promise<SceneLayout> {
  const width = aspectRatio === "9:16" ? 1080 : 1920;
  const height = aspectRatio === "9:16" ? 1920 : 1080;
  const schema = createSceneDesignSchema(aspectRatio);
  const timingWords = wordTimestamps.map((item, index) => ({
    index,
    word: item.word,
  }));

  try {
    const completion = await getOpenAIClient().beta.chat.completions.parse({
      model: openAIModel,
      messages: [
        {
          role: "system",
          content: [
            "You design uncluttered, hand-drawn whiteboard explainer scenes.",
            `The canvas is exactly ${width}x${height} pixels.`,
            "Use at most 30 text, icon, arrow, line, rectangle, or circle elements.",
            "Use short text labels and semantic icon keywords, never SVG markup.",
            "Set animateAtWordIndex to the supplied word index that introduces",
            "each idea. Keep every complete element inside the canvas.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            sceneIndex: scene.sceneIndex,
            title: scene.title,
            narration: scene.narration,
            timingWords,
          }),
        },
      ],
      response_format: zodResponseFormat(schema, "chalk_scene_design"),
      temperature: 0.6,
    });

    const design = completion.choices[0]?.message.parsed;
    if (!design) throw new Error("OpenAI returned no parsed scene design");

    const elements = design.elements
      .map((element, index) => {
        const fallbackIndex = Math.min(
          wordTimestamps.length - 1,
          Math.floor((index / Math.max(design.elements.length, 1)) * wordTimestamps.length),
        );
        const wordIndex = Math.min(
          element.animateAtWordIndex ?? Math.max(fallbackIndex, 0),
          Math.max(wordTimestamps.length - 1, 0),
        );
        return {
          ...element,
          width: element.width ?? undefined,
          height: element.height ?? undefined,
          content: element.content ?? undefined,
          animateAtWordIndex: wordIndex,
          animateIn: wordTimestamps[wordIndex]?.startMs ?? 0,
        };
      })
      .sort((a, b) => (a.animateIn ?? 0) - (b.animateIn ?? 0));

    return {
      sceneIndex: scene.sceneIndex,
      backgroundColor: design.backgroundColor,
      elements,
      audioFile,
      wordTimestamps,
    };
  } catch (error) {
    throw new Error(
      `sceneDesigner: scene ${scene.sceneIndex}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
