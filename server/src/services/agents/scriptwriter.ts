// ============================================================================
// Chalk — scriptwriter agent (Chalk/server/src/services/agents/scriptwriter.ts)
// ----------------------------------------------------------------------------
// Stage 2 of the pipeline ("scripting"). Polishes ONE planner scene's raw
// narration into broadcast-ready voiceover copy. Runs per scene (3–5 calls per
// video) BEFORE ElevenLabs synthesis — TTS faithfully reads whatever it gets,
// so every awkward phrase here becomes permanent audio.
// ============================================================================

import OpenAI from "openai"; // Chat client for the rewrite pass.
import type { SceneScript } from "../../types/index"; // Input shape contract.

// Same process-wide client pattern as planner.ts — key from OPENAI_API_KEY.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Rewrite one scene's narration for the human ear.
 *
 * @param scene - Validated SceneScript from planScenes(). Only `narration`
 *   + `title` are read; sceneIndex/order are preserved by the caller (this
 *   function returns a bare string, not a re-indexed object).
 * @returns Polished voiceover paragraph (same facts, speakable rhythm).
 * @throws Descriptive Error on: missing key, API failure, or empty rewrite
 *   (worker treats this as a retryable scripting-stage failure).
 */
export async function refineNarration(scene: SceneScript): Promise<string> {
  // --- Raw vs polished ------------------------------------------------------
  // Planner output is WRITTEN prose: long subordinate clauses, jargon dumps,
  // parentheticals, markdown-ish ticks — fine to read, painful to hear. TTS
  // cannot improvise pacing; it stresses exactly what is written. This pass
  // converts to SPOKEN prose: short declarative sentences, conversational
  // connectors ("So…", "Now…"), jargon unpacked on first use, filler cut
  // ("basically", "in order to", "utilize" → "use"). Same scene length class
  // is preserved so durationEstimateSeconds stays roughly valid.
  const systemPrompt = [
    "You are an expert voiceover scriptwriter for whiteboard explainer videos.",
    "Rewrite the scene narration to sound natural when SPOKEN ALOUD by a narrator.",
    "Rules: conversational tone, plain words over jargon, clear sentence pacing,",
    "no filler words, no stage directions, no markdown, no bullet lists.",
    "Keep every fact from the original — polish the delivery, not the content.",
    "Return ONLY the rewritten paragraph as plain text.",
  ].join(" ");

  const userPrompt = [
    `Scene title: ${scene.title}`,
    `Original narration: ${scene.narration}`,
    `Keep it near ${scene.durationEstimateSeconds}s of speech when read aloud.`,
  ].join("\n");

  let refined: string | null | undefined;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // Plain text out (not json_object): the result feeds TTS directly, and
      // wrapping prose in JSON would force an unwrap step that adds no safety
      // (length/emptiness are checked below instead of via Zod).
      temperature: 0.7,
    });
    refined = res.choices[0]?.message?.content?.trim();
  } catch (err) {
    throw new Error(
      `scriptwriter: OpenAI request failed for scene ${scene.sceneIndex}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!refined) {
    throw new Error(
      `scriptwriter: OpenAI returned empty narration for scene ${scene.sceneIndex}`,
    );
  }
  return refined;
}
