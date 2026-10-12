// routes:check — golden prompt table across all three router tiers (spec §4.4).
//
// Runs with NO API key: tier 1 is pure, tier 2 is driven by a table-driven
// fake classifier (Ruling 3), and rows that genuinely need the real LLM are
// opt-in via ROUTES_CHECK_LLM=1 (Ruling 10).
//
// Usage (cwd server/): npm run routes:check

import { routePrompt, type RouteDecision, type SceneClassifier } from "../router";
import { PRESET_TERMS } from "../lexicon";
import { FEATURED_PROMPTS } from "./prompt-fixtures";

interface Case {
  prompt: string;
  expect: RouteDecision;
  /** Injected tier-2 answer. Omit for rows that must resolve in tier 1. */
  fake?: string;
  /** Only run when ROUTES_CHECK_LLM=1 (needs a real key). */
  llm?: boolean;
}

const CASES: Case[] = [
  // Tier 1 — every shipped preset, asserted to need NO classifier call.
  ...FEATURED_PROMPTS.map((prompt) => ({
    prompt,
    expect: { kind: "algorithm" } as RouteDecision,
    fake: undefined,
  })),
  // Tier 1 — scene keywords.
  { prompt: "explain how the heart pumps blood", expect: { kind: "scene", sceneId: "heart" } },
  { prompt: "What does the human heart do?", expect: { kind: "scene", sceneId: "heart" } },
  // Tie-break (Ruling 2): an algorithm term wins even with a scene keyword.
  {
    prompt: "binary search over an array of blood pressure readings",
    expect: { kind: "algorithm" },
  },
  // Tier 2 — fuzzy phrasing resolved by the injected classifier.
  { prompt: "why do my arteries clog up over time", expect: { kind: "scene", sceneId: "heart" }, fake: "heart" },
  { prompt: "walk me through quicksort", expect: { kind: "algorithm" }, fake: "algorithm" },
  { prompt: "what is the capital of France", expect: { kind: "unsupported" }, fake: "unsupported" },
  // A classifier that invents a scene id must not crash or route there.
  { prompt: "tell me about mitosis", expect: { kind: "unsupported" }, fake: "cell-division" },
];

function classifierFor(cases: Case[]): SceneClassifier {
  return async (prompt: string) => {
    const row = cases.find((c) => c.prompt === prompt);
    if (!row?.fake) throw new Error(`routes-check: no injected answer for "${prompt}"`);
    return row.fake;
  };
}

async function main(): Promise<void> {
  const includeLlm = process.env.ROUTES_CHECK_LLM === "1";
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of CASES) {
    if (testCase.llm && !includeLlm) continue;
    // enabled=true: the default env kill switch (SCENES_ENABLED=false) would
    // otherwise short-circuit every row to "algorithm" and make this table
    // meaningless. The flag itself is exercised in the drills, not here.
    const decision = await routePrompt(testCase.prompt, classifierFor(CASES), true);
    const want = JSON.stringify(testCase.expect);
    const got = JSON.stringify(decision);
    if (want === got) passed += 1;
    else failures.push(`  ✗ ${testCase.prompt}\n      expected ${want}\n      got      ${got}`);
  }

  // Tier-1 coverage guard: every preset term must actually be in the lexicon,
  // so adding a new sidebar preset without a lexicon entry fails here (RF1).
  const { matchesLexicon } = await import("../router");
  for (const preset of FEATURED_PROMPTS) {
    if (!matchesLexicon(preset, PRESET_TERMS)) {
      failures.push(`  ✗ preset has no PRESET_TERMS match: ${preset}`);
    } else passed += 1;
  }

  if (failures.length > 0) {
    console.error(`routes:check FAILED — ${failures.length} of ${CASES.length + FEATURED_PROMPTS.length} checks:`);
    for (const line of failures) console.error(line);
    process.exit(1);
  }
  console.log(`routes:check OK — ${passed} checks across all three tiers`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
