# Chalk: Persistent Problem Banner, Live Math Badge & Hero Boxes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the problem statement + goal to the top of the visual stage for every step, surface the LLM's live arithmetic in a dedicated amber "Live Math" badge, enlarge array boxes for small inputs, and move the OpenAI prompt to an explicit 3-phase pedagogical flow (explain question → 2 examples with math → visual algorithm execution).

**Architecture:** Additive only. One new optional field (`calculation?: string`) threaded server→client: LLM plan schema → system prompt → response validator → `VisualStep` type → new `LiveMathBadge`. `QuestionBanner` (step-0 only) becomes a permanently mounted `ProblemBanner` derived from `steps[0]`. No component signatures change beyond an optional prop.

**Tech Stack:** Next.js 16.3.5, React 19, Tailwind CSS v4 (dynamic spacing scale), framer-motion, Express + OpenAI Structured Outputs (`zodResponseFormat`, `zod@3`).

**Spec:** User brief 2026-09-22 (5 numbered items) + `docs/wiki/components.md`, `docs/wiki/api.md`.

## Global Constraints
- Frozen interfaces: `useVisualPlayer` return shape, `ControlsBar` props, `stageType` enum, element `state` enum, `ElementState` values, all existing schema bounds (6–12 steps, 1–12 elements, ≤600-char `explanation`). The only interface additions are `calculation` (server optional / LLM required string) and the client `VisualStep.calculation?: string`.
- Preserve the dark theme, glow palette (`ring-*`, `shadow-[...]`), and all existing colors. Only the classes the brief names may change.
- Repo has no test framework: per-task verification is `npx tsc --noEmit` (server and client) with 0 errors; final verification adds `npm run build` (client).
- No new npm dependencies. Tailwind v4 numeric spacing (`w-22`, `h-18`) is generated on demand — valid, do not replace with arbitrary values.
- Zero-blink guarantee: `data-testid="canvas"` never unmounts, and the new pinned banner must not re-animate between steps (it is derived from `steps[0]`, not `step`).
- Strict eslint: no `any`, no unused imports/vars, no `set-state-in-effect`, no impure calls in render.
- Working in place on `main` (standing preference, no worktree). **No commits** — the tree already carries unrelated uncommitted work from a prior session (AGENTS.md, ArrayStage/renderer edits, wiki edits); committing would entangle it.

## Review Focus
- The pinned banner must render on EVERY step (including the final summary) and must not remount the canvas or re-trigger its entrance animation. Pinned in Task 3.
- `calculation` must survive the server's `visualizeResponseSchema.safeParse` re-validation: zod strips unknown keys, so a field the LLM emits but the validator omits would be silently dropped. Pinned in Task 1.
- The Live Math badge must be absent (not an empty amber shell) when a step has no arithmetic, and must cross-fade on change without shifting layout. Pinned in Task 2.
- Verdict pill derivation must not treat `(invalid)` as a pass — `\bvalid\b` word boundaries matter. Pinned in Task 2.
- Array sizing thresholds (≤6 / 7–10 / >10) must not regress the word/rectangle branch for non-numeric values. Pinned in Task 4.

---

## File map
- Modify: `server/src/validators/visualize.ts` (optional `calculation`)
- Modify: `server/src/services/visualize.service.ts` (LLM schema required `calculation`, 3-phase prompt, strip empty values)
- Modify: `client/src/lib/visualize.ts` (`VisualStep.calculation?`)
- Modify: `client/src/components/visual/VariableBadges.tsx` (export `LiveMathBadge`)
- Modify: `client/src/components/visual/VisualExplainer.tsx` (`ProblemBanner`, badge row, typography check)
- Modify: `client/src/components/visual/ArrayStage.tsx` (hero boxes, index pills, pointer weight)
- Modify: `docs/wiki/components.md`, `docs/wiki/api.md`

### Task 1: Backend — `calculation` field + 3-phase pedagogical prompt
**Files:**
- Modify: `server/src/validators/visualize.ts`
- Modify: `server/src/services/visualize.service.ts`

**Interfaces:**
- Consumes: `visualStepSchema`, `llmPlanSchema`, `generateVisualization`.
- Produces: `VisualStep.calculation?: string` (server) reaching `parsed.data.steps`; `llmPlanSchema.steps[].calculation: string` (required, `""` allowed) for strict JSON output.

- [ ] **Step 1: Optional `calculation` on the response validator**

In `server/src/validators/visualize.ts`, inside `visualStepSchema`, directly after the `explanation` line add:
```ts
  calculation: z.string().max(400).optional(),
```

- [ ] **Step 2: Required `calculation` on the LLM plan schema + strip empties**

In `server/src/services/visualize.service.ts`:
- Inside the `steps` object of `llmPlanSchema`, after `explanation: z.string(),` add:
```ts
    calculation: z.string(),
```
(Required, so the strict JSON schema stays conformant and the model always emits the field; `""` means "no arithmetic on this step".)
- In `generateVisualization`, replace the parsed mapping so empty strings never reach the client:
```ts
  const parsed = visualizeResponseSchema.safeParse(
    plan
      ? {
          steps: plan.steps.map((s, i) => ({
            ...s,
            stepIndex: i,
            calculation: s.calculation.trim() ? s.calculation : undefined,
          })),
        }
      : { steps: [] },
  );
```

- [ ] **Step 3: Replace the system prompt with the 3-phase flow**

Replace the entire `content:` template literal in the system message with EXACTLY:

```
You are Chalk, an elite visual explainer engine inspired by high-quality educational interactives (like dsa.chaicode.com).
Your goal is to break down concepts, algorithms, and biological/system mechanisms into 6 to 10 crystal-clear visual steps.
MANDATORY 3-PHASE PEDAGOGICAL FLOW:
PHASE 1 - THE QUESTION BREAKDOWN (STEP 1):
   - Explain the problem statement in plain English: the rules, the inputs, and the real-world intuition behind it.
   - 'title' MUST be "Problem Breakdown: <Topic Name>" (e.g. "Problem Breakdown: Koko Eating Bananas").
   - 'subtitle' MUST be the short real goal (e.g. "Find minimum eating speed k").
   - 'explanation' MUST define what each input means and state the core constraint (the bound, the target value, or the success condition).
   - 'elements' MUST show the ORIGINAL input, in its given order.
   - Set 'calculation' to a compact restatement of the constraint (e.g. "piles = [3,6,7,11], h = 8 hours").
PHASE 2 - CONCRETE EXAMPLES WITH MATH (STEP 2):
   - 'title' MUST be "Examples & Mathematical Intuition".
   - Present 2 distinct worked examples, one after the other, each with the arithmetic shown step by step.
   - Set 'calculation' to the fully expanded arithmetic of the second example.
PHASE 3 - VISUAL ALGORITHM EXECUTION (STEPS 3 TO N):
   - Carry out the visual simulation (binary search, two pointers, sliding window, DFS/BFS, ...), one logical change per step.
   - Whenever a step performs a comparison or any arithmetic, set 'calculation' to the fully expanded live equation with its verdict in parentheses at the end:
     "hours = ceil(3/4) + ceil(6/4) + ceil(7/4) + ceil(11/4) = 1 + 2 + 2 + 3 = 8 <= 8 (valid)" or
     "nums[i] + nums[j] + nums[left] + nums[right] = -2 + (-1) + 1 + 2 = 0 == target (match found)" or
     "nums[mid] = 7 > target = 5 (too large, move right)".
   - The verdict in parentheses MUST start with one of: valid, invalid, match found, too small, too large, move left, move right.
   - Explain causal actions, not just observations: "Because total hours (8) <= h (8), speed 4 works, so we search for a smaller valid speed."
   - Clearly set element states: 'active' for the main subject, 'compare' for interactions, 'found' for successes, and 'visited' for processed elements.
FINAL STEP (STEP N):
   - Summarize the answer, the time complexity (e.g. O(N * log(max(piles)))), and the optimal takeaway.
EXPLANATION REQUIREMENTS:
- Each step's explanation must be 2 to 4 sentences long (stay under 600 characters), warm, clear, and pedagogical.
- Do NOT just state what happened; explain *why* it happened and what it leads to next.
- Keep code/pseudocode clean, readable, and directly mapped to the activeLine index.
ADDITIONAL RULES:
- Use stageType 'array' for array/list topics (Two Sum, Binary Search, Sliding Window, Sorting) and 'tree' for hierarchical topics (DFS, BFS, Path Sum).
- For tree steps, list elements in heap order (index 0 root, children of i at 2i+1 and 2i+2).
- Each element needs a pointer name only when relevant (i, j, left, right, curr, low, high, target).
- Use "" for 'calculation' only on steps with no arithmetic or comparison at all.
```

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: 0 errors.

### Task 2: Client types + `LiveMathBadge`
**Files:**
- Modify: `client/src/lib/visualize.ts`
- Modify: `client/src/components/visual/VariableBadges.tsx`

**Interfaces:**
- Consumes: `VisualStep.calculation` (new, optional), `cn` from `@/lib/utils`.
- Produces: `LiveMathBadge({ calculation }: { calculation?: string | null })` exported from `VariableBadges.tsx`, consumed by Task 3.

- [ ] **Step 1: Add the field to the client type**

In `client/src/lib/visualize.ts`, inside `interface VisualStep`, after `variables: VisualVariable[]; explanation: string;` add `calculation?: string;`:
```ts
  variables: VisualVariable[]; explanation: string; calculation?: string;
```

- [ ] **Step 2: Export `LiveMathBadge` from `VariableBadges.tsx`**

Append to `client/src/components/visual/VariableBadges.tsx` (add `motion` to the existing imports: `import { motion } from "framer-motion";`; `cn` is already imported):

```tsx
/** Split a trailing "(verdict)" group off the calculation string. */
function parseVerdict(calculation: string): {
  formula: string;
  verdict: { ok: boolean; label: string } | null;
} {
  const trimmed = calculation.trim();
  const match = trimmed.match(/\(([^()]*)\)\s*$/);
  if (!match || match.index === undefined) {
    return { formula: trimmed, verdict: null };
  }
  const raw = match[1].trim();
  const bad =
    /\b(invalid|false|fail(s|ed)?|no|too\s+(small|large|high|low|big)|move\s+(left|right)|exceed(s|ed)?|not)\b/i.test(
      raw
    );
  const good = !bad && /\b(valid|match|true|pass(es|ed)?|success|found|works|yes)\b/i.test(raw);
  if (!bad && !good) return { formula: trimmed, verdict: null };
  return {
    formula: trimmed.slice(0, match.index).trim(),
    verdict: { ok: good, label: raw.charAt(0).toUpperCase() + raw.slice(1) },
  };
}

/**
 * Live Math badge: renders the step's expanded arithmetic with its verdict.
 * Renders nothing when the step carries no calculation, so narrative steps
 * are not given an empty amber shell.
 */
export function LiveMathBadge({
  calculation,
}: {
  calculation?: string | null;
}) {
  if (!calculation || !calculation.trim()) return null;
  const { formula, verdict } = parseVerdict(calculation);

  return (
    <motion.div
      key={calculation}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 flex items-center gap-3 shadow-[0_0_15px_rgba(251,191,36,0.08)]"
    >
      <span className="text-amber-400 font-mono font-bold text-sm bg-amber-500/20 px-2 py-0.5 rounded-md shrink-0">
        ∑
      </span>
      <span className="text-sm sm:text-base font-mono font-semibold text-amber-200 tracking-wide break-words min-w-0">
        {formula}
      </span>
      {verdict && (
        <span
          className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-md border shrink-0",
            verdict.ok
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              : "bg-neutral-800/90 text-neutral-300 border-neutral-700"
          )}
        >
          {verdict.ok ? "✓" : "✗"} {verdict.label}
        </span>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: 0 errors.

### Task 3: Persistent `ProblemBanner` + Live Math row + typography check
**Files:**
- Modify: `client/src/components/visual/VisualExplainer.tsx`

**Interfaces:**
- Consumes: `LiveMathBadge` (Task 2), `VisualStep.calculation` (Task 2), `steps[0]` for the pinned identity.
- Produces: same `VisualExplainer({ steps, title })` export.

- [ ] **Step 1: Replace `QuestionBanner` with the pinned `ProblemBanner`**

Delete the whole `QuestionBanner` function and add in its place:

```tsx
const POINTER_NAMES = new Set([
  "i", "j", "k", "lo", "low", "hi", "high", "mid", "left", "right",
  "curr", "current", "start", "end", "l", "r",
]);

/** Problem name from step 1's title, with the 3-phase prefix and trailing "Problem" stripped. */
function problemNameOf(raw: string, fallback: string) {
  const base = (raw || fallback || "Problem").trim();
  return (
    base
      .replace(/^\s*(problem breakdown|problem statement|overview)\s*[:\-–—]\s*/i, "")
      .replace(/\s*problem\s*$/i, "")
      .trim() || base
  );
}

/** The constraint badge: a target-like variable, else the first non-pointer variable. */
function constraintOf(variables?: VisualVariable[]) {
  if (!variables?.length) return null;
  return (
    variables.find((v) => v.name.toLowerCase().includes("target")) ??
    variables.find((v) => !POINTER_NAMES.has(v.name.toLowerCase().trim())) ??
    null
  );
}

/**
 * Persistent problem & goal banner: pinned to the top of the visual stage for
 * EVERY step, derived from step 1 so it never re-animates between steps.
 */
function ProblemBanner({
  step,
  fallbackTitle,
}: {
  step: VisualStep;
  fallbackTitle: string;
}) {
  const problemName = problemNameOf(step.title, fallbackTitle);
  const target = constraintOf(step.variables);
  const values = step.elements.map((el) => el.value);
  const allNumeric =
    values.length > 0 &&
    values.every((v) => v.trim() !== "" && !isNaN(Number(v)));
  const input =
    step.stageType === "array" && values.length > 0
      ? `Input: ${allNumeric ? "nums = " : ""}[${values.join(", ")}]`
      : null;

  return (
    <div className="w-full px-5 py-3 bg-[#12141c] border-b border-neutral-800/60 flex items-center justify-between flex-wrap gap-2">
      <span className="text-base font-bold text-white tracking-wide">
        {problemName}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {input && (
          <span className="bg-neutral-800/90 text-neutral-300 text-xs font-mono px-3 py-1 rounded-md border border-neutral-700 break-all">
            {input}
          </span>
        )}
        {target && (
          <span className="bg-amber-500/15 text-amber-300 text-xs font-mono font-bold px-3 py-1 rounded-md border border-amber-500/30">
            {target.name.includes("target") ? "Target" : target.name}: {String(target.value)}
          </span>
        )}
        {step.subtitle && (
          <span className="bg-emerald-500/15 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-md border border-emerald-500/30">
            Goal: {step.subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Import `VisualVariable` and `LiveMathBadge`**

- Change the type import to `import type { VisualStep, VisualVariable } from "@/lib/visualize";`.
- Change the badges import to `import { LiveMathBadge, VariableBadges } from "./VariableBadges";`.

- [ ] **Step 3: Pin the banner, keep the canvas mounted, add the Live Math row**

In the component body:
- Delete `const isOverview = player.index === 0;` and instead add `const overview = steps[0];` (after `const step = steps[player.index];`).
- Replace the left-column JSX with:

```tsx
        {/* LEFT COLUMN: Visual Stage (Never unmounts) */}
        <div className="flex flex-col bg-[#0c0d12] min-h-[380px]">
          {overview && (
            <ProblemBanner step={overview} fallbackTitle={title} />
          )}
          <div
            data-testid="canvas"
            className="flex-1 p-8 flex flex-col items-center justify-center gap-6 relative overflow-hidden"
          >
            {step.stageType === "tree" ? (
              <TreeStage step={step} />
            ) : (
              <ArrayStage step={step} />
            )}
          </div>
        </div>
```

- Directly below the `</div>` that closes the 2-column grid and above the VariableBadges block, insert:

```tsx
      {/* 3. LIVE MATH / CALCULATION BADGE (below the canvas stage) */}
      {step.calculation && (
        <div className="border-t border-neutral-800/50 bg-[#0e1018] px-5 pt-3">
          <LiveMathBadge calculation={step.calculation} />
        </div>
      )}
```

- [ ] **Step 4: Confirm item 5 (typography) is already satisfied — no edit**

The explanation bar already uses `text-base sm:text-lg font-medium text-neutral-200 leading-relaxed select-text` and the line badge already uses `text-xs font-mono font-bold px-3 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30`. Verify by reading the file; change nothing.

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: 0 errors.

### Task 4: Hero array boxes + index pills + pointer weight
**Files:**
- Modify: `client/src/components/visual/ArrayStage.tsx`

**Interfaces:**
- Consumes: `VisualStep.elements` (frozen).
- Produces: same `ArrayStage({ step })` export.

- [ ] **Step 1: Size tiers + dynamic row gap**

- Replace `const largeBoxes = step.elements.length <= 6;` with:
```tsx
  const count = step.elements.length;
  const sizeTier = count <= 6 ? "hero" : count <= 10 ? "compact" : "dense";
  const rowGap = count <= 6 ? "gap-5" : "gap-3";
```
- Row container: `className="flex flex-row items-start justify-center gap-5 flex-nowrap min-w-max px-4"` → use `cn("flex flex-row items-start justify-center flex-nowrap min-w-max px-4", rowGap)`.
- Box class: replace the numeric-shape ternary
```tsx
                      : largeBoxes
                        ? "w-20 h-20 rounded-2xl text-3xl font-extrabold font-mono"
                        : "w-16 h-16 rounded-xl text-2xl font-bold font-mono",
```
with
```tsx
                      : sizeTier === "hero"
                        ? "w-22 h-22 rounded-2xl text-3xl font-extrabold font-mono"
                        : sizeTier === "compact"
                          ? "w-18 h-18 rounded-xl text-2xl font-bold font-mono"
                          : "w-16 h-16 rounded-xl text-2xl font-bold font-mono",
```

- [ ] **Step 2: Index pill + glowing arrow weight**

- Index label: `text-sm font-mono text-neutral-400 font-semibold mt-2 text-center select-none` → `text-xs font-mono text-neutral-400 font-semibold mt-2 text-center select-none`.
- Pointer arrow glyph: `<span className={cn("text-sm leading-none", style.color)}>` → `<span className={cn("text-sm font-bold leading-none", style.color)}>`.
- Pointer name stays `text-sm font-mono font-bold`; `layoutId={`pointer-${name}`}` and the spring transition stay unchanged.

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: 0 errors.

### Task 5: Wiki updates
**Files:**
- Modify: `docs/wiki/components.md`
- Modify: `docs/wiki/api.md`

- [ ] **Step 1: components.md** — rewrite the `QuestionBanner` bullet in the `VisualExplainer.tsx` section as the pinned `ProblemBanner`; document `LiveMathBadge` under `VariableBadges.tsx`; update the `ArrayStage.tsx` sizing tiers, index-pill size and pointer weight.
- [ ] **Step 2: api.md** — document the 3-phase prompt flow, the `calculation` field (LLM-required, response-optional) and add it to the example step JSON.
- [ ] **Step 3: Verify** — re-read both files; every claim must match the shipped code (class names, thresholds, animation duration).

### Final verification
- [ ] `cd server && npx tsc --noEmit` → 0 errors
- [ ] `cd client && npx tsc --noEmit && npm run build` → 0 errors, build compiles
