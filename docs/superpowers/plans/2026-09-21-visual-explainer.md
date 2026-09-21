# Visual Explainer Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Remotion/HLS async video pipeline with a synchronous interactive 5-zone visual explainer.

**Architecture:** Express `POST /api/visualize` calls OpenAI synchronously with Zod structured output and returns `{steps}` in one response; Next.js `VisualExplainer` renders the 5 zones with a never-unmounting canvas and Framer Motion pointers.

**Tech Stack:** Next.js 16.3.5, React 19, Tailwind v4 + shadcn, `framer-motion` (new), Express 4, Zod 3, `openai` ^4.67.3 (already installed), `zodResponseFormat` from `openai/helpers/zod`.

**Spec:** `docs/superpowers/specs/2026-09-21-visual-explainer-design.md`

## Global Constraints
- Zero video rendering: no Remotion / Puppeteer / FFmpeg / HLS / BullMQ / SSE in new code.
- Zero blink: Zone 2 outer canvas div never unmounts; pointers slide via `layoutId` or `transform`; colors via `transition-colors duration-300`.
- Stage types v1 emit only `array` | `tree` (`cards` | `flow` reserved in enum, never emitted).
- `POST /api/visualize` requires `requireAuth` + `requireCsrf`, rate limit 10/hr, prompt 10–1000 chars.
- OpenAI model from `env.OPENAI_MODEL` (repo default `gpt-4o`); 60s timeout; sync single response.
- Fullscreen via `element.requestFullscreen()` on the player container only.
- Delete `hls.js` from `client/package.json`.

## Review Focus
- Prompt with 9 chars → expect inline form error, no fetch. Pinned in Task 4 steps.
- OpenAI returns 2 steps (below min 6) → expect 502 `VISUAL_INVALID`, error card with Retry. Pinned in Task 1 steps.
- OpenAI takes >60s → expect 503 `VISUAL_TIMEOUT`, error card with Retry. Pinned in Task 1 steps.
- Rapid Prev/Next spam during Play → expect single mounted canvas, stepIndex clamped 0..n-1, no flash. Pinned in Task 3 steps.
- Fullscreen toggle then Escape → expect exit to inline bubble, timer keeps running, sidebar intact. Pinned in Task 4 steps.

---

## File map
- Create `server/src/validators/visualize.ts` — new step contract (replaces old `visualStepSchema` usage).
- Create `server/src/services/visualize.service.ts` — OpenAI sync call, 60s timeout, maps parsed plan to `VisualStep[]`.
- Create `server/src/routes/visualize.routes.ts` — auth + CSRF + limiter + handler.
- Modify `server/src/index.ts` — mount `/api/visualize`; remove HLS static, SSE subscriber, queue import.
- Create `client/src/lib/visualize.ts` — shared TS types + `fetchVisualization`.
- Create `client/src/hooks/useVisualPlayer.ts` — playback state machine.
- Create `client/src/components/visual/VisualExplainer.tsx` — 5-zone shell (persistent Zone 2 wrapper).
- Create `client/src/components/visual/ArrayStage.tsx`, `TreeStage.tsx`, `CodePanel.tsx`, `VariableBadges.tsx`, `CaptionBar.tsx`, `ControlsBar.tsx`, `StepDots.tsx`.
- Modify `client/src/components/ChatWorkspace.tsx` — `ActiveChatView` uses `VisualExplainer` instead of `VideoPlayer` + stepper.
- Modify `client/package.json` — add `framer-motion`, remove `hls.js`.
- Delete: `server/src/services/compositor/`, `server/src/services/ffmpeg/`, `server/src/services/queue/`, `server/src/remotion/`, `server/src/worker.ts`, `server/src/lib/sse.ts` (if orphaned), `server/src/routes/video.routes.ts`, `server/src/controllers/video.controller.ts`, `server/src/services/agents/planner.ts` (superseded), `client/src/components/VideoPlayer.tsx`, `client/src/components/PipelineStepper.tsx`, `client/src/components/WatchView.tsx`, `client/src/hooks/useVideoEvents.ts`, `client/src/app/watch/`.

### Task 1: Server contract + service + route

**Files:**
- Create: `server/src/validators/visualize.ts`
- Create: `server/src/services/visualize.service.ts`
- Create: `server/src/routes/visualize.routes.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `getOpenAIClient`, `openAIModel` from `server/src/lib/openai.ts`; `requireAuth`, `requireCsrf` from `server/src/middleware/auth.ts`; `env` from `server/src/lib/env.ts`.
- Produces: `POST /api/visualize({prompt}) → {steps: VisualStep[]}`; exports `visualizeRequestSchema`, `visualStepSchema`, `visualizeResponseSchema` from validators.

- [ ] **Step 1: Write the contract validator**

Create `server/src/validators/visualize.ts`:
```ts
import { z } from "zod";

export const elementStateSchema = z.enum(["default", "active", "compare", "found", "visited", "path"]);

export const stageElementSchema = z.object({
  id: z.string().min(1),
  value: z.string(),
  indexLabel: z.string().optional(),
  state: elementStateSchema,
  pointer: z.string().nullable().optional(),
});

export const visualStepSchema = z.object({
  stepIndex: z.number().int().min(0),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(160).optional(),
  stageType: z.enum(["array", "tree", "cards", "flow"]),
  elements: z.array(stageElementSchema).min(1).max(12),
  codeLines: z.array(z.string()).min(3).max(12),
  activeLine: z.number().int().min(0),
  variables: z.record(z.union([z.string(), z.number(), z.null()])),
  explanation: z.string().min(1).max(600),
});

export const visualizeRequestSchema = z.object({
  prompt: z.string().trim().min(10, "Prompt must be at least 10 characters").max(1000),
});

export const visualizeResponseSchema = z.object({
  steps: z.array(visualStepSchema).min(6).max(12),
});

export type VisualStep = z.infer<typeof visualStepSchema>;
```

- [ ] **Step 2: Verify contract parses the Two-Sum fixture**

Run: `cd server && npx tsx -e "import('./src/validators/visualize.ts').then(async m => { const r = m.visualizeResponseSchema.safeParse({steps: []}); console.log(r.success ? 'UNEXPECTED_PASS' : 'OK_EMPTY_REJECTED'); })"`
Expected: prints `OK_EMPTY_REJECTED` (min-6 rule rejects empty).

- [ ] **Step 3: Write the OpenAI service**

Create `server/src/services/visualize.service.ts`:
```ts
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, openAIModel } from "../lib/openai";
import { visualizeResponseSchema, type VisualStep } from "../validators/visualize";

const llmPlanSchema = z.object({
  steps: z.array(z.object({
    title: z.string(), subtitle: z.string().optional(),
    stageType: z.enum(["array", "tree"]),
    elements: z.array(z.object({
      id: z.string(), value: z.string(), indexLabel: z.string().optional(),
      state: z.enum(["default", "active", "compare", "found", "visited", "path"]),
      pointer: z.string().nullable().optional(),
    })).min(1).max(12),
    codeLines: z.array(z.string()).min(3).max(12),
    activeLine: z.number().int().min(0),
    variables: z.record(z.union([z.string(), z.number(), z.null()])),
    explanation: z.string(),
  })).min(6).max(12),
});

export async function generateVisualization(prompt: string): Promise<VisualStep[]> {
  const client = getOpenAIClient();
  const completion = await client.beta.chat.completions.parse({
    model: openAIModel,
    messages: [
      { role: "system", content: "You are a DSA visual educator. Return 6-12 progressive steps. Use stageType 'array' for Two Sum/Binary Search/Sliding Window/Sorting and 'tree' for DFS/BFS/Path Sum. Each step: title, 5-10 codeLines with valid 0-based activeLine, 1-2 sentence explanation, state-colored elements with pointer names like i/j/left/right/curr." },
      { role: "user", content: prompt },
    ],
    response_format: zodResponseFormat(llmPlanSchema, "visual_plan"),
    temperature: 0.5,
  }, { timeout: 60_000 });
  const plan = completion.choices[0]?.message.parsed;
  const parsed = visualizeResponseSchema.safeParse(
    plan ? { steps: plan.steps.map((s, i) => ({ ...s, stepIndex: i })) } : { steps: [] },
  );
  if (!parsed.success) throw Object.assign(new Error("VISUAL_INVALID"), { status: 502 });
  return parsed.data.steps;
}
```
Timeout errors from the SDK propagate and are mapped to 503 in the route.

- [ ] **Step 4: Write the route**

Create `server/src/routes/visualize.routes.ts`:
```ts
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { visualizeRequestSchema } from "../validators/visualize";
import { generateVisualization } from "../services/visualize.service";
import { requireAuth, requireCsrf } from "../middleware/auth";

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

router.post("/", limiter, requireAuth, requireCsrf, async (req, res) => {
  const body = visualizeRequestSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid prompt" }); return; }
  try {
    const steps = await generateVisualization(body.data.prompt);
    res.json({ steps });
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 503;
    const message = err instanceof Error ? err.message : "Visualization failed";
    res.status(status).json({ error: status === 502 ? "VISUAL_INVALID" : status === 503 && message !== "VISUAL_INVALID" ? "VISUAL_TIMEOUT" : message });
  }
});

export default router;
```

- [ ] **Step 5: Mount route, verify compile**

In `server/src/index.ts` add `import visualizeRoutes from "./routes/visualize.routes";` and `app.use("/api/visualize", visualizeRoutes);`. Keep old mounts untouched in this task (deletion is Task 5).
Run: `cd server && npx tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/validators/visualize.ts server/src/services/visualize.service.ts server/src/routes/visualize.routes.ts server/src/index.ts
git commit -m "feat: add sync POST /api/visualize with OpenAI step JSON"
```

### Task 2: Client data layer + playback hook

**Files:**
- Create: `client/src/lib/visualize.ts`
- Create: `client/src/hooks/useVisualPlayer.ts`

**Interfaces:**
- Consumes: `apiFetch` from `client/src/lib/auth-client.ts`; `POST /api/visualize`.
- Produces: `fetchVisualization(prompt: string): Promise<{steps: VisualStep[]}>`; `useVisualPlayer(total: number)` returning `{index, playing, speed, next, prev, goTo, togglePlay, cycleSpeed}`.

- [ ] **Step 1: Write client types + fetcher**

Create `client/src/lib/visualize.ts`:
```ts
import { apiFetch } from "@/lib/auth-client";

export type StageType = "array" | "tree" | "cards" | "flow";
export type ElementState = "default" | "active" | "compare" | "found" | "visited" | "path";
export interface StageElement { id: string; value: string; indexLabel?: string; state: ElementState; pointer?: string | null; }
export interface VisualStep {
  stepIndex: number; title: string; subtitle?: string; stageType: StageType;
  elements: StageElement[]; codeLines: string[]; activeLine: number;
  variables: Record<string, string | number | null>; explanation: string;
}

export function fetchVisualization(prompt: string): Promise<{ steps: VisualStep[] }> {
  return apiFetch<{ steps: VisualStep[] }>("/api/visualize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }), csrf: true,
  });
}
```

- [ ] **Step 2: Write the player hook**

Create `client/src/hooks/useVisualPlayer.ts`:
```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type PlaySpeed = 0.5 | 1 | 2;

export function useVisualPlayer(total: number) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeed>(1);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0))), [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const goTo = useCallback((n: number) => setIndex(() => Math.min(Math.max(n, 0), Math.max(total - 1, 0))), [total]);
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const cycleSpeed = useCallback(() => setSpeed((s) => (s === 0.5 ? 1 : s === 1 ? 2 : 0.5)), []);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing || total <= 1) return;
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i >= total - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 2500 / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, total]);

  useEffect(() => { setIndex(0); setPlaying(false); }, [total]);

  return { index, playing, speed, next, prev, goTo, togglePlay, cycleSpeed };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/visualize.ts client/src/hooks/useVisualPlayer.ts
git commit -m "feat: add visualize client fetcher and playback hook"
```

### Task 3: 5-zone visual components (zero-blink)

**Files:**
- Create: `client/src/components/visual/ArrayStage.tsx`
- Create: `client/src/components/visual/TreeStage.tsx`
- Create: `client/src/components/visual/CodePanel.tsx`
- Create: `client/src/components/visual/VariableBadges.tsx`
- Create: `client/src/components/visual/CaptionBar.tsx`
- Create: `client/src/components/visual/ControlsBar.tsx`
- Create: `client/src/components/visual/StepDots.tsx`
- Create: `client/src/components/visual/VisualExplainer.tsx`

**Interfaces:**
- Consumes: `VisualStep` from `@/lib/visualize`; `useVisualPlayer` from `@/hooks/useVisualPlayer`.
- Produces: `<VisualExplainer steps={steps} title={string} />` — the only export other tasks use.

- [ ] **Step 1: Install framer-motion**

Run: `cd client && npm install framer-motion`
Expected: `framer-motion` appears in `client/package.json` dependencies.

- [ ] **Step 2: Write ArrayStage (persistent keys, sliding pointers)**

Create `client/src/components/visual/ArrayStage.tsx`:
```tsx
"use client";
import { motion } from "framer-motion";
import type { VisualStep } from "@/lib/visualize";
import { cn } from "@/lib/utils";

const stateColor: Record<string, string> = {
  default: "bg-zinc-800 border-zinc-700 text-zinc-100",
  active: "bg-amber-500/25 border-amber-400 text-amber-100",
  compare: "bg-blue-500/25 border-blue-400 text-blue-100",
  found: "bg-emerald-500/25 border-emerald-400 text-emerald-100",
  visited: "bg-zinc-700 border-zinc-500 text-zinc-300",
  path: "bg-purple-500/25 border-purple-400 text-purple-100",
};

export function ArrayStage({ step }: { step: VisualStep }) {
  const pointers = [...new Set(step.elements.map((e) => e.pointer).filter(Boolean))] as string[];
  return (
    <div data-testid="array-stage" className="flex flex-col items-center gap-6">
      <div className="flex gap-2">
        {pointers.map((p) => {
          const target = step.elements.find((e) => e.pointer === p);
          return target ? (
            <motion.div key={`pointer-${p}`} layoutId={`pointer-${p}`} transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="text-xs font-mono text-amber-300" style={{ transform: "translateX(0)" }}>
              {p} ▼
            </motion.div>
          ) : null;
        })}
      </div>
      <div className="flex gap-2">
        {step.elements.map((el) => (
          <div key={el.id} className={cn("size-14 rounded-xl border-2 flex flex-col items-center justify-center transition-colors duration-300", stateColor[el.state])}>
            <span className="font-mono font-bold">{el.value}</span>
            {el.indexLabel && <span className="text-[10px] opacity-70">{el.indexLabel}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write TreeStage (stable SVG + nodes)**

Create `client/src/components/visual/TreeStage.tsx`:
```tsx
"use client";
import type { VisualStep } from "@/lib/visualize";
import { cn } from "@/lib/utils";

const nodeColor: Record<string, string> = {
  default: "bg-zinc-800 border-zinc-700 text-zinc-100",
  active: "bg-amber-500/25 border-amber-400 text-amber-100",
  compare: "bg-blue-500/25 border-blue-400 text-blue-100",
  found: "bg-emerald-500/25 border-emerald-400 text-emerald-100",
  visited: "bg-zinc-700 border-zinc-500 text-zinc-300",
  path: "bg-purple-500/25 border-purple-400 text-purple-100",
};

function pos(i: number): { x: number; y: number } {
  const depth = Math.floor(Math.log2(i + 1));
  const start = Math.pow(2, depth) - 1;
  const count = Math.pow(2, depth);
  return { x: ((i - start + 0.5) / count) * 100, y: 12 + depth * 26 };
}

export function TreeStage({ step }: { step: VisualStep }) {
  return (
    <div data-testid="tree-stage" className="relative w-full max-w-xl h-64">
      <svg className="absolute inset-0 size-full">
        {step.elements.map((el, i) => {
          if (i === 0) return null;
          const parent = pos(Math.floor((i - 1) / 2));
          const cur = pos(i);
          return <line key={`${step.elements[Math.floor((i - 1) / 2)].id}-${el.id}`} x1={`${parent.x}%`} y1={`${parent.y}%`} x2={`${cur.x}%`} y2={`${cur.y}%`} stroke="#52525b" strokeWidth={2} />;
        })}
      </svg>
      {step.elements.map((el, i) => {
        const p = pos(i);
        return (
          <div key={el.id} className={cn("absolute size-12 -translate-x-1/2 rounded-full border-2 flex items-center justify-center font-mono font-bold transition-colors duration-300", nodeColor[el.state])} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {el.value}
            {el.pointer && <span className="absolute -top-5 text-[10px] font-mono text-amber-300">{el.pointer}</span>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write CodePanel + badges + caption + controls + dots**

Create each file exactly:

`CodePanel.tsx`:
```tsx
"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function CodePanel({ lines, activeLine }: { lines: string[]; activeLine: number }) {
  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2 font-mono text-xs">
      {lines.map((line, i) => (
        <div key={i} className={cn("relative px-2 py-1 rounded", i === activeLine ? "text-amber-100" : "text-zinc-400")}>
          {i === activeLine && <motion.div layoutId="code-pill" className="absolute inset-0 bg-amber-500/15 border border-amber-500/40 rounded" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <span className="relative">{line}</span>
        </div>
      ))}
    </div>
  );
}
```

`VariableBadges.tsx`:
```tsx
export function VariableBadges({ variables }: { variables: Record<string, string | number | null> }) {
  return (
    <div className="flex flex-wrap gap-1.5 content-start">
      {Object.entries(variables).map(([k, v]) => (
        <span key={k} className="font-mono text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1">{k}={String(v)}</span>
      ))}
    </div>
  );
}
```

`CaptionBar.tsx`:
```tsx
export function CaptionBar({ title, subtitle, explanation }: { title: string; subtitle?: string; explanation: string }) {
  return (
    <div className="px-4 py-3 border-t border-zinc-800">
      <p className="text-sm font-medium">{title}{subtitle ? <span className="text-zinc-400"> — {subtitle}</span> : null}</p>
      <p className="text-sm text-zinc-300">{explanation}</p>
    </div>
  );
}
```

`ControlsBar.tsx`:
```tsx
"use client";
export function ControlsBar(props: { index: number; total: number; playing: boolean; speed: number; canPrev?: boolean; canNext?: boolean; onPrev(): void; onNext(): void; onToggle(): void; onSpeed(): void; onScrub(n: number): void; onFullscreen(): void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800">
      <button onClick={props.onPrev} disabled={props.index === 0}>Prev</button>
      <button onClick={props.onToggle}>{props.playing ? "Pause" : "Play"}</button>
      <button onClick={props.onNext} disabled={props.index >= props.total - 1}>Next</button>
      <button onClick={props.onSpeed}>{props.speed}x</button>
      <input type="range" min={0} max={Math.max(props.total - 1, 0)} value={props.index} onChange={(e) => props.onScrub(Number(e.target.value))} className="flex-1" />
      <button onClick={props.onFullscreen}>Fullscreen</button>
    </div>
  );
}
```

`StepDots.tsx`:
```tsx
"use client";
import { cn } from "@/lib/utils";
export function StepDots({ total, index, onGo }: { total: number; index: number; onGo(n: number): void }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} aria-label={`Go to step ${i + 1}`} onClick={() => onGo(i)} className={cn("size-2 rounded-full transition-colors duration-300", i === index ? "bg-amber-400" : "bg-zinc-700")} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write VisualExplainer shell (Zone 2 never unmounts)**

Create `client/src/components/visual/VisualExplainer.tsx`:
```tsx
"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { VisualStep } from "@/lib/visualize";
import { useVisualPlayer } from "@/hooks/useVisualPlayer";
import { ArrayStage } from "./ArrayStage";
import { TreeStage } from "./TreeStage";
import { CodePanel } from "./CodePanel";
import { VariableBadges } from "./VariableBadges";
import { CaptionBar } from "./CaptionBar";
import { ControlsBar } from "./ControlsBar";
import { StepDots } from "./StepDots";

export function VisualExplainer({ steps, title }: { steps: VisualStep[]; title: string }) {
  const player = useVisualPlayer(steps.length);
  const step = steps[player.index];
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") player.next();
      if (e.key === "ArrowLeft") player.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boxRef.current?.requestFullscreen();
  };

  if (!step) return null;
  return (
    <div ref={boxRef} className="bg-[#0d0f14] text-zinc-100 rounded-xl overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-sm font-medium">{title}</span>
        <StepDots total={steps.length} index={player.index} onGo={player.goTo} />
      </header>
      <div data-testid="canvas" className="min-h-64 flex items-center justify-center p-6">
        {step.stageType === "tree" ? <TreeStage step={step} /> : <ArrayStage step={step} />}
      </div>
      <div className="grid md:grid-cols-2 gap-3 px-4">
        <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
        <VariableBadges variables={step.variables} />
      </div>
      <CaptionBar title={step.title} subtitle={step.subtitle} explanation={step.explanation} />
      <ControlsBar index={player.index} total={steps.length} playing={player.playing}
        speed={player.speed} onPrev={player.prev} onNext={player.next}
        onToggle={player.togglePlay} onSpeed={player.cycleSpeed} onScrub={player.goTo} onFullscreen={toggleFullscreen} />
      <motion.div key={step.stepIndex} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} />
    </div>
  );
}
```
Note: the `motion.div` at the bottom is caption-fade only — the `data-testid="canvas"` wrapper has no key and never unmounts.

- [ ] **Step 6: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/visual client/package.json client/package-lock.json
git commit -m "feat: add 5-zone zero-blink visual explainer"
```

### Task 4: Chat integration + dep cleanup

**Files:**
- Modify: `client/src/components/ChatWorkspace.tsx`
- Modify: `client/package.json`

**Interfaces:**
- Consumes: `<VisualExplainer steps title />` from Task 3; `fetchVisualization` from Task 2.
- Produces: `ActiveChatView` fetches steps on `session.prompt` and renders inline player + error card with Retry.

- [ ] **Step 1: Remove hls.js, keep framer-motion**

Run: `cd client && npm uninstall hls.js`
Expected: `hls.js` absent from `package.json`; `framer-motion` present.

- [ ] **Step 2: Wire ActiveChatView to visualize**

Replace `VideoPlayer` + `PipelineStepper` + `useVideoEvents` + `getVideoStatus` in `ActiveChatView` with:
```tsx
const [steps, setSteps] = useState<VisualStep[] | null>(null);
const [error, setError] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  setLoading(true); setError(null);
  fetchVisualization(session.prompt).then((r) => setSteps(r.steps)).catch((e) => setError(e.message)).finally(() => setLoading(false));
}, [session.prompt, session.jobId]);
```
Render: loading skeleton → error card with Retry button (`onClick` re-runs fetch) → `<VisualExplainer steps={steps} title={session.title} />`. Reject prompts <10 chars inline before fetch (pins Review Focus line 1).

- [ ] **Step 3: Verify fullscreen + keyboard manually**

Run: `cd client && npm run dev`, submit Two-Sum prompt, press ArrowRight/Left, toggle fullscreen, press Escape.
Expected: no canvas flash; timer keeps running after Escape (pins Review Focus lines 4–5).

- [ ] **Step 4: Build + lint**

Run: `cd client && npm run lint; npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ChatWorkspace.tsx client/package.json client/package-lock.json
git commit -m "feat: render visual explainer inline in chat, drop hls.js"
```

### Task 5: Delete the old pipeline

**Files:**
- Delete (server): `src/services/compositor/`, `src/services/ffmpeg/`, `src/services/queue/`, `src/remotion/`, `src/worker.ts`, `src/lib/sse.ts` (only if no imports remain — grep first), `src/routes/video.routes.ts`, `src/controllers/video.controller.ts`, `src/services/agents/planner.ts`.
- Delete (client): `src/components/VideoPlayer.tsx`, `src/components/PipelineStepper.tsx`, `src/components/WatchView.tsx`, `src/hooks/useVideoEvents.ts`, `src/app/watch/`.
- Modify: `server/src/index.ts` (remove HLS static, SSE subscriber, queue import).

- [ ] **Step 1: Confirm no live imports of deleted modules**

Run: `rg -l "useVideoEvents|VideoPlayer|PipelineStepper|WatchView|videoQueue|sseManager|remotion|hlsPackager" client/src server/src --glob '!**/visual*'`
Expected: only `server/src/index.ts` and Task-4-touched files reference them (which you then clean).

- [ ] **Step 2: Delete files + strip index.ts**

Run (PowerShell):
```powershell
Remove-Item -Recurse -Force server/src/services/compositor, server/src/services/ffmpeg, server/src/services/queue, server/src/remotion
Remove-Item -Force server/src/worker.ts, server/src/routes/video.routes.ts, server/src/controllers/video.controller.ts, server/src/services/agents/planner.ts
Remove-Item -Force client/src/components/VideoPlayer.tsx, client/src/components/PipelineStepper.tsx, client/src/components/WatchView.tsx, client/src/hooks/useVideoEvents.ts
Remove-Item -Recurse -Force client/src/app/watch
# server/src/lib/sse.ts — delete only if Step 1 grep shows zero importers outside deleted files
```
In `server/src/index.ts` remove: `hlsDirectory` static block, `requireVideoOwner` usage for `/hls`, redis `psubscribe("job:*")` block, `videoQueue` import/close. Keep `/api/visualize`, `/api/auth`, health checks, CORS, helmet, cookieParser.
Also remove `dev:worker` / `start:worker` scripts only if `worker.ts` is gone (keep otherwise-dead scripts out).

- [ ] **Step 3: Full verification**

Run: `cd server && npx tsc --noEmit; cd ../client && npx tsc --noEmit && npm run build`
Expected: all PASS. Grep from Step 1 returns empty.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Remotion/HLS video pipeline"
```
