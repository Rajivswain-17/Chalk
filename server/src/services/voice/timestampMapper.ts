import type { WordTimestamp, WordTimestampMap } from "../../types";
import type { RawCharAlignment } from "./elevenlabs";

const BOUNDARY_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

/** Convert ElevenLabs character timing rows into ordered word-level timings. */
export function buildWordTimestampMap(
  rawAlignment: RawCharAlignment[],
): WordTimestampMap {
  const words: WordTimestamp[] = [];
  let characters = "";
  let startSeconds = 0;
  let endSeconds = 0;

  const flush = () => {
    const word = characters.replace(BOUNDARY_PUNCTUATION, "").trim();
    if (word) {
      const startMs = Math.max(0, Math.round(startSeconds * 1000));
      const endMs = Math.max(startMs, Math.round(endSeconds * 1000));
      words.push({ word, startMs, endMs });
    }
    characters = "";
  };

  for (const row of rawAlignment) {
    if (!Number.isFinite(row.start_time) || !Number.isFinite(row.end_time)) {
      throw new Error("timestampMapper: alignment contains non-finite timing data");
    }
    if (/\s/u.test(row.character)) {
      flush();
      continue;
    }
    if (!characters) startSeconds = row.start_time;
    characters += row.character;
    endSeconds = row.end_time;
  }
  flush();

  if (words.length === 0) {
    throw new Error("timestampMapper: no words could be derived from alignment");
  }
  return words;
}
