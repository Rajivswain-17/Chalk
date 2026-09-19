

import type {
  WordTimestamp, // { word, startMs, endMs } value shape.
  WordTimestampMap, // Record<wordIndex, WordTimestamp> return shape.
} from "../../types/index";
import type { RawCharAlignment } from "./elevenlabs"; // Char-level input rows.


export function buildWordTimestampMap(
  rawAlignment: RawCharAlignment[],
): WordTimestampMap {
  const map: WordTimestampMap = {};

  // Accumulator for the word currently being spelled out.
  let current = ""; // Letters collected since the last boundary.
  let wordStart = 0; // start_time of the word's FIRST letter (seconds).
  let wordEnd = 0; // end_time of the LATEST letter so far (seconds).
  let wordIndex = 0; // Next key to assign in the map.

  const flush = () => {
    if (!current) return; // No letters collected (double space) — nothing to seal.
    const entry: WordTimestamp = {
      word: current,
      startMs: Math.round(wordStart * 1000),
      endMs: Math.round(wordEnd * 1000),
    };
    map[wordIndex] = entry;
    wordIndex += 1;
    current = "";
  };


  for (const row of rawAlignment) {
    const ch = row.character;

  
    if (ch.trim() === "") {
      flush(); 
      continue;
    }

  
    if (current === "") {
      wordStart = row.start_time;
    }
    current += ch;
    wordEnd = row.end_time;
  }

  
  flush();

  return map;
}
