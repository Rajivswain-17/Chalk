// Three-tier prompt router (spec §6.1).
//
//   tier 1  lexicon fast-path — free, instant, no model call. Algorithm terms
//           win ties so the DSA path keeps its exact behavior and cost.
//   tier 2  LLM classifier for genuinely fuzzy phrasing, behind an injectable
//           seam so routes:check and drills run offline (Ruling 3).
//   tier 3  "unsupported" — an honest no-match, never an error.
//
// Failures are NOT tier 3: a classifier that throws propagates so the route
// handler can use the existing error+retry path (spec §6.1).

import { env } from "../lib/env";
import { SCENES } from "./catalog";
import { ALGORITHM_TERMS } from "./lexicon";

export type RouteDecision =
  | { kind: "algorithm" }
  | { kind: "scene"; sceneId: string }
  | { kind: "unsupported" };

/** Tier-2 seam. Resolves to a scene id, "algorithm", or "unsupported". */
export type SceneClassifier = (prompt: string) => Promise<string>;

const ALGORITHM = "algorithm";
const UNSUPPORTED = "unsupported";

/** Scene keywords come from the LIVE catalog — never a duplicated list. */
export function sceneKeywords(): { sceneId: string; terms: string[] }[] {
  return Object.entries(SCENES)
    .filter(([, manifest]) => manifest.status === "live")
    .map(([id, manifest]) => ({ sceneId: id, terms: manifest.keywords }));
}

/** Word-boundary, case-insensitive match. Multi-word terms are escaped. */
export function matchesLexicon(prompt: string, terms: readonly string[]): boolean {
  const haystack = prompt.toLowerCase();
  return terms.some((term) => {
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(haystack);
  });
}

export function fastPath(prompt: string): RouteDecision | null {
  if (matchesLexicon(prompt, ALGORITHM_TERMS)) return { kind: "algorithm" };
  for (const { sceneId, terms } of sceneKeywords()) {
    if (matchesLexicon(prompt, terms)) return { kind: "scene", sceneId };
  }
  return null;
}

/** Default tier-2: implemented in Task 4 (it needs the OpenAI client). */
let defaultClassifier: SceneClassifier | undefined;

/** Registered by the dispatcher so this module stays free of OpenAI imports. */
export function setDefaultClassifier(classify: SceneClassifier): void {
  defaultClassifier = classify;
}

export async function routePrompt(
  prompt: string,
  classify?: SceneClassifier,
  enabled: boolean = env.SCENES_ENABLED,
): Promise<RouteDecision> {
  // Kill switch: with scenes off, nothing below this line can run.
  if (!enabled) return { kind: "algorithm" };

  const fast = fastPath(prompt);
  if (fast !== null) return fast;

  const classifier = classify ?? defaultClassifier;
  if (!classifier) {
    throw new Error("ROUTER_UNCONFIGURED");
  }
  const raw = (await classifier(prompt)).trim();
  if (raw === UNSUPPORTED) return { kind: "unsupported" };
  if (raw === ALGORITHM) return { kind: "algorithm" };
  const known = Object.entries(SCENES).some(
    ([id, manifest]) => id === raw && manifest.status === "live",
  );
  if (known) return { kind: "scene", sceneId: raw };
  // A classifier that invents an id is treated as a no-match, not a crash.
  return { kind: "unsupported" };
}
