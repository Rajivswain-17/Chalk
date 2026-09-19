
import axios from "axios"; 
import { mkdir, writeFile } from "fs/promises"; 
import path from "path"; 


const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/app/output";


 
interface WithTimestampsResponse {
  audio_base64: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  normalized_alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export interface RawCharAlignment {
  character: string;
  start_time: number;
  end_time: number;
}


 
export async function synthesizeVoice(
  text: string,
  sceneIndex: number,
): Promise<{ audioPath: string; rawTimestamps: RawCharAlignment[] }> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("elevenlabs: ELEVENLABS_API_KEY is not set");
  }
  if (!text.trim()) {
    throw new Error(
      `elevenlabs: empty text for scene ${sceneIndex} — refusing paid call`,
    );
  }

  let data: WithTimestampsResponse;
  try {
    const res = await axios.post<WithTimestampsResponse>(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
      {
       
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 60_000, // TTS for a 45s scene can take ~20-40s; avoid hangs.
      },
    );
    data = res.data;
  } catch (err) {
    // Distinguish auth/voice/rate-limit so the worker's SSE ERROR is actionable.
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const detail =
        (err.response?.data as { detail?: unknown } | undefined)?.detail ??
        err.message;
      if (status === 401) throw new Error(`elevenlabs: invalid API key (${String(detail)})`);
      if (status === 404) throw new Error(`elevenlabs: unknown voice ${VOICE_ID}`);
      if (status === 429) throw new Error(`elevenlabs: rate limited / quota hit (${String(detail)})`);
      throw new Error(
        `elevenlabs: TTS request failed for scene ${sceneIndex} (status ${status ?? "n/a"}): ${String(detail)}`,
      );
    }
    throw new Error(
      `elevenlabs: TTS request failed for scene ${sceneIndex}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!data.audio_base64) {
    throw new Error(
      `elevenlabs: response missing audio_base64 for scene ${sceneIndex}`,
    );
  }


  const audioDir = path.join(OUTPUT_DIR, "audio");
  await mkdir(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, `scene_${sceneIndex}.mp3`);
  await writeFile(audioPath, Buffer.from(data.audio_base64, "base64"));

 
  const a = data.alignment;
  if (
    !a ||
    !Array.isArray(a.characters) ||
    a.characters.length !== a.character_start_times_seconds.length ||
    a.characters.length !== a.character_end_times_seconds.length
  ) {
    throw new Error(
      `elevenlabs: response missing valid alignment for scene ${sceneIndex}`,
    );
  }
  const rawTimestamps: RawCharAlignment[] = a.characters.map((character, i) => ({
    character,
    start_time: a.character_start_times_seconds[i],
    end_time: a.character_end_times_seconds[i],
  }));

  return { audioPath, rawTimestamps };
}
