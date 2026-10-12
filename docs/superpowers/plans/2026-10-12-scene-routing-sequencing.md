# Scene Routing & Sequencing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 3D-scene catalog into the product's single request path — a three-tier router, a scene sequencer that speaks only catalog IDs, the honest unsupported card, and the rollout flags — spec §6, §4.4 (`routes:check`), §5 fallback ladder, and §11 item 4.

**Architecture:** `POST /api/visualize` gains one dispatch step in front of today's generator. A pure router decides `scene | algorithm | unsupported`; scene hits are expanded from the catalog into self-contained wire steps (Plan 3 already renders them), algorithm hits fall through to the **unchanged** generator, and genuine no-matches return HTTP 200 with a distinct `unsupported` body. Both LLM calls sit inside that one request, so the rate limiter still counts one. Everything is behind `SCENES_ENABLED` (default false), so with the flag off the endpoint is byte-identical to today.

**Tech Stack:** TypeScript (server CommonJS `strict`, zod `^3.23.8`, `openai` structured outputs via `zodResponseFormat`), client Next.js 16 / React 19 (no new deps), `tsx` scripts. Verified repo facts: `server/src/lib/env.ts` (zod env schema), `server/src/services/visualize.service.ts` (86 lines, the algorithm generator + its huge system prompt), `server/src/routes/visualize.routes.ts` (35 lines: limiter → requireAuth → requireCsrf → zod → generate, with 502/503/500 mapping), `server/src/scenes/{catalog,schemas,validate}.ts` (Plan 2), `client/src/lib/visualize.ts` + `ChatWorkspace.tsx` (Plan 1/3 client union + cache).

**Spec:** `docs/superpowers/specs/2026-09-25-scene-subproject-design.md` — §6.1 (three-tier router), §6.2 (sequencing call), §4.2 (server-side expansion), §4.4 (`routes:check`), §5 (fallback ladder), §3.5 (frozen bounds), §7 (verification), §8 steps 3–4, §11 item 4. Executors read the spec alongside this plan.

> **Shell note (verified repo reality):** the harness shell is **Windows PowerShell 5.1**. No `&&` chaining (use one command per line, or `;` deliberately), `$LASTEXITCODE` for exit codes, `Select-String -Path <files> -Pattern '<pat>'` instead of `grep`, `git add` on a single line (backslash continuations do not work). Gate commands run with their own working directory (`server\` or `client\`).

## Global Constraints

- **Every verification pass runs, and passes:** `npx tsc --noEmit` (server) = 0 · `npx tsc --noEmit` (client) = 0 · `npm run build` (client) = success · `npx eslint src/components src/lib src/hooks` (client) = **exactly 3 errors** (pre-existing baseline: `ChatWorkspace.tsx` ×2, `VariableBadges.tsx` ×1) · `npm run scenes:validate` = exit 0 (`scenes:validate OK — 1 scene(s), 0 warning(s)`) · **`npm run routes:check` = exit 0** (new this plan).
- **The algorithm path is untouched in behavior** (spec §6.1: "the DSA path keeps its exact cost and latency"). No change to `llmPlanSchema`, to the algorithm system prompt, or to `generateVisualization`'s existing signature/return. Review Focus 1 enforces this.
- **Frozen contracts (spec §3.5):** `useVisualPlayer` API, `ControlsBar` props, `StepDots`, keyboard/fullscreen, glow styles, `stageType`/`state` enums, **the 6–12 step bound**, the `data-testid="canvas"` never-unmounts invariant, and byte-identical DOM for `kind: "algorithm"`. No new eslint errors, no `any`, no `eslint-disable`, no synchronous `setState` in an effect body, and no mutation of hook-returned values (Ruling 12 of Plan 3).
- **The catalog stays server-owned** (spec §4.2): `SCENES` is never serialized to the client. The router and sequencer read it server-side; the wire scene step carries only expanded geometry + `assetUrl` (the Plan 3 contract, unchanged).
- **One client request** (spec §6.2): router + sequencer calls happen inside the existing `POST /api/visualize` handler, so the existing per-IP limiter counts one call, unchanged.
- **No new dependencies** (spec §7.4): `openai`, `zod`, `express` are already server deps; nothing is added to the client.
- Human QA steps are labeled **HUMAN-ONLY** and are never blocking for implementers (no browser bridge exists for agents on this host).

## Rulings made while writing this plan

1. **`SCENES_ENABLED` gates the entire scene path, default `false`** (spec §8 step 3). When false, `routePrompt` returns `{ kind: "algorithm" }` immediately — no lexicon scan, no LLM call, byte-identical responses. Rollout is therefore a pure env flip with a kill switch.
2. **Algorithm lexicon wins ties over scene keywords.** Both lexicons are scanned; if an algorithm term is present the prompt routes to `algorithm` even when a scene keyword also matches (e.g. "binary search over blood-pressure readings"). Rationale: the DSA path is the product's core; scenes only claim prompts with no algorithm signal. Scene keywords are read from **live** catalog manifests (`SCENES`), never a hardcoded duplicate list.
3. **The LLM classifier and the scene generator are injectable seams.** `routePrompt(prompt, classify?)` and `resolveVisualization(prompt, deps?)` take optional overrides that default to the OpenAI-backed implementations. This is what makes `routes:check` and every RED drill run **offline with zero API spend**, and it is also how the drills exercise all three tiers deterministically. Production wires the real ones and passes nothing.
4. **Wire scene steps carry `kind: "scene"`, stamped server-side.** The client's `normalizeSteps` already preserves an existing `kind` (Plan 1/3 designed it that way), so no client-side inference and no catalog data are needed. Algorithm steps stay unstamped exactly as today.
5. **Unsupported is a success, never an error, and never cached.** HTTP 200 `{ status: "unsupported", suggestions: string[] }`; the card is visually distinct from the red error+retry panel; the suggestions live in in-memory React state keyed by session id, **not** in the persisted `ChatSession`, so a refresh re-asks (spec §6.1 "never cached"). Conversely, **router/sequencer failures are not "unsupported"** — they fall through to the existing error+retry path (spec §6.1).
6. **Progress copy is time-staged on the client.** A single HTTP request cannot stream the router's internal stages, so the client shows `Choosing a scene or algorithm…` for the first ~3s and then the existing generation copy (spec §6.2's intent, honestly delivered).
7. **Scene plans keep the frozen 6–12 step bound and ≤2 callouts/step** (spec §3.5 + §6.2). The committed 4-step `HEART_SEQUENCE` fixture is dev-only authoring data from Plan 3 and is exempt — it never passes through this pipeline.
8. **`SceneManifest` gains a `title`** for the suggestion list and future UI, validated by `scenes:validate`. It deliberately does **not** enter the client projection (Plan 3 Ruling 1 keeps that minimal), so the definition-drift check is unaffected. With one live scene, `suggestions` has one entry — the spec's "2–3" is read as *up to* 3.
9. **The error contract is extended additively.** Scene failures reuse the route's existing mapping: invalid plan → `502 { error: "SCENE_INVALID" }`, timeouts/aborts → `503 { error: "VISUAL_TIMEOUT" }` via the existing regex. The algorithm path's codes and behavior are unchanged.
10. **`routes:check` needs no API key.** Its golden table pins tier 1 (lexicon) and tier 3 outcomes deterministically and drives tier 2 through an injected table-driven classifier; rows that would need the real LLM are opt-in behind an env flag and skipped by default.

## Review Focus

1. **DSA regression — an extra LLM call or a misroute** would silently tax every algorithm user (spec §6.1's core promise) → **Task 2** pins the lexicon to cover all four shipped sidebar presets (verified against the real `FEATURED_PROMPTS` strings) and `routes:check` asserts zero classifier invocations for those rows.
2. **"Unsupported" as a disguise for failure** — a router timeout or a 5xx rendered as the unsupported card would tell users their question is unanswerable when it is merely broken → **Task 4** routes every thrown error to the existing error+retry path and never to the unsupported body; **Task 5** renders the card only for `status === "unsupported"`.
3. **Runtime ID hallucination** — the LLM must never emit coordinates, and expansion must fail loud rather than silently drop a bad `shotId`/`anchorId` → **Task 3** builds the plan schema from `buildSceneStepSchema` (enum-only) and makes `expandSceneSteps` throw on any id the catalog does not contain, with a RED drill proving the throw.
4. **Cache correctness** — scene steps must survive `localStorage` hydration and re-render with **0 API calls** (spec §7 item 5), while unsupported must leave no trace after refresh (Ruling 5) → **Task 5** pins the in-memory-only suggestions state and the `kind`-preserving hydration path.
5. **Flag safety** — `SCENES_ENABLED=false` must be a true no-op, not a partial rollout → **Task 1** pins the env default and **Task 4** includes a RED drill proving that with the flag off the dispatcher invokes neither the classifier nor the scene generator.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `server/src/lib/env.ts` | modify | `SCENES_ENABLED` (bool, default false) + `OPENAI_MODEL_SCENE` (default `gpt-4o-mini`) |
| `server/src/scenes/types.ts` | modify | `SceneManifest.title` |
| `server/src/scenes/catalog.ts` | modify | `heart.title = "Heart"` |
| `server/src/scenes/validate.ts` | modify | non-empty `title` check |
| `server/src/validators/visualize.ts` | modify | scene wire step schema, `wireStepSchema` union, `unsupportedResponseSchema` |
| `server/src/scenes/lexicon.ts` | create | the algorithm lexicon (data only, with provenance comments) |
| `server/src/scenes/router.ts` | create | tier-1 scan, tier-2 classifier seam, tier-3 decision |
| `server/src/scenes/expand.ts` | create | `SceneStepPayload[]` → wire steps (the §4.2 expansion) |
| `server/src/scenes/sequencer.ts` | create | strict per-scene plan schema + pedagogy prompt + generation |
| `server/src/scenes/tools/routes-check.ts` | create | golden prompt table + assertions |
| `server/src/services/visualize.service.ts` | modify | `resolveVisualization` dispatch + suggestion titles (generator untouched) |
| `server/src/routes/visualize.routes.ts` | modify | call the dispatcher, 200-unsupported, `SCENE_INVALID` mapping |
| `server/package.json` | modify | `routes:check` script |
| `client/src/lib/visualize.ts` | modify | response union + `isUnsupported` guard |
| `client/src/components/visual/UnsupportedCard.tsx` | create | the honest card (distinct from error+retry) |
| `client/src/components/ChatWorkspace.tsx` | modify | in-memory suggestions state, card render, staged copy |
| `docs/wiki/{api,architecture,components}.md` | modify | Task 6 (AGENTS.md mandate) |

Decomposition rationale: the router is pure and offline-testable, so it lands before anything that spends tokens; expansion is pure and lands before the sequencer that feeds it; dispatch is last on the server because it is the only place the three subsystems meet; the client is last so it can be written against the final wire contract.

## Non-goals (explicitly other plans/futures)

- **Procedural scenes** (solar system, parametric recipes) and the procedural rung of the fallback ladder — future spec work (spec §8 step 4 grows the catalog).
- **Per-generation logging/telemetry, the QA pass, and the flag flip itself** → Plan 5 (spec §11 item 5).
- System Design 2D, narration, uploads (spec §9).
- Any change to the algorithm generator, its prompt, or its schema.

---

### Task 1: Rollout flags + wire response contract

**Files:**
- Modify: `server/src/lib/env.ts`, `server/src/scenes/types.ts`, `server/src/scenes/catalog.ts`, `server/src/scenes/validate.ts`, `server/src/validators/visualize.ts`

**Interfaces:**
- Consumes: nothing (Plan 2's catalog; the existing validators).
- Produces (relied on by Tasks 2–5):
  - `env.SCENES_ENABLED: boolean`, `env.OPENAI_MODEL_SCENE: string`
  - `SceneManifest.title: string`
  - `sceneStepSchema`, `wireStepSchema`, `visualizeWireResponseSchema` (the union response), `unsupportedResponseSchema`, type `UnsupportedResponse` from `server/src/validators/visualize.ts` — `visualizeResponseSchema` stays algorithm-only so the generator is untouched

- [ ] **Step 1: Add the two env flags**

In `server/src/lib/env.ts`, inside `envSchema`, immediately after the `OPENAI_MODEL` line, add:

```ts
  // --- 3D scenes (router + sequencer) ---------------------------------------
  // SCENES_ENABLED gates the whole scene path (spec §8 rollout step 3). When
  // false every prompt routes to today's algorithm generator, so the DSA path
  // keeps its exact cost/latency and no new failure mode exists. Flip with a
  // container restart — it is the kill switch.
  SCENES_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Model used for BOTH the scene router and the scene sequencer (spec §6.2:
  // small model by default, promote empirically). OPENAI_MODEL is untouched so
  // algorithm quality/cost never moves.
  OPENAI_MODEL_SCENE: z.string().min(1).default("gpt-4o-mini"),
```

`transform` runs during `safeParse`, so `env.SCENES_ENABLED` is a real boolean at every call site.

- [ ] **Step 2: Add `title` to the manifest and enforce it**

In `server/src/scenes/types.ts`, add one field to `SceneManifest` directly after `id`:

```ts
  /** Human title for suggestions/UI (spec §6.1). Never crosses to the client. */
  title: string;
```

In `server/src/scenes/catalog.ts`, add `title: "Heart",` to the `heart` manifest directly after `id: "heart",`.

In `server/src/scenes/validate.ts`, inside `checkScene`, directly after the `m.id !== id` check, add:

```ts
  if (m.title.trim().length === 0) fail(`scene "${id}": title is empty`);
```

The definition projection (`server/src/scenes/definition.ts`) deliberately does not read `title`, so the committed `client/src/lib/sceneDefinitions/heart.json` stays byte-identical and the drift check stays green.

- [ ] **Step 3: Add the scene wire schemas and widen the response union**

In `server/src/validators/visualize.ts`, append after `visualStepSchema`:

```ts
// --- 3D scene steps (server-expanded wire shape, spec §4.2) ------------------
// The client never sees catalog IDs alone: `shot` carries the resolved pose and
// each callout carries its resolved `pos`, so `SCENES` never has to cross the
// boundary (Plan 3 Ruling 1) and cache hydration stays steps-only.
export const sceneVec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const sceneCalloutSchema = z.object({
  anchorId: z.string().min(1),
  pos: sceneVec3Schema,
  text: z.string().min(1).max(160),
});

export const sceneStepSchema = z.object({
  kind: z.literal("scene"),
  stepIndex: z.number().int().min(0),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(160).optional(),
  explanation: z.string().min(1).max(600),
  sceneId: z.string().min(1),
  shotId: z.string().min(1),
  shot: z.object({
    pos: sceneVec3Schema,
    target: sceneVec3Schema,
    // Same envelope the gate enforces (spec §4.4) — an out-of-range pose must
    // never leave the server.
    fov: z.number().min(15).max(120),
  }),
  assetUrl: z.string().min(1),
  highlights: z.array(z.string().min(1)).max(12),
  callouts: z.array(sceneCalloutSchema).max(2),
  notes: z.array(z.string().min(1).max(240)).max(6).optional(),
});

/**
 * Wire step union. `sceneStepSchema` is tried first: a scene step fails
 * `visualStepSchema` (no stageType/elements/codeLines), and an algorithm step
 * fails `sceneStepSchema` (no `kind`), so the discrimination is structural.
 */
export const wireStepSchema = z.union([sceneStepSchema, visualStepSchema]);
```

Then add the wire-level response schema **alongside** the existing one — do NOT widen `visualizeResponseSchema`. `generateVisualization` parses with it and returns `Promise<VisualStep[]>`; widening it would either break that signature or force a change to the algorithm path, which this plan forbids (Ruling 1, spec §6.1). The union schema exists for the route/response contract and the client mirror:

```ts
/**
 * Full wire response — either kind. `visualizeResponseSchema` above stays
 * algorithm-only so `generateVisualization`'s signature and behavior are
 * untouched (spec §6.1); this one is what the route's response contract and
 * the client mirror are checked against.
 */
export const visualizeWireResponseSchema = z.object({
  steps: z.array(wireStepSchema).min(6).max(12),
});

/** HTTP 200 "no match" body — a first-class outcome, not an error (spec §6.1). */
export const unsupportedResponseSchema = z.object({
  status: z.literal("unsupported"),
  suggestions: z.array(z.string().min(1)).max(3),
});

export type UnsupportedResponse = z.infer<typeof unsupportedResponseSchema>;
```

`callouts` is capped at 2 and `notes` at 6 here so the frozen pedagogy bounds are enforced **server-side at the wire**, not only in the prompt.

- [ ] **Step 4: Gates**

Run (cwd `server\`): `npx tsc --noEmit` → 0 errors.
Run (cwd `server\`): `npm run scenes:validate` → exit 0, `scenes:validate OK — 1 scene(s), 0 warning(s)` (the new `title` check passes; the definition JSON is untouched).
Run (cwd `client\`): `npx tsc --noEmit` → 0 errors (the widened union must not disturb the client, which has its own types).

- [ ] **Step 5: RED drill — an empty title must fail the gate**

Edit `server/src/scenes/catalog.ts`: change `title: "Heart",` to `title: "  ",`.
Run (cwd `server\`): `npm run scenes:validate` → **exit 1**, stderr naming `scene "heart": title is empty`.
Restore: `git add server/src/scenes/catalog.ts` **first** (so `git checkout --` restores the staged version that contains `title`, not the pre-task HEAD), then `git checkout -- server/src/scenes/catalog.ts`.
Run (cwd `server\`): `npm run scenes:validate` → exit 0.

- [ ] **Step 6: Commit**

```powershell
git add server/src/lib/env.ts server/src/scenes/types.ts server/src/scenes/catalog.ts server/src/scenes/validate.ts server/src/validators/visualize.ts
git commit -m "feat: add scene rollout flags and the scene wire response contract"
```

**Review Focus:** `env.SCENES_ENABLED` is a real boolean with default `false` (Ruling 1); the algorithm generator, its schema and its prompt are byte-identical; the wire union's two members are structurally discriminated; `callouts`/`notes`/`fov` caps match the spec bounds; the definition JSON is untouched so the drift check still passes.

---

### Task 2: Three-tier router + `routes:check`

**Files:**
- Create: `server/src/scenes/lexicon.ts`, `server/src/scenes/router.ts`, `server/src/scenes/tools/routes-check.ts`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: Task 1's `env.SCENES_ENABLED`; `SCENES` from `server/src/scenes/catalog.ts`.
- Produces (relied on by Tasks 4 and 5):
  - `type RouteDecision = { kind: "algorithm" } | { kind: "scene"; sceneId: string } | { kind: "unsupported" }`
  - `type SceneClassifier = (prompt: string) => Promise<string>` — tier-2 seam
  - `function sceneKeywords(): string[]` (live catalog words)
  - `function matchesLexicon(prompt: string, terms: string[]): boolean`
  - `function fastPath(prompt: string): RouteDecision | null`
  - `function routePrompt(prompt: string, classify?: SceneClassifier, enabled?: boolean): Promise<RouteDecision>` — `enabled` defaults to `env.SCENES_ENABLED` and exists so drills can exercise both sides of the flag deterministically without mutating the environment
  - npm script `routes:check`

- [ ] **Step 1: Write the algorithm lexicon (data + provenance)**

Create `server/src/scenes/lexicon.ts`:

```ts
// Algorithm-side routing vocabulary (spec §6.1 tier 1).
//
// PROVENANCE: the first block exists because all four shipped sidebar presets
// (client/src/components/ChatWorkspace.tsx FEATURED_PROMPTS) MUST resolve here —
// a preset that fell through to the LLM router would silently add a call to
// every canned click. The rest is the "small algorithm lexicon" the spec calls
// for, chosen from the topics the algorithm system prompt already names.
// Words are matched on word boundaries, case-insensitively; keep entries
// single-token so the match cannot fire inside an unrelated word.

/** Must cover every FEATURED_PROMPTS string. routes:check enforces this. */
export const PRESET_TERMS: readonly string[] = [
  // LeetCode 112: Path Sum
  "leetcode", "path sum", "binary tree", "depth-first", "depth first",
  // Two Sum: Two-Pointer Technique
  "two sum", "two-pointer", "two pointer", "sorted array",
  // How Credit Scores Work
  "credit score", "payment history", "credit utilization",
  // TCP 3-Way Handshake
  "tcp", "handshake", "syn-ack", "syn ack", "packet",
];

export const ALGORITHM_TERMS: readonly string[] = [
  ...PRESET_TERMS,
  "algorithm", "algorithms", "leetcode", "dsa", "array", "arrays",
  "binary search", "sliding window", "two pointers", "sorting", "sort",
  "hash map", "hashmap", "stack", "queue", "linked list", "recursion",
  "graph", "dfs", "bfs", "dynamic programming", "backtracking", "greedy",
  "complexity", "pseudocode", "big o", "data structure",
];
```

- [ ] **Step 2: Write the router**

Create `server/src/scenes/router.ts`:

```ts
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
```

- [ ] **Step 3: Write the golden-table checker**

Create `server/src/scenes/tools/routes-check.ts`:

```ts
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

/** Print every failure and exit non-zero. Shared by both check phases. */
function failAndExit(failures: string[]): never {
  console.error(`routes:check FAILED — ${failures.length} check(s):`);
  for (const line of failures) console.error(line);
  process.exit(1);
}

async function main(): Promise<void> {
  const includeLlm = process.env.ROUTES_CHECK_LLM === "1";
  let passed = 0;
  const failures: string[] = [];

  // Tier-1 coverage guard runs FIRST and EXITS on failure: an uncovered preset
  // must report "preset has no PRESET_TERMS match", not the classifier throw
  // that would shadow it when its row is reached below. Collecting the failure
  // and continuing is NOT enough — the row still throws (found in Task 2).
  const { matchesLexicon } = await import("../router");
  for (const preset of FEATURED_PROMPTS) {
    if (!matchesLexicon(preset, PRESET_TERMS)) {
      failures.push(`  ✗ preset has no PRESET_TERMS match: ${preset}`);
    } else passed += 1;
  }
  if (failures.length > 0) failAndExit(failures);

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

  if (failures.length > 0) failAndExit(failures);
  console.log(`routes:check OK — ${passed} checks across all three tiers`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

Create the shared prompt fixture the checker imports (the client presets, verbatim, so the check cannot drift from the shipped strings):

```ts
// server/src/scenes/tools/prompt-fixtures.ts
// The four shipped sidebar prompts, copied verbatim from
// client/src/components/ChatWorkspace.tsx (FEATURED_PROMPTS). Presets must
// resolve in tier 1 (no LLM call), so this file is the contract's other side.
// If you change a preset there, change it here or routes:check fails loudly.
export const FEATURED_PROMPTS: readonly string[] = [
  "Explain LeetCode 112 Path Sum with binary tree depth-first search step-by-step target subtraction.",
  "Explain Two Sum algorithm using two pointers on a sorted array with left and right pointers moving inward.",
  "Explain how credit scores are calculated: payment history (35%), credit utilization (30%), length of history, and impact of high debt.",
  "Explain TCP 3-Way Handshake step-by-step with SYN, SYN-ACK, and ACK packet state transitions between client and server.",
];
```

- [ ] **Step 4: Add the script and run it**

In `server/package.json` `"scripts"`, add:
```json
"routes:check": "tsx src/scenes/tools/routes-check.ts",
```

Run (cwd `server\`): `npm run routes:check`
Expected: exit 0, stdout `routes:check OK — 15 checks across all three tiers` (11 routing cases + 4 preset-term checks).

- [ ] **Step 5: RED drill — a lexicon gap must be caught**

Edit `server/src/scenes/lexicon.ts`: remove the **whole** credit line from `PRESET_TERMS` — i.e. delete `"credit score", "payment history", "credit utilization",` in one edit.
> Removing only `"credit score",` is **not** a valid drill: the preset string still contains "payment history" and "credit utilization", so the tier-1 coverage guard stays green and the drill proves nothing (found empirically in Task 2).

Run (cwd `server\`): `npm run routes:check` → **exit 1**, stderr naming the uncovered preset.
Restore: `git add server/src/scenes/lexicon.ts` first (the file is new, so `git checkout --` restores the staged version, not "file not found"), then `git checkout -- server/src/scenes/lexicon.ts`.
Run: `npm run routes:check` → exit 0.

- [ ] **Step 6: Gates**

Run (cwd `server\`): `npx tsc --noEmit` → 0; `npm run scenes:validate` → exit 0.

- [ ] **Step 7: Commit**

```powershell
git add server/src/scenes/lexicon.ts server/src/scenes/router.ts server/src/scenes/tools/routes-check.ts server/src/scenes/tools/prompt-fixtures.ts server/package.json
git commit -m "feat: add the three-tier prompt router and routes:check golden table"
```

**Review Focus:** the flag short-circuit is first and unconditional (Ruling 1); `PRESET_TERMS` covers all four verbatim preset strings and `routes:check` proves it; algorithm-first tie-break is explicit and tested; the classifier seam means `routes:check` needs no key; a classifier that invents an id degrades to `unsupported` rather than crashing; no OpenAI import in `router.ts`.

---

### Task 3: Scene sequencer + server-side expansion

**Files:**
- Create: `server/src/scenes/expand.ts`, `server/src/scenes/sequencer.ts`

**Interfaces:**
- Consumes: Task 1's `wireStepSchema`; `buildSceneStepSchema` and `SceneManifest` from Plan 2; `getOpenAIClient`/`env.OPENAI_MODEL_SCENE`; the `SCENES` catalog.
- Produces:
  - `function expandSceneSteps(m: SceneManifest, payloads: SceneStepPayload[]): SceneStepWire[]` — throws on any unknown id
  - `function buildScenePlanSchema(m: SceneManifest): z.ZodType<{ steps: ScenePlanEntry[] }>`
  - `async function generateScenePlan(prompt: string, m: SceneManifest): Promise<SceneStepWire[]>` — throws `SCENE_INVALID` (status 502) or a timeout/abort error

- [ ] **Step 1: Write the expansion (spec §4.2)**

Create `server/src/scenes/expand.ts` — prose in, geometry resolved, one pass, every id lookup a hard failure:

```ts
export interface ScenePlanEntry {
  title: string;
  subtitle?: string;
  explanation: string;
  notes?: string[];
  payload: SceneStepPayload;
}

export function expandSceneSteps(
  m: SceneManifest,
  entries: ScenePlanEntry[],
): SceneStepWire[] {
  if (m.asset.kind !== "mesh") fail(`SCENE_UNSUPPORTED_ASSET: ${m.id}`);
  // Hoisted: TS property narrowing does not survive into the map() closure.
  const assetUrl = m.asset.url;
  const shots = new Map(m.shots.map((shot) => [shot.id, shot]));
  const anchors = new Map(m.anchors.map((anchor) => [anchor.id, anchor]));

  return entries.map((entry, index) => {
    const { payload } = entry;
    if (payload.sceneId !== m.id) fail(`SCENE_ID_MISMATCH: ${payload.sceneId} != ${m.id}`);
    const shot = shots.get(payload.shotId);
    if (!shot) fail(`SCENE_UNKNOWN_SHOT: ${payload.shotId}`);

    const callouts = payload.callouts.map((callout) => {
      const anchor = anchors.get(callout.anchorId);
      if (!anchor) fail(`SCENE_UNKNOWN_ANCHOR: ${callout.anchorId}`);
      return { anchorId: anchor.id, pos: anchor.pos, text: callout.text.trim() };
    });

    return {
      kind: "scene",
      stepIndex: index,
      title: entry.title,
      subtitle: entry.subtitle,
      explanation: entry.explanation,
      sceneId: m.id,
      shotId: shot.id,
      shot: { pos: shot.pos, target: shot.target, fov: shot.fov },
      assetUrl: m.asset.url,
      highlights: [...payload.highlights],
      callouts,
      notes: entry.notes,
    };
  });
}
```

This is the version you keep; Step 1's sketch is superseded (it is shown only so the id-lookup failure modes are visible before the final shape).

- [ ] **Step 2: Write the sequencer**

Create `server/src/scenes/sequencer.ts`:

```ts
// Scene plan generation (spec §6.2). The model may only emit IDs and prose:
// geometry is resolved server-side by expandSceneSteps, so a hallucinated
// coordinate is impossible by construction (the schema has no coordinate
// fields and is .strict()).

import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient } from "../lib/openai";
import { env } from "../lib/env";
import { buildSceneStepSchema } from "./schemas";
import { expandSceneSteps, type ScenePlanEntry, type SceneStepWire } from "./expand";
import type { SceneManifest } from "./types";

const SYSTEM_PROMPT = (manifest: SceneManifest): string => `You are Chalk, directing a 3D scene called "${manifest.title}".
Available shots: ${manifest.shots.map((s) => `${s.id} (${s.label})`).join("; ")}.
Selectable parts: ${manifest.parts.map((p) => `${p.id} (${p.label})`).join("; ")}.
Anchors you may pin callouts to: ${manifest.anchors.map((a) => a.id).join("; ")}.

RULES:
- Produce 6 to 12 steps. Never invent a shotId, part id, or anchorId: they must
  come from the lists above. You cannot set camera positions; you CHOOSE shots.
- MANDATORY 3-PHASE FLOW: (1) ESTABLISH WIDE — step 1 uses the widest shot and
  frames the whole subject; (2) EXPLORE PARTS — middle steps move between shots,
  highlighting one or two parts at a time and naming them with callouts;
  (3) CONCLUDE — the final step returns to a wide shot and ties the parts
  together.
- One concept per step. At most 2 callouts per step, each pinned to a listed
  anchor. 'highlights' must be 1-3 part ids from the list.
- 'explanation' is 2 to 4 sentences (under 600 characters): say WHY, not just
  what happens, and end by pointing at what the next step will show.
- 'notes' is an optional short list (max 6) of inspector lines - plain facts
  about what the viewer is looking at. Never repeat the explanation.
- Warm, precise, teaching tone. No emoji, no markdown headers.`;

export function buildScenePlanSchema(manifest: SceneManifest) {
  return z
    .object({
      steps: z
        .array(
          z
            .object({
              title: z.string().min(1).max(120),
              subtitle: z.string().max(160).optional(),
              explanation: z.string().min(1).max(600),
              notes: z.array(z.string().min(1).max(240)).max(6).optional(),
              step: buildSceneStepSchema(manifest),
            })
            // Spec §6.2 caps callouts at 2/step. `buildSceneStepSchema` does not
            // carry that cap and the wire schema is never executed at runtime, so
            // without this check nothing would enforce it (found in Task 3 review).
            .strict()
            .superRefine((entry, ctx) => {
              if (entry.step.callouts.length > 2) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ["step", "callouts"],
                  message: "at most 2 callouts per step (spec §6.2)",
                });
              }
            }),
        )
        .min(6)
        .max(12),
    })
    .strict();
}

export async function generateScenePlan(
  prompt: string,
  manifest: SceneManifest,
): Promise<SceneStepWire[]> {
  const client = getOpenAIClient();
  const schema = buildScenePlanSchema(manifest);
  const completion = await client.beta.chat.completions.parse(
    {
      model: env.OPENAI_MODEL_SCENE,
      messages: [
        { role: "system", content: SYSTEM_PROMPT(manifest) },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(schema, "scene_plan"),
      temperature: 0.6,
    },
    { timeout: 90_000 },
  );

  const parsed = schema.safeParse(completion.choices[0]?.message.parsed);
  if (!parsed.success) {
    console.error(
      "SCENE_INVALID",
      JSON.stringify(parsed.error.issues),
      `received ${completion.choices[0]?.message.parsed?.steps.length ?? 0} steps`,
    );
    throw Object.assign(new Error("SCENE_INVALID"), { status: 502 });
  }

  const entries: ScenePlanEntry[] = parsed.data.steps.map((step) => ({
    title: step.title,
    subtitle: step.subtitle,
    explanation: step.explanation,
    notes: step.notes,
    payload: step.step,
  }));
  return expandSceneSteps(manifest, entries);
}
```

- [ ] **Step 3: Gates**

Run (cwd `server\`): `npx tsc --noEmit` → 0 errors.
Run (cwd `server\`): `npm run scenes:validate` → exit 0.

- [ ] **Step 4: RED drill — expansion must fail loud on a bad id**

Create a temporary drill file `server/src/scenes/tools/expand-drill.ts`:

```ts
// TEMPORARY drill (deleted in Step 6). Proves expansion fails loud rather than
// dropping a hallucinated id.
import { SCENES } from "../catalog";
import { expandSceneSteps } from "../expand";
import type { ScenePlanEntry } from "../expand";

const heart = SCENES.heart;
const good: ScenePlanEntry = {
  title: "Overview",
  explanation: "x",
  payload: { sceneId: "heart", shotId: "overview", highlights: [], callouts: [] },
};

const cases: { name: string; entry: ScenePlanEntry; expect: string }[] = [
  {
    name: "unknown shot",
    entry: { ...good, payload: { ...good.payload, shotId: "orbit-1" } },
    expect: "SCENE_UNKNOWN_SHOT",
  },
  {
    name: "unknown anchor",
    entry: {
      ...good,
      payload: { ...good.payload, callouts: [{ anchorId: "ghost", text: "x" }] },
    },
    expect: "SCENE_UNKNOWN_ANCHOR",
  },
  {
    name: "foreign scene",
    entry: { ...good, payload: { ...good.payload, sceneId: "solar-system" } },
    expect: "SCENE_ID_MISMATCH",
  },
];

let failed = 0;
for (const testCase of cases) {
  try {
    expandSceneSteps(heart, [testCase.entry]);
    console.error(`DRILL FAIL: ${testCase.name} did not throw`);
    failed += 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes(testCase.expect)) {
      console.error(`DRILL FAIL: ${testCase.name} threw "${message}", expected ${testCase.expect}`);
      failed += 1;
    } else {
      console.log(`ok: ${testCase.name} -> ${message}`);
    }
  }
}
if (failed > 0) process.exit(1);
console.log(`expand drill OK — ${cases.length} id-failure modes`);
```

Run (cwd `server\`): `npx tsx src/scenes/tools/expand-drill.ts`
Expected: exit 0, three `ok:` lines and `expand drill OK — 3 id-failure modes`.
If any line says `DRILL FAIL`, expansion is not failing loud — fix before continuing.

- [ ] **Step 5: Delete the drill and commit**

```powershell
Remove-Item server/src/scenes/tools/expand-drill.ts
git add server/src/scenes/expand.ts server/src/scenes/sequencer.ts
git commit -m "feat: add the scene sequencer and server-side id expansion"
```

**Review Focus:** the plan schema has no coordinate fields and is `.strict()` (a hallucinated coordinate is a parse failure, not a silent default); every id lookup in `expandSceneSteps` throws with a named error and `status: 502`; the 6–12 bound and the ≤2-callout/≤6-note caps are enforced in code, not only in the prompt; the system prompt lists the actual catalog ids for the scene it is directing.

---

### Task 4: Dispatch in the service + route wiring

**Files:**
- Modify: `server/src/services/visualize.service.ts`, `server/src/routes/visualize.routes.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`env`, schemas, `routePrompt`/`setDefaultClassifier`, `generateScenePlan`, `SCENES`).
- Produces:
  - `type ResolveResult = { steps: SceneStepWire[] } | { kind: "scene" } | UnsupportedResponse` (internal shape; the route converts it to JSON)
  - `async function resolveVisualization(prompt: string, deps?: { classify?: SceneClassifier; generateScene?: (prompt: string, manifest: SceneManifest) => Promise<SceneStepWire[]> }): Promise<VisualizeResponse>`
  - `function defaultSceneClassifier(prompt: string): Promise<string>` — the real tier-2 LLM call, registered via `setDefaultClassifier`
  - Route behavior: 200 `{status:"unsupported", suggestions}` on a no-match; `502 SCENE_INVALID`; existing algorithm paths untouched

- [ ] **Step 1: Add the real tier-2 classifier + the dispatcher to `visualize.service.ts`**

Append to `server/src/services/visualize.service.ts` (nothing above changes):

```ts
// --- Scene routing (spec §6.1/§6.2) -----------------------------------------
// Everything below is ADDITIVE: generateVisualization and its prompt are
// untouched, so with SCENES_ENABLED=false the endpoint behaves exactly as
// before (Ruling 1). `zodResponseFormat`, `z` and `getOpenAIClient` are already
// imported at the top of this file — do NOT re-import them; add only these:

import { env } from "../lib/env";
import { SCENES } from "../scenes/catalog";
import {
  routePrompt,
  setDefaultClassifier,
  type SceneClassifier,
} from "../scenes/router";
import { generateScenePlan } from "../scenes/sequencer";
import type { SceneStepWire } from "../scenes/expand";
import type { SceneManifest } from "../scenes/types";

const routeDecisionSchema = z.object({
  route: z.string().min(1),
});

/**
 * Tier 2. A tiny structured call over a ~1K-token catalog table (spec §6.1).
 * Only reached for prompts the lexicon did not claim, so the DSA path never
 * pays for it. Throws on timeout/5xx — callers must treat that as an error,
 * never as "unsupported" (Ruling 5).
 */
export const defaultSceneClassifier: SceneClassifier = async (prompt) => {
  const client = getOpenAIClient();
  const table = Object.entries(SCENES)
    .filter(([, manifest]) => manifest.status === "live")
    .map(
      ([id, manifest]) =>
        `- ${id} ("${manifest.title}"): ${manifest.keywords.join(", ")}`,
    )
    .join("\n");

  const completion = await client.beta.chat.completions.parse(
    {
      model: env.OPENAI_MODEL_SCENE,
      messages: [
        {
          role: "system",
          content: `You route a user's question to exactly one destination.
Destinations:
${table}
- algorithm: data structures, algorithms, LeetCode problems, systems/networking explainers
- unsupported: anything else (travel, cooking, politics, trivia)

Answer with the single best destination id and nothing else.`,
        },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(routeDecisionSchema, "scene_route"),
      temperature: 0,
    },
    { timeout: 15_000 },
  );
  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) throw new Error("ROUTER_INVALID");
  return parsed.route;
};

setDefaultClassifier(defaultSceneClassifier);

/** Live scene titles for the unsupported card (spec §6.1: 2-3 suggestions). */
export function sceneSuggestions(): string[] {
  return Object.values(SCENES)
    .filter((manifest) => manifest.status === "live")
    .slice(0, 3)
    .map((manifest) => manifest.title);
}

export interface VisualizeDeps {
  classify?: SceneClassifier;
  generateScene?: (prompt: string, manifest: SceneManifest) => Promise<SceneStepWire[]>;
  /** Algorithm-generator seam. Defaults to the real generateVisualization;
   *  injected only by the offline drill so the algorithm tier needs no API key. */
  generateAlgorithm?: typeof generateVisualization;
  /** Overrides the rollout flag; production callers omit it (drills use it). */
  enabled?: boolean;
}

/**
 * The one dispatch the route handler calls. Returns either wire steps or the
 * 200-unsupported body; both algorithm and scene failures throw so the route
 * keeps its existing 502/503/500 mapping.
 */
export async function resolveVisualization(prompt: string, deps: VisualizeDeps = {}) {
  const decision = await routePrompt(prompt, deps.classify, deps.enabled);
  if (decision.kind === "unsupported") {
    return { status: "unsupported" as const, suggestions: sceneSuggestions() };
  }
  if (decision.kind === "algorithm") {
    return { steps: await (deps.generateAlgorithm ?? generateVisualization)(prompt) };
  }
  const manifest = SCENES[decision.sceneId];
  const generate = deps.generateScene ?? generateScenePlan;
  return { steps: await generate(prompt, manifest) };
}
```

If your editor refuses duplicate imports at the top of the file, merge the new `import` lines into the existing import block instead of adding a second one — one import per module is the rule.

- [ ] **Step 2: Wire the route**

In `server/src/routes/visualize.routes.ts`, replace the `import { generateVisualization } …` line with `import { resolveVisualization } from "../services/visualize.service";` and replace the try block with:

```ts
  try {
    const result = await resolveVisualization(body.data.prompt);
    if ("status" in result) {
      // A successful no-match: HTTP 200, never an error, never cached.
      res.json(result);
      return;
    }
    res.json({ steps: result.steps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Visualization failed";
    const statusProp = (err as Error & { status?: number }).status;
    // SCENE_* first: scene failures also carry status 502, so the generic 502
    // branch below would otherwise swallow them and report VISUAL_INVALID
    // (found in Task 4 review).
    if (message.startsWith("SCENE_")) {
      res.status(502).json({ error: "SCENE_INVALID" });
      return;
    }
    if (statusProp === 502 || message === "VISUAL_INVALID") {
      res.status(502).json({ error: "VISUAL_INVALID" });
      return;
    }
    if (err instanceof Error && (/timeout|abort/i.test(message) || /timeout|abort/i.test(err.name))) {
      res.status(503).json({ error: "VISUAL_TIMEOUT" });
      return;
    }
    res.status(statusProp ?? 500).json({ error: message });
  }
```

Everything else in the route (limiter → `requireAuth` → `requireCsrf` → request validation) is unchanged, so the rate limiter still counts one request per user action (spec §6.2).

- [ ] **Step 3: Gates**

Run (cwd `server\`): `npx tsc --noEmit` → 0 errors.
Run (cwd `server\`): `npm run scenes:validate` → exit 0.
Run (cwd `server\`): `npm run routes:check` → exit 0.

- [ ] **Step 4: RED drill — the flag must make the scene path unreachable**

Create a temporary drill `server/src/scenes/tools/dispatch-drill.ts`:

```ts
// TEMPORARY drill (deleted in Step 5). Proves the rollout flag is a true no-op
// and that all three tiers dispatch correctly, entirely offline: the classifier
// and the scene generator are injected, and `enabled` overrides the flag so no
// environment mutation is needed.
import { resolveVisualization } from "../../services/visualize.service";
import type { SceneStepWire } from "../expand";
import type { VisualStep } from "../../validators/visualize";

let classifierCalls = 0;
let sceneCalls = 0;

const classify = async () => {
  classifierCalls += 1;
  return "heart";
};

// Injected so the algorithm tier needs no API key (this host's key is expired,
// and a drill must never depend on network or credentials).
let algorithmCalls = 0;
const generateAlgorithm = async (): Promise<VisualStep[]> => {
  algorithmCalls += 1;
  return [];
};

/** `steps` is `VisualStep[] | SceneStepWire[]` across the union — read its length safely. */
function count(steps: unknown): number {
  return Array.isArray(steps) ? steps.length : -1;
}

const generateScene = async (): Promise<SceneStepWire[]> => {
  sceneCalls += 1;
  return [
    {
      kind: "scene",
      stepIndex: 0,
      title: "Overview",
      explanation: "All five hearts.",
      sceneId: "heart",
      shotId: "overview",
      shot: { pos: [0, 0, 4.2], target: [0, 0, 0], fov: 45 },
      assetUrl: "/scenes/heart.glb",
      highlights: [],
      callouts: [],
    },
  ];
};

async function main(): Promise<void> {
  // Flag OFF: a scene-keyword prompt must NOT reach the classifier (RF5).
  const off = await resolveVisualization("explain how the heart pumps blood", {
    classify,
    generateScene,
    generateAlgorithm,
    enabled: false,
  });
  if (!("steps" in off)) throw new Error("flag-off must not produce unsupported");
  if (classifierCalls !== 0) throw new Error("flag-off invoked the classifier");
  if (sceneCalls !== 0) throw new Error("flag-off invoked the scene generator");
  if (algorithmCalls !== 1) throw new Error("flag-off must still run the algorithm path once");

  // Flag ON, tier 2 resolves a scene.
  const fuzzy = await resolveVisualization("why do my arteries clog up", {
    classify,
    generateScene,
    generateAlgorithm,
    enabled: true,
  });
  if (!("steps" in fuzzy) || count(fuzzy.steps) !== 1) {
    throw new Error("tier-2 scene route failed");
  }
  if (classifierCalls !== 1 || sceneCalls !== 1) {
    throw new Error(`seams not called exactly once: c=${classifierCalls} s=${sceneCalls}`);
  }

  // Flag ON, tier 1 keeps the algorithm path classifier-free.
  const preset = await resolveVisualization(
    "Explain TCP 3-Way Handshake step-by-step with SYN, SYN-ACK, and ACK packet state transitions between client and server.",
    { classify, generateScene, generateAlgorithm, enabled: true },
  );
  if (!("steps" in preset)) throw new Error("preset must route to algorithm");
  if (classifierCalls !== 1) throw new Error("tier-1 preset paid for a classifier call");
  if (algorithmCalls !== 2) throw new Error("preset must reach the algorithm generator once");

  // Tier 3: an honest no-match with suggestions, never an error.
  const unsupported = await resolveVisualization("what is the capital of France", {
    classify: async () => "unsupported",
    generateScene,
    generateAlgorithm,
    enabled: true,
  });
  if (!("status" in unsupported) || unsupported.status !== "unsupported") {
    throw new Error("tier-3 unsupported route failed");
  }
  if (unsupported.suggestions.length < 1) throw new Error("unsupported must carry suggestions");
  if (algorithmCalls !== 2) throw new Error("unsupported must not run any generator");

  console.log(
    `dispatch drill OK — flag no-op + all three tiers (c=${classifierCalls} s=${sceneCalls} a=${algorithmCalls})`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

Run (cwd `server\`): `npx tsx src/scenes/tools/dispatch-drill.ts`
Expected: exit 0 and `dispatch drill OK — flag no-op + all three tiers`.

- [ ] **Step 5: Delete the drill**

```powershell
Remove-Item server/src/scenes/tools/dispatch-drill.ts
```

- [ ] **Step 6: Commit**

```powershell
git add server/src/services/visualize.service.ts server/src/routes/visualize.routes.ts
git commit -m "feat: dispatch visual requests through the scene router"
```

**Review Focus:** `generateVisualization` and its system prompt are byte-identical (diff shows only appended code); `resolveVisualization` is the single dispatch point and every failure path throws (never returns `unsupported`); the route's 200-unsupported branch is before the `steps` branch; the limiter/`requireAuth`/`requireCsrf` chain is untouched; `SCENE_*` failures map to 502 without disturbing `VISUAL_INVALID`.

---

### Task 5: Client — response union, unsupported card, staged copy, no-cache

**Files:**
- Modify: `client/src/lib/visualize.ts`, `client/src/components/ChatWorkspace.tsx`
- Create: `client/src/components/visual/UnsupportedCard.tsx`

**Interfaces:**
- Consumes: Task 1's wire contract (`kind: "scene"` steps; `{status:"unsupported", suggestions}`).
- Produces:
  - `type VisualizeResponse = { steps: Array<VisualStep | SceneStep> } | UnsupportedResponse`
  - `function isUnsupportedResponse(value: VisualizeResponse): value is UnsupportedResponse`
  - `UnsupportedCard({ suggestions, onPick }: { suggestions: string[]; onPick: (prompt: string) => void })`
  - `ChatWorkspace` renders the card, keeps suggestions in memory only, and never writes them to `localStorage`

- [ ] **Step 1: Widen the client response type**

In `client/src/lib/visualize.ts`, replace the `fetchVisualization` function with:

```ts
export interface UnsupportedResponse {
  status: "unsupported";
  suggestions: string[];
}

/** A successful no-match is a distinct outcome, never an error (spec §6.1). */
export function isUnsupportedResponse(
  value: VisualizeResponse,
): value is UnsupportedResponse {
  return "status" in value && value.status === "unsupported";
}

export type VisualizeResponse =
  | { steps: Array<VisualStep | SceneStep> }
  | UnsupportedResponse;

export function fetchVisualization(prompt: string): Promise<VisualizeResponse> {
  return apiFetch<VisualizeResponse>("/api/visualize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }), csrf: true,
  });
}
```

`normalizeSteps` needs no change: scene steps already carry `kind: "scene"`, which it preserves (Plan 1/3 contract).

- [ ] **Step 2: Write the card**

Create `client/src/components/visual/UnsupportedCard.tsx`:

```tsx
"use client";

import { Compass } from "lucide-react";

/**
 * Honest "we can't show that yet" card (spec §6.1). Deliberately NOT the red
 * error+retry panel: nothing failed, the question simply has no scene. Never
 * persisted — it lives in component state so a refresh re-asks.
 */
export function UnsupportedCard({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/60 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Compass className="size-4 text-amber-400" />
        No 3D scene for that yet
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        We can&apos;t build a scene for that one right now. Try one of these
        instead, or rephrase — algorithm and systems questions always work.
      </p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((title) => (
            <button
              key={title}
              type="button"
              onClick={() => onPick(`Explain ${title} step by step.`)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render it and keep it out of the cache**

In `client/src/components/ChatWorkspace.tsx`:

(a) Import the card and the guard:

```tsx
import { UnsupportedCard } from "@/components/visual/UnsupportedCard";
import {
  fetchVisualization,
  isUnsupportedResponse,
  normalizeSteps,
  type ChalkStep,
} from "@/lib/visualize";
```

(b) Add the in-memory suggestions state next to the other `useState` calls in `ChatWorkspace` (keyed by session id — deliberately NOT part of `ChatSession`, so nothing is persisted):

```tsx
  // Unsupported outcomes live only in memory (spec §6.1 "never cached"): a
  // refresh re-asks rather than restoring a dead end from localStorage.
  const [unsupportedBySession, setUnsupportedBySession] = useState<
    Record<string, string[]>
  >({});
```

(c) In `fetchStepsWithTimeout`, narrow before normalizing:

```ts
  return Promise.race([fetchVisualization(prompt), timeout])
    .then((r) => {
      if (isUnsupportedResponse(r)) return { steps: null as ChalkStep[] | null, suggestions: r.suggestions };
      return { steps: normalizeSteps(r.steps), suggestions: null as string[] | null };
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
```

and widen its return type to `Promise<{ steps: ChalkStep[] | null; suggestions: string[] | null }>`.

(d) At the single call site of `fetchStepsWithTimeout`, when the result carries suggestions, record them and **leave `session.steps` unset**:

```tsx
        const { steps: nextSteps, suggestions } = await fetchStepsWithTimeout(promptText);
        if (suggestions) {
          setUnsupportedBySession((prev) => ({ ...prev, [sessionId]: suggestions }));
          // No steps -> nothing cached -> a refresh re-asks (Ruling 5).
          return;
        }
```

Use the real variable names from the surrounding submit handler; the requirement is: suggestions recorded, `steps` not written to the session.

(e) In the response panel, render the card **before** the `loading`/`error` branches and leave the red retry panel untouched:

```tsx
            ) : unsupportedForSession ? (
              <UnsupportedCard
                suggestions={unsupportedForSession}
                onPick={(text) => setPromptInput(text)}
              />
            ) : loading ? (
```

with `const unsupportedForSession = unsupportedBySession[session.id] ?? null;` computed alongside the existing `steps`/`loading`/`error` derivations for the active session.

(f) Stage the loading copy (Ruling 6): where the existing amber spinner line reads `Generating your visual — usually 10–60 seconds, keep this tab open`, render

```tsx
                    {elapsed < 3
                      ? "Choosing a scene or algorithm…"
                      : "Generating your visual — usually 10–60 seconds, keep this tab open"}
```

using the existing `elapsed` seconds counter. No new state, no timers.

- [ ] **Step 4: Gates**

Run (cwd `client\`): `npx tsc --noEmit` → 0 errors.
Run (cwd `client\`): `npx eslint src/components src/lib src/hooks` → **exactly 3** problems (no new ones — an unused import would be a 4th).
Run (cwd `client\`): `npm run build` → success.

- [ ] **Step 5: Commit**

```powershell
git add client/src/lib/visualize.ts client/src/components/visual/UnsupportedCard.tsx client/src/components/ChatWorkspace.tsx
git commit -m "feat: render the unsupported card and stage generation copy"
```

**Review Focus:** the red error+retry panel is byte-identical (the card is a sibling branch, not a restyle); suggestions never enter `ChatSession`/localStorage; `normalizeSteps` still stamps only unstamped steps so cached scene steps keep `kind:"scene"`; no new eslint error and no `any`; the staged copy uses the existing elapsed counter.

---

### Task 6: Full gates, `routes:check`, wiki

**Files:**
- Modify: `docs/wiki/api.md`, `docs/wiki/architecture.md`, `docs/wiki/components.md`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: wiki documentation of the router, sequencer, wire contract, unsupported card, flags, and `routes:check`; the standing instruction that every later verification pass runs both `scenes:validate` and `routes:check`.

- [ ] **Step 1: Run the full standing gate**

```powershell
# cwd: server\
npx tsc --noEmit                      # expect: 0 errors
npm run scenes:validate               # expect: OK — 1 scene(s), 0 warning(s), exit 0
npm run routes:check                  # expect: routes:check OK — 12 checks…, exit 0
# cwd: client\
npx tsc --noEmit                      # expect: 0 errors
npm run build                         # expect: success
npx eslint src/components src/lib src/hooks   # expect: "3 problems (3 errors, 0 warnings)"
```

- [ ] **Step 2: RED drill — the unsupported body must satisfy the wire schema**

Confirm by inspection that the route's 200-unsupported body matches `unsupportedResponseSchema` (`status: "unsupported"` literal + `suggestions: string[]` max 3), and that `sceneSuggestions()` returns at most 3 entries (`slice(0, 3)`). No code change expected; record the confirmation in your report.

- [ ] **Step 3: HUMAN-ONLY — runtime QA (not blocking; the human runs it)**

*Record `deferred-to-human` and continue.* With `SCENES_ENABLED=true` in `.env` and the stack up (`docker compose up -d`, then `cd client` and `npm run dev`):
- Ask "how does the heart work" → a scene session renders (5 hearts, guided camera).
- Ask "what is the capital of France" → the unsupported card (not the red error panel); a refresh re-asks.
- Ask a featured preset → identical to today (no extra latency).
- §7 items 5 and 7: refresh a scene session (instant, 0 calls) and confirm the DSA bundle still excludes three/fiber.

- [ ] **Step 4: Update `docs/wiki/api.md`**

In the `/api/visualize` section, document the two success shapes (`{steps}` with the scene/algorithm wire union; `{status:"unsupported", suggestions}`), the new `502 SCENE_INVALID`, and that all of it is behind `SCENES_ENABLED` (default false). Match the file's existing table/format conventions and use the real field names from `server/src/validators/visualize.ts`.

- [ ] **Step 5: Update `docs/wiki/architecture.md`**

Extend the "Scene Catalog & Asset Pipeline" section with a short subsection: the three-tier router (lexicon fast path → injectable LLM classifier → unsupported), why `SCENES` still never crosses the boundary, the expansion step (§4.2) and its fail-loud behavior, the two flags with their defaults, and `routes:check` as the golden-table gate. Update the flow diagram's `/api/visualize` line to show the dispatch. Verify every symbol/path you name against the code before writing it.

- [ ] **Step 6: Update `docs/wiki/components.md`**

Add `UnsupportedCard` to the component list with its "never cached" contract, and update the `ChatWorkspace.tsx` and `visualize.ts` bullets for the response union, in-memory suggestions, and staged copy. Verify claims against the shipped code.

- [ ] **Step 7: Commit**

```powershell
git add docs/wiki/api.md docs/wiki/architecture.md docs/wiki/components.md
git commit -m "docs: wiki for scene routing, sequencing and the unsupported path"
```

**Review Focus:** the wiki names only shipped behavior (no rollout QA claims, no Plan-5 telemetry); both gates (`scenes:validate`, `routes:check`) are documented as part of every verification pass; no `index.md` change is needed (no new top-level directory was added — confirm before assuming).

---

## Notes for later plans (carry forward)

- **Plan 5 (rollout):** flip `SCENES_ENABLED`, run spec §7's full QA checklist, add per-generation logging (kind, model, tokens, latency) — the dispatcher in `resolveVisualization` is the natural instrumentation point, and `env.OPENAI_MODEL_SCENE` is the promotion knob.
- **Catalog growth (spec §8 step 4):** adding a live scene is data-only — manifest + QC + `npm run scenes:definition` + `npm run routes:check`. The router, sequencer, expansion, and card all read the catalog dynamically; no code changes are needed for a new scene. `routes:check`'s golden table is the place to add its canonical prompts.
- **Procedural scenes:** `expandSceneSteps` currently fails with `SCENE_UNSUPPORTED_ASSET` for non-mesh assets; that is the seam where a procedural renderer plugs in later.
- **Flag safety:** with `SCENES_ENABLED=false`, `routePrompt` returns immediately — the router, classifier and sequencer are unreachable, so the algorithm path's cost, latency and failure modes are exactly today's.

## Execution Handoff

- **Recommended: subagent-driven-development.** Tasks 2→4 form a strict chain on shared seams (router → expansion → dispatch), and the most likely failures — an extra LLM call on the DSA path, an "unsupported" card masking a real error, a silently dropped hallucinated id — are exactly the ones a fresh reviewer per task catches before the next task builds on them. Push to GitHub after each task.
- Alternative: **executing-plans** (native, inline) — every task ends on hard gates plus an executable RED drill, so carry-over risk is lower than usual.
