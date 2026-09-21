# Visual Redesign (Chai-Quality Studio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the VisualExplainer component family into a premium immersive dark studio matching dsa.chaicode.com quality, with animated glows on every active/comparing/found element.

**Architecture:** Pure presentational rewrite. Data contract (`VisualStep`, `useVisualPlayer` API) is FROZEN — no server, validator, fetcher, or hook-signature changes. Only JSX/styles/animation in 6 client files.

**Tech Stack:** Next.js 16.3.5, React 19, Tailwind v4, framer-motion (installed), lucide-react (installed — use its icons, not emoji).

**Spec:** User redesign brief 2026-09-21 (chat message: glow rules + 2-column studio layout + toolbar + playback + zero-blink). This plan embeds its verbatim values per task.

## Global Constraints
- Zero-blink: Zone 2 stage wrapper never unmounts (no key); boxes/nodes stay mounted, only state classes change; pointers slide via `layoutId`; code pill via `layoutId="code-active-pill"`; colors via `transition-all duration-500`.
- Frozen interfaces: `VisualStep`/`StageElement` in `client/src/lib/visualize.ts`; `useVisualPlayer` returns `{index,playing,speed,next,prev,goTo,togglePlay,cycleSpeed}` — do not change shapes.
- No `any`, no unused imports (repo eslint is strict: `@typescript-eslint/no-unused-vars`, `react-hooks/set-state-in-effect`, `react-hooks/purity`).
- No raw `input[type=range]`; no emoji-as-icon where lucide has the icon (RotateCcw, SkipBack, Play, Pause, SkipForward, Maximize, Copy, PencilLine).
- `flex-nowrap`, not `flex-wrap-none` (not a real class).

## Review Focus
- 9+ element arrays → expect shrink to w-12 h-12 + horizontal scroll, zero overlap. Pinned in Task 1.
- Rapid step changes → expect mounted boxes only change classes, pointers glide, no flash. Pinned in Task 1.
- Variable value change between steps → expect 600ms amber flash then rest. Pinned in Task 2.
- Space key while typing in textarea → expect no toggle (typing guard). Pinned in Task 2.
- Tree payload in non-heap order → renders by index convention (known contract limitation, not this task).

---

## File map
- Rewrite: `client/src/components/visual/ArrayStage.tsx`, `TreeStage.tsx`
- Rewrite: `client/src/components/visual/VisualExplainer.tsx`, `CodePanel.tsx`, `VariableBadges.tsx`, `ControlsBar.tsx`, `StepDots.tsx`
- Touch only if needed: `client/src/hooks/useVisualPlayer.ts` (API frozen; Space/replay are consumer-side)
- Never: server/*, validators, lib/visualize.ts, ChatWorkspace (beyond what exists)

### Task 1: ArrayStage + TreeStage (glow system + pointers + layout)

**Files:**
- Rewrite: `client/src/components/visual/ArrayStage.tsx`
- Rewrite: `client/src/components/visual/TreeStage.tsx`

**Interfaces:**
- Consumes: `VisualStep` from `@/lib/visualize` (frozen); `cn` from `@/lib/utils`; `motion` from `framer-motion`.
- Produces: `ArrayStage({step})`, `TreeStage({step})` — same prop signatures as today.

- [ ] **Step 1: Rewrite ArrayStage**

State→class map (exact):
- active: `ring-2 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)]`
- compare: `ring-2 ring-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.4)]`
- found: `ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] bg-emerald-500/20`
- visited/path: `opacity-60` muted border, no glow
- default: `border-2 border-neutral-700`, no glow

Layout: row `flex flex-row items-center justify-center gap-3 flex-nowrap`; box `w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-white bg-[#161821] border-2 transition-all duration-500 ease-in-out`; if elements > 8 use `w-12 h-12 text-lg`; wrapper `overflow-x-auto`. Index label below each box: `text-xs font-mono text-neutral-500 mt-1 text-center` showing `[i]` (use element.indexLabel when present, else `[i]`). Pointers below labels: distinct `motion.div layoutId={pointer-${name}}` per pointer name, spring `{ type: "spring", stiffness: 300, damping: 30 }`, triangle ▲ + label, per-pointer color (amber/cyan/violet by name hash or fixed map left=amber right=cyan curr=violet) with matching `shadow-[0_0_12px...]` glow. Boxes keyed by `element.id`, never remounted.

- [ ] **Step 2: Rewrite TreeStage**

Nodes `w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold border-2 transition-all duration-500`, same glow map (active also `scale-110`). Edges `<svg>` lines `stroke-neutral-600 stroke-width-2`. Heap-order layout by index (root top-center, children spread, ≥80px vertical level gap, ≥70px horizontal gap), keys = `element.id`. Container centers tree with padding so nothing overlaps.

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/visual/ArrayStage.tsx client/src/components/visual/TreeStage.tsx
git commit -m "feat: studio-grade array and tree stages with glow system"
```

### Task 2: Shell + code panel + badges + toolbar + dots

**Files:**
- Rewrite: `client/src/components/visual/VisualExplainer.tsx`
- Rewrite: `client/src/components/visual/CodePanel.tsx`
- Rewrite: `client/src/components/visual/VariableBadges.tsx`
- Rewrite: `client/src/components/visual/ControlsBar.tsx`
- Rewrite: `client/src/components/visual/StepDots.tsx`

**Interfaces:**
- Consumes: `VisualStep` (frozen); `useVisualPlayer` `{index,playing,speed,next,prev,goTo,togglePlay,cycleSpeed}` (frozen); `ArrayStage`/`TreeStage` from Task 1.
- Produces: `<VisualExplainer steps title />` (same export as today).

- [ ] **Step 1: Rewrite VisualExplainer shell**

Container `w-full min-h-[520px] bg-[#0c0d12] border border-neutral-800/60 rounded-2xl overflow-hidden flex flex-col`, `containerRef` for fullscreen. Header `h-14 px-5 flex items-center justify-between border-b border-neutral-800/50 bg-[#0e1018]`: left title (`font-semibold text-white text-base`) + subtitle pill (`bg-neutral-800 text-neutral-400 text-xs px-2 py-0.5 rounded-full`); center `StepDots`; right `Step X / Y` pill (`bg-neutral-800 text-neutral-300 text-xs font-mono px-2.5 py-1 rounded-md`). Main `flex-1 grid grid-cols-[1fr_380px] gap-0`: left stage `p-8 flex flex-col items-center justify-center relative overflow-hidden` with the NEVER-UNMOUNTING wrapper rendering Array/Tree by `stageType`; right `CodePanel` in `border-l border-neutral-800/50 bg-[#12141c] flex flex-col`. Then `VariableBadges`, explanation bar (`px-5 py-3 border-t border-neutral-800/50 bg-[#0e1018]`, pencil icon + optional `Line X` badge + text, opacity 0→1 over 200ms per step), then `ControlsBar`. Keyboard: ArrowLeft/Right/Space (Space = togglePlay), skip when target is TEXTAREA/INPUT (also SELECT/contentEditable guard allowed), Escape exits fullscreen. Fullscreen toggle via `containerRef.requestFullscreen()` / `document.exitFullscreen()`.

- [ ] **Step 2: Rewrite CodePanel**

Header `h-10 px-4 flex items-center justify-between border-b border-neutral-800/50`: `CONCEPT` label (`text-xs font-bold text-neutral-500 tracking-wider`) + lucide `Copy` button (`text-neutral-500 hover:text-white cursor-pointer`, copies code text via `navigator.clipboard`). Body `flex-1 p-4 overflow-y-auto font-mono text-sm leading-relaxed`, rows `flex items-start gap-3`, number `w-6 text-right text-neutral-600 text-xs select-none shrink-0`, content `text-neutral-300`. Active row: `bg-amber-500/12 border-l-4 border-amber-500 pl-2 rounded-r-md text-amber-200` + `▶` marker + `shadow-[inset_0_0_40px_rgba(251,191,36,0.06)]`; sliding pill `motion.div layoutId="code-active-pill"` spring `{ type: "spring", stiffness: 400, damping: 35 }`, `transition-all duration-300`.

- [ ] **Step 3: Rewrite VariableBadges + StepDots**

Row (render only when variables exist): `flex flex-wrap gap-2 px-5 py-2`; badge `bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono`, name `text-neutral-400`, `=`, value `text-amber-300 font-semibold`. On value change vs previous step, flash `ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.3)]` for 600ms then rest (`transition-all duration-300`; track prev values with a ref, timeout cleanup). Dots `flex gap-1.5`, `w-2 h-2 rounded-full`: current `bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]`, completed `bg-emerald-400`, upcoming `bg-neutral-700`, click → goTo.

- [ ] **Step 4: Rewrite ControlsBar**

Toolbar `h-14 px-4 flex items-center gap-3 border-t border-neutral-800/50 bg-[#0a0b10]`, NO raw range inputs. Replay (`RotateCcw`, goTo(0)), StepBack (`SkipBack`, prev, `opacity-30` disabled at 0), Play/Pause (prominent `w-11 h-11 rounded-full bg-white text-black hover:bg-neutral-200 shadow-lg shadow-white/10`, Play/Pause icons), StepNext (`SkipForward`, disabled at end), custom scrubber (`flex-1 mx-3`, track `h-1.5 bg-neutral-800 rounded-full relative overflow-hidden cursor-pointer`, fill `absolute left-0 top-0 h-full bg-amber-500 rounded-full transition-all duration-300` width %, thumb `absolute w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] top-1/2 -translate-y-1/2` visible on track hover, click-to-seek via bounding-rect math), speed (`bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono font-bold px-2.5 py-1 rounded-md`, cycles via cycleSpeed), fullscreen (`Maximize`, onFullscreen). All icon buttons `w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors`.

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/visual/VisualExplainer.tsx client/src/components/visual/CodePanel.tsx client/src/components/visual/VariableBadges.tsx client/src/components/visual/ControlsBar.tsx client/src/components/visual/StepDots.tsx
git commit -m "feat: studio shell with code panel, badges, toolbar"
```
