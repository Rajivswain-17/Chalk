# Visual Explainer Design — 2026-09-21

## 1. Outcome & Scope
Replace the Remotion/HLS async video pipeline with a synchronous, immersive,
full-screen, zero-blink step-by-step interactive explainer (dsa.chaicode.com experience).
Pure React DOM/SVG + Framer Motion. No Remotion, Puppeteer, FFmpeg, HLS, BullMQ, SSE.

Success: user submits a prompt in chat → one `POST /api/visualize` returns step JSON →
5-zone player renders inline with Prev/Next, Play/Pause, speed, scrub, fullscreen.

## 2. Constraints (agreed)
- Zero video rendering. No background jobs; one synchronous HTTP response.
- Zero blink: Zone 2 canvas container never unmounts. Pointers slide via
  Framer Motion `layoutId` / CSS `transform`. Colors via `transition-colors duration-300`.
- Full-screen immersive dark UI, 5 zones, fullscreen toggle via Fullscreen API.
- Auth: keep cookie auth. `POST /api/visualize` requires `requireAuth` (+ `requireCsrf`).
- Stack: client Next.js 16.3.5 / React 19 / Tailwind v4 + shadcn; server Express + Drizzle +
  PostgreSQL + Valkey. Install `framer-motion` fresh in client.
- Stage types v1: `array`, `tree` only. `cards`/`flow` reserved (forward-compatible enum).

## 3. Architecture
```
ChatWorkspace (ActiveChatView)
  └─ VisualExplainer (5-zone shell, owns useVisualPlayer)
       ├─ Zone1 Header + StepDots
       ├─ Zone2 ArrayStage | TreeStage (persistent wrapper)
       ├─ Zone3 CodePanel (layoutId="code-pill")
       ├─ Zone4 VariableBadges
       ├─ Zone5 CaptionBar
       └─ ControlsBar (prev/next, play/pause, speed, scrub, fullscreen)
Server: POST /api/visualize → visualize.routes → visualize.service (OpenAI sync) → Zod validate → { steps }
```

### 3.1 Backend
- Route: `server/src/routes/visualize.routes.ts`
  `POST /` with `requireAuth, requireCsrf`, `express-rate-limit` 10/hr (reuse generation limiter pattern).
  Body: `{ prompt: string (10–1000 chars) }` via Zod.
- Service: `server/src/services/visualize.service.ts` calls OpenAI (`openai` pkg, already installed)
  with structured output (JSON schema), 60s timeout. Model from `env.OPENAI_MODEL`
  (default `gpt-4o-mini`). System prompt enforces:
  6–12 steps, `stageType` array|tree, 5–10 `codeLines`, valid `activeLine`, 1–2 sentence `explanation`.
- Validators: `server/src/validators/visualize.ts` — Zod schemas for Step, StageElement, request/response.
- Response: `{ steps: VisualStep[] }` sorted by `stepIndex`. Failures: OpenAI timeout → 503
  `VISUAL_TIMEOUT`; schema fail → 502 `VISUAL_INVALID` (log raw); auth/validation passthrough.
- Mount at `/api/visualize` in `server/src/index.ts`.

### 3.2 Step JSON contract
```ts
type StageType = "array" | "tree" | "cards" | "flow"; // v1 emits array|tree
type ElementState = "default" | "active" | "compare" | "found" | "visited" | "path";
interface StageElement { id: string; value: string; indexLabel?: string; state: ElementState; pointer?: string | null; }
interface VisualStep {
  stepIndex: number; title: string; subtitle?: string; stageType: StageType;
  elements: StageElement[]; codeLines: string[]; activeLine: number;
  variables: Record<string, string | number | null>; explanation: string;
}
```

### 3.3 Frontend
- `client/src/lib/visualize.ts`: types above + `fetchVisualization(prompt): Promise<{steps}>` via `apiFetch` (cookies + CSRF).
- `client/src/hooks/useVisualPlayer.ts`: `{ step, total, playing, speed, next, prev, goTo, togglePlay, cycleSpeed }`.
  Timer `2500 / speed` ms, cleanup on pause/unmount/speed change.
- `client/src/components/visual/VisualExplainer.tsx`: 5-zone shell + keyboard
  (ArrowLeft/Right, ignored when typing) + fullscreen container ref.
- `ArrayStage.tsx`: flex row of boxes keyed by `element.id`; pointer arrows
  `motion.div layoutId={pointer-<name>}`; state colors with `transition-colors duration-300`.
- `TreeStage.tsx`: SVG edges (recomputed per step, stable keys) + absolute-positioned nodes keyed by `id`.
- `CodePanel.tsx`: lines list, active pill `motion.div layoutId="code-pill"` animates `y`.
- `VariableBadges.tsx`, `CaptionBar.tsx`, `ControlsBar.tsx`, `StepDots.tsx` (Zone 1).
- `AnimatePresence` only for inner labels/captions (opacity/y <300ms); never around Zone 2 wrapper.
- Integration: replace `VideoPlayer` in `ActiveChatView` with `VisualExplainer`; loading skeleton → steps → error card with retry.

### 3.4 Controls & fullscreen
- Prev/Next buttons + arrows; Play/Pause 2.5s base; speed cycles 0.5x→1x→2x; scrub range input.
- Fullscreen: `containerRef.requestFullscreen()` / `document.exitFullscreen()` + `fullscreenchange`
  listener; `:fullscreen` dark bg; sidebar/input remain mounted (hidden behind fullscreen element).

## 4. Deletion plan (full replacement)
Server: `services/compositor/`, `services/ffmpeg/`, `services/queue/`, `remotion/`, `worker.ts`,
`routes/video.routes.ts` (generate/events), HLS static + SSE/redis subscription in `index.ts`,
job logic in `controllers/video.controller.ts`, `lib/sse.ts` if orphaned.
Client: `VideoPlayer.tsx`, `PipelineStepper.tsx`, `WatchView.tsx`, `useVideoEvents`, `app/watch/`,
`hls.js` dep in `client/package.json`. Keep auth routes, middleware, DB schema unless orphaned.

## 5. Error handling
| Case | Behavior |
|---|---|
| 401/403 | Existing auth flow (login redirect / CSRF error) |
| 400 prompt | Inline form error (≥10 chars) |
| 429 | Rate-limit card, retry after window |
| 503 timeout / 502 invalid | Error card in message bubble with Retry button |
| Empty steps | Treated as 502 |

## 6. Testing
- Zod contract test: Two-Sum (array) + Path-Sum (tree) fixtures validate.
- `useVisualPlayer` timer/speed/bounds unit check.
- Manual: keyboard nav, 0.5x/1x/2x timing, scrub, fullscreen in/out, no-blink visual pass
  (pointer slides, no canvas flash on step change).
- `tsc` + `eslint` + `next build` (client), `tsc` (server).

## 7. Non-goals (v1)
`cards`/`flow` stages, streaming/SSE steps, persistence of visualizations, mobile-specific layouts,
removal of auth/DB/Valkey infra (Valkey stays for rate-limit/session even though queue goes).
