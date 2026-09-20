import axios from "axios";
import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { jobAttemptDir } from "../../lib/artifacts";
import { env, requireSecret } from "../../lib/env";

const alignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number().finite().nonnegative()),
  character_end_times_seconds: z.array(z.number().finite().nonnegative()),
});

const responseSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: alignmentSchema.nullish(),
  normalized_alignment: alignmentSchema.nullish(),
});

export interface RawCharAlignment {
  character: string;
  start_time: number;
  end_time: number;
}

/** Synthesize one scene and persist audio inside this job attempt's workspace. */
export async function synthesizeVoice(
  text: string,
  sceneIndex: number,
  jobId: string,
  attempt: number,
): Promise<{ audioPath: string; rawTimestamps: RawCharAlignment[] }> {
  const apiKey = requireSecret("ELEVENLABS_API_KEY");
  const narration = text.trim();
  if (!narration) throw new Error("elevenlabs: narration is empty");

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}/with-timestamps`,
      {
        text: narration,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        params: { output_format: "mp3_44100_128" },
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        timeout: 90_000,
      },
    );

    const data = responseSchema.parse(response.data);
    const alignment = data.normalized_alignment ?? data.alignment;
    if (!alignment) throw new Error("response contains no timestamp alignment");

    const count = alignment.characters.length;
    if (
      count === 0 ||
      alignment.character_start_times_seconds.length !== count ||
      alignment.character_end_times_seconds.length !== count
    ) {
      throw new Error("alignment arrays have inconsistent lengths");
    }

    let previousStart = 0;
    const rawTimestamps = alignment.characters.map((character, index) => {
      const start = alignment.character_start_times_seconds[index];
      const end = alignment.character_end_times_seconds[index];
      if (start < previousStart || end < start) {
        throw new Error(`invalid alignment at character ${index}`);
      }
      previousStart = start;
      return { character, start_time: start, end_time: end };
    });

    const audio = Buffer.from(data.audio_base64, "base64");
    if (audio.length < 100) throw new Error("decoded audio is empty or invalid");

    const audioDir = path.join(jobAttemptDir(jobId, attempt), "audio");
    await mkdir(audioDir, { recursive: true });
    const audioPath = path.join(
      audioDir,
      `scene_${String(sceneIndex + 1).padStart(3, "0")}.mp3`,
    );
    const temporaryPath = `${audioPath}.tmp`;
    await writeFile(temporaryPath, audio);
    await rename(temporaryPath, audioPath);

    return { audioPath, rawTimestamps };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      throw new Error(
        `elevenlabs: scene ${sceneIndex} request failed (${status ?? "network"}): ${error.message}`,
      );
    }
    throw new Error(
      `elevenlabs: scene ${sceneIndex}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
