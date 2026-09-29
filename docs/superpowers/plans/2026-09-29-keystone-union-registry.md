# Plan: Keystone — `ChalkStep` Union + Stage Registry + Banner Tolerance

**Spec:** `docs/superpowers/specs/2026-09-25-scene-subproject-design.md` (§3.1/§3.2/§3.3/§11, rollout step 1)
**Scope:** client-only. The zero-visible-change foundation every later plan builds on. Server code, API contract, and cache storage format are untouched.

## Goal

Convert the frozen `VisualStep` into a kind-discriminated `ChalkStep` union (algorithm-only for now), route rendering through a compile-time-enforced `STAGE_REGISTRY`, and make the persistent banner field-tolerant — all with **zero observable change for DSA users**. When Plan 3 adds `kind: "scene"`, TypeScript must refuse to compile until a registry entry exists.

## Architecture

- **`kind` rides per step** (spec §3.1). `ChalkStep = AlgorithmStep` today (union of one); `SceneStep` joins the union in Plan 3 alongside its renderer — spec §8 rollout step 1 is explicitly "union + registry, algorithm-only".
- **Wire type stays `VisualStep`** — server keeps emitting the old shape byte-for-byte; `normalizeSteps()` stamps `kind` at client ingestion (fetch + cache hydrate). Idempotent and future-safe: it never overwrites an existing `kind`, so cached scene steps added later survive re-hydration.
- **Registry is the exhaustiveness gate** — `satisfies Record<ChalkStep["kind"], StageEntry>`: a union member without an entry fails `tsc`.
- **Cache format unchanged** (spec §3.3) — still `steps[]` in `ChatSession`; normalized steps simply carry `kind` as an additive field; pre-existing entries (no `kind`) normalize on read.

## Non-Goals / Locked

- No `SceneStep`, no 3D deps, no server changes, no prompts/schema/router changes (Plans 3–4).
- No visual/copy/class changes — for `kind: "algorithm"` the DOM must be byte-identical.
- Frozen: `useVisualPlayer` API, `ControlsBar` props, `StepDots`, keyboard/fullscreen, glow `stateStyles` maps, `StageType`/`ElementState` enums, `data-testid="canvas"` never unmounts.

## Global Constraints

- **Unfreeze budget (the one, spec §5):** `VisualStep` → union + `ChatSession.steps` type annotation. Nothing else frozen moves.
- **No test framework (repo standing ruling):** verification = `npx tsc --noEmit` (server + client) = 0 errors; client `npm run build` succeeds; eslint delta 0 against baseline **3 pre-existing errors** (`src/components src/lib src/hooks` scope: ChatWorkspace ×2, VariableBadges ×1). Tasks pin which gates run.
- **Type-level RED/GREEN allowed as tests** (per writing-plans: only cheap instant-verification approaches, where verification is intrinsic): each compile-fail step is explicitly an *expected-failure* step — run `tsc`, confirm the stated error, revert. All other tasks stay green-first.
- Work in place on `main` (standing preference; no worktree). No new dependencies. Commits: `feat:` per task, `docs:` for wiki.
- Dark theme/glow untouched. No placeholder code.
- **After Task 5:** update `docs/wiki/components.md` (ChalkStep union, `normalizeSteps`, `stageRegistry.tsx, banner tolerance) and the Zone-3/Zone-1 lines in `docs/wiki/architecture.md`.

## File Structure

| File | Change |
|---|---|
| `client/src/lib/visualize.ts` | add `AlgorithmStep`, `ChalkStep`, `normalizeSteps` (wire `VisualStep` + `fetchVisualization` unchanged) |
| `client/src/components/ChatWorkspace.tsx` | ingest through `normalizeSteps` (fetch + hydrate); widen `ChatSession.steps`, `handleCacheSteps`, `ActiveChatView` state/props to `ChalkStep[]` |
| `client/src/components/visual/stageRegistry.tsx | **create** — `STAGE_REGISTRY`, `StageEntry`, `LAYOUT_CLASSES` |
| `client/src/components/visual/VisualExplainer.tsx` | resolve entry from `step.kind` (never-default switch); stage/inspector/layout come from the entry; `steps: ChalkStep[]` prop |
| `client/src/components/visual/VisualExplainer.tsx` (ProblemBanner) | structural `BannerStep` type: `elements`/`stageType`/`variables` optional-tolerant |
| `docs/wiki/components.md`, `docs/wiki/architecture.md` | document the union + registry |

---

## Task 1: `ChalkStep` types + `normalizeSteps`

**Files:** `client/src/lib/visualize.ts`

1. **Write:** after the existing `VisualStep` interface (line 11), add:

```ts
/**
 * Per-step discriminant (spec 3.1). Algorithm-only for now: `ChalkStep` is a
 * union of one, so TS already enforces registry exhaustiveness. `SceneStep`
 * joins this union in Plan 3 with its renderer. The WIRE shape (`VisualStep`,
 * above) never changes — the server still emits untyped steps; the client
 * stamps `kind` at ingestion via normalizeSteps().
 */
export interface AlgorithmStep extends VisualStep { kind: "algorithm" }
export type ChalkStep = AlgorithmStep;

/**
 * Idempotent ingestion stamp (cache hydrate + fetch). Never overwrites an
 * existing kind, so future scene steps cached without re-derivation survive
 * re-normalization. Accepts pre-existing cache entries that lack `kind`.
 * (True branch spreads the narrowed `kind` back onto `s`: TS narrows the
 * property via truthiness, not the intersection reference itself.)
 */
export function normalizeSteps(
  raw: ReadonlyArray<VisualStep & { kind?: "algorithm" }>
): ChalkStep[] {
  return raw.map((s) =>
    s.kind ? { ...s, kind: s.kind } : { ...s, kind: "algorithm" as const }
  );
}
```

2. **Verify:** `cd client && npx tsc --noEmit` → 0 errors.
3. **Commit:** `feat: add ChalkStep discriminant union and normalizeSteps`

**Review Focus:** type must be structural (`extends`, not a re-declaration) so every existing consumer of `VisualStep` fields compiles untouched; `normalizeSteps` returns `ChalkStep[]` with no casts — the true branch spreads the narrowed `s.kind` back onto the object (plain `s` does not type-check: TS narrows the property, not the intersection reference).

---

## Task 2: Ingestion wiring in `ChatWorkspace.tsx`

**Files:** `client/src/components/ChatWorkspace.tsx`

Steps are interface-chained: this task consumes Task 1's exports.

1. **Import (line 27):**

```ts
// before
import { fetchVisualization, type VisualStep } from "@/lib/visualize";
// after
import { fetchVisualization, normalizeSteps, type ChalkStep } from "@/lib/visualize";
```

(`VisualStep` has no remaining named use in this file — leaving it imported fails `no-unused-vars`.)

2. **Annotation (line 45):** `steps?: VisualStep[];` → `steps?: ChalkStep[];`
3. **Fetch wrapper (lines 86–104):** change the return annotation to `Promise<{ steps: ChalkStep[] }>` and wrap the success value:

```ts
return Promise.race([fetchVisualization(prompt), timeout])
  .then((r) => ({ steps: normalizeSteps(r.steps) }))
  .finally(() => { /* existing finally, unchanged */ });
```

4. **Cache callback (line 162):** `const handleCacheSteps = (jobId: string, steps: VisualStep[]) => {` → `steps: ChalkStep[]`.
5. **`ActiveChatView` (lines 526–534):**

```ts
onCacheSteps: (jobId: string, steps: ChalkStep[]) => void;
// ...
const [steps, setSteps] = useState<ChalkStep[] | null>(
  () => (session.steps ? normalizeSteps(session.steps) : null)
);
```

(the existing `session.steps` null-check form and `loading` init at line 534 stay as-is).

6. **Verify:** `cd client && npx tsc --noEmit` → 0 errors.
7. **Commit:** `feat: normalize steps at ingestion in ChatWorkspace`

**Review Focus:** pre-existing cache entries lack `kind` — hydration must pass through `normalizeSteps` (line 5 above) or a refresh into an old session throws at the registry lookup. Verify by reading step 5 + the manual check in Task 5 QA item 1. Also: `setSteps(r.steps)` sites (lines 562 and 578) must now receive `ChalkStep[]` via the wrapper — no second normalization (double-stamping would be caught by `normalizeSteps` being idempotent, but the code should show it once).

---

## Task 3: `stageRegistry.tsx + `VisualExplainer` resolution

**Files:** create `client/src/components/visual/stageRegistry.tsx; edit `client/src/components/visual/VisualExplainer.tsx`

1. **Create `stageRegistry.tsx:**

```tsx
"use client";
import type { ReactNode } from "react";
import type { ChalkStep } from "@/lib/visualize";
import { ArrayStage } from "./ArrayStage";
import { TreeStage } from "./TreeStage";
import { CodePanel } from "./CodePanel";

export type StageLayout = "split";

export interface StageEntry {
  layout: StageLayout;
  renderStage: (step: ChalkStep) => ReactNode;
  renderInspector: (step: ChalkStep) => ReactNode;
}

/** Exact grid strings, moved verbatim from VisualExplainer — interpolation
 *  must produce byte-identical class output for the algorithm path. */
export const LAYOUT_CLASSES: Record<StageLayout, string> = {
  split: "grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0",
};

export const STAGE_REGISTRY = {
  algorithm: {
    layout: "split",
    renderStage: (step) =>
      step.stageType === "tree" ? <TreeStage step={step} /> : <ArrayStage step={step} />,
    renderInspector: (step) => (
      <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
    ),
  },
} satisfies Record<ChalkStep["kind"], StageEntry>;
```

2. **Wire `VisualExplainer.tsx`:**
   - imports: add `import { STAGE_REGISTRY, LAYOUT_CLASSES } from "./stageRegistry";`
   - line 188: `className={`flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0`}` → `` className={`flex-1 ${LAYOUT_CLASSES[entry.layout]}`} ``
   - after `if (!step) return null;` (line 171):

```ts
const entry = STAGE_REGISTRY[step.kind];
if (!entry) return null; // unreachable by types; guards hand-edited localStorage
```

   - lines 196–200 (stage ternary) → `{entry.renderStage(step)}`
   - lines 205–207 (inspector block) → `{entry.renderInspector(step)}`
   - prop type (line 141): `steps: VisualStep[]` → `steps: ChalkStep[]`
   - local uses of `VisualStep` type (lines 179, 192, 199) → `ChalkStep`; `import type { VisualStep, VisualVariable }` (line 6) becomes `import type { ChalkStep, VisualVariable }`.
   - `TreeStage`/`ArrayStage`/`CodePanel` signatures stay `VisualStep`-based (structurally assignable — **frozen files untouched**).

3. **Expected-failure step (exhaustiveness proof):** temporarily delete the `algorithm:` entry from `STAGE_REGISTRY`, run `npx tsc --noEmit`, and confirm the `satisfies Record<ChalkStep["kind"], StageEntry>` error names the missing `algorithm` key. **Then restore the file exactly.** This is the expected-failure RED (a union member with no entry must not compile); restoring gives GREEN.
4. **Verify:** `cd client && npx tsc --noEmit` → 0; `npm run build` → success.
5. **Commit:** `feat: route step rendering through stage registry`

**Review Focus:** the grid class string must match the pre-change literal exactly (`grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0` — this was already normalized in a prior round; do not reword it); the `satisfies` line must exist and be exercised by the expected-failure step 3; `TreeStage/ArrayStage/CodePanel` files must show **no diff** in the final commit.

---

## Task 4: ProblemBanner field tolerance

**Files:** `client/src/components/visual/VisualExplainer.tsx`

1. Add a structural banner type above `ProblemBanner` (line ~55):

```ts
/** Banner-readable step shape (spec 3.2): optional-tolerant so future scene
 *  steps render title + Goal without elements/stageType. */
type BannerStep = {
  title: string;
  subtitle?: string;
  variables?: VisualVariable[];
  elements?: ChalkStep["elements"];
  stageType?: ChalkStep["stageType"];
};
```

   (preflight ruling: derive from `ChalkStep`, not `VisualStep` — Task 3 removed `VisualStep` from the line-6 import.)

2. `function ProblemBanner({ step, overview }: { step: VisualStep; overview: VisualStep })` → `{ step: BannerStep; overview: BannerStep }`.
3. Line 66: `const values = step.elements.map((el) => el.value);` → `const values = step.elements?.map((el) => el.value) ?? [];`
4. Line 71 already guards `step.stageType === "array" && values.length` — for a scene (`stageType` undefined) the pill correctly disappears; no condition change needed.
5. Line 77 `constraintOf(step.variables)` already accepts `VisualVariable[] | undefined` — no change.
6. **Verify:** `cd client && npx tsc --noEmit` → 0.
7. **Commit:** `feat: make problem banner field-tolerant for scene steps`

**Review Focus:** this task must produce **zero rendered-output change for algorithm** — the optional chaining only alters the `undefined` branch that cannot occur today. Check the diff touches only the two lines named (type + `?.`), and that `step`/`overview` call sites (lines 182, 191) still type-check against `BannerStep`.

---

## Task 5: Full gate, manual QA, wiki

**Files:** `docs/wiki/components.md`, `docs/wiki/architecture.md`

1. **Gate:**
   - `cd server && npx tsc --noEmit` → 0 (untouched, must stay 0)
   - `cd client && npx tsc --noEmit` → 0
   - `cd client && npm run build` → success
   - `cd client && npx eslint src/components src/lib src/hooks` → **exactly 3 errors** (ChatWorkspace ×2, VariableBadges ×1 — baseline; delta 0)
2. **Manual QA (browser):**
   1. Refresh a session cached **before** this plan (entries without `kind`) → renders identically, 0 API calls.
   2. All 4 featured presets (tree + array + cards + flow paths) → visual parity: grid split, inspector, banner, glow, dots, keyboard, fullscreen unchanged.
   3. localStorage tamper: set a cached step's `kind` to `"bogus"` → app must not crash (null guard at registry lookup shows blank stage; reload after restoring renders).
   4. `git diff --stat` for the round shows **only** the 4 code files + 2 wiki files (TreeStage/ArrayStage/CodePanel/ControlsBar/useVisualPlayer untouched).
3. **Wiki:**
   - `components.md`: `ChalkStep` union + `normalizeSteps` (ingestion points), `stageRegistry.tsx (`STAGE_REGISTRY`, `LAYOUT_CLASSES`, exhaustive `satisfies`), `ProblemBanner` `BannerStep` tolerance, `VisualExplainer` resolves via `step.kind` (never-default pattern).
   - `architecture.md`: Zone-1/Zone-3 lines — stage/inspector now come from `STAGE_REGISTRY[step.kind]` instead of inline ternary.
4. **Commit:** `docs: wiki for ChalkStep union and stage registry`

**Review Focus:** all four global gates with their exact expected values (0/0/success/3); QA items 1 and 3 are the runtime paths `tsc` cannot see (old cache without `kind`, corrupted `kind`) — confirm both were actually executed, not inferred; wiki claims must match the shipped code (no "SceneStep" documentation — that is Plan 3's).

---

## Execution Handoff

- **Recommended:** **subagent-driven-development** — Tasks 1→2→3 form a strict interface chain (types → consumers → registry), and a mistake here silently breaks every DSA player's cached session; a fresh implementer + reviewer per task with these Interfaces in the briefs is the most thorough option.
- Alternative: **executing-plans** (native, inline) — fine too: the interface chain is fully specified above and each task has hard `tsc` gates, so carry-over risk is low.
