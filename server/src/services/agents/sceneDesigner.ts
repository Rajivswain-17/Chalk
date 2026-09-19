

import OpenAI from "openai"; 
import type {
  SceneScript, 
  SceneLayout, 
  WordTimestampMap, 
} from "../../types/index";
import { sceneLayoutSchema } from "../../validators/index"; // Layout gate.


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


export async function designScene(
  scene: SceneScript,
  audioFile: string,
  wordTimestamps: WordTimestampMap,
): Promise<SceneLayout> {

  const timingPreview = JSON.stringify(wordTimestamps).slice(0, 4000);

  const systemPrompt = [
    "You are a whiteboard visual designer for Chalk explainer videos.",
    "Canvas is 1920x1080 for 16:9 (or 1080x1920 portrait for 9:16).",
    "Output a JSON SceneLayout: { sceneIndex, backgroundColor, elements, audioFile, wordTimestamps }.",
    "Elements: text labels, icon keywords (content e.g. 'leaf'), arrows, rectangles, circles, lines.",
    "Each element needs x, y (canvas px), optional width/height, content, style ('sketch' preferred),",
    "and animateIn (ms from scene start) matching when the narrator says the related word.",
    "Use the provided word timestamps as the ONLY timing source — never invent times.",
    "Return ONLY JSON, no markdown fences, no commentary.",
  ].join(" ");

  const userPrompt = [
    `sceneIndex: ${scene.sceneIndex}`,
    `title: ${scene.title}`,
    `narration: ${scene.narration}`,
    `audioFile: ${audioFile}`,
    `wordTimestamps: ${timingPreview}`,
    `backgroundColor: #FFFFFF`,
  ].join("\n");

  let raw: string | null;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
    raw = res.choices[0]?.message?.content ?? null;
  } catch (err) {
    throw new Error(
      `sceneDesigner: OpenAI request failed for scene ${scene.sceneIndex}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!raw) {
    throw new Error(
      `sceneDesigner: OpenAI returned empty layout for scene ${scene.sceneIndex}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `sceneDesigner: OpenAI returned non-JSON layout for scene ${scene.sceneIndex}`,
    );
  }

 
  if (typeof parsed === "object" && parsed !== null) {
    (parsed as Record<string, unknown>).sceneIndex = scene.sceneIndex;
    (parsed as Record<string, unknown>).audioFile = audioFile;
    (parsed as Record<string, unknown>).wordTimestamps = wordTimestamps;
  }

  const result = sceneLayoutSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `sceneDesigner: layout failed validation for scene ${scene.sceneIndex}: ${result.error.message}`,
    );
  }
  return result.data;
}
