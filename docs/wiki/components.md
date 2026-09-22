# Client Components Reference

All frontend components reside in `client/src/`. The application uses the **Next.js 16 App Router** with **React 19**, **Tailwind CSS v4**, **Framer Motion**, and **shadcn/ui** design primitives.

---

## Page Components (`app/`)

### `app/layout.tsx` - Root Application Layout
- Mounts `AuthProvider` to supply user session state across all child components.
- Configures Geist and Geist Mono font variables.
- Injects global stylesheet `globals.css` with dark theme variables.

### `app/page.tsx` - Main Application Entry
- Renders the interactive `ChatWorkspace` component.
- Protected route: unauthorized requests are redirected to `/login` via edge middleware.

### `app/generate/page.tsx` - Prompt Generation Page
- Displays `PromptForm` nested within an `AuthSplit` container.
- Protected route for creating new visualizations.

### `app/login/page.tsx` & `app/signup/page.tsx` - Authentication Pages
- Renders `AuthForm` inside `AuthSplit` with either login or signup presets.
- Guest-only routes: automatically redirects already-authenticated users to `/generate`.

### `app/how-it-works/page.tsx` - Documentation & Guide
- Public informational walkthrough explaining Chalk's step-by-step visual engine.

---

## Main Shell: `ChatWorkspace.tsx`

The core experience of Chalk. Structured into three primary viewports:

### 1. Left Sidebar
- **Header**: Chalk logo with amber `"VISUAL"` badge.
- **New Visualization**: Action button with `Ctrl+K` shortcut listener.
- **Featured Presets**: Quick-start sample prompts:
  - LeetCode 112 Path Sum (Tree)
  - Two Sum Two Pointers (Array)
  - Credit Scores Ranking (Array)
  - TCP 3-Way Handshake (Flow)
- **Recent Visualizations**: Persisted in `localStorage` under `chalk_recent_chats_v2`.
  - **Step cache**: `ChatSession.steps?: VisualStep[]` caches each successful visualization result. `ActiveChatView` hydrates its initial state from `session.steps` and early-returns from its fetch effect when present — refreshes and recent-chat clicks render instantly with **0 API calls** (no rate-limit 429s). On fetch success, `onCacheSteps` (via a `cacheRef` so the effect runs once per session) persists steps back through `saveSessions` into both React state and localStorage. `retry()` remains the only fetch trigger for cached sessions.
  - Each row is `flex items-center justify-between gap-2` (row is a `div[role="button"]` so the nested delete button stays valid in React 19) with `truncate` on the title to prevent collision with the aspect badge.
  - A hover/focus-revealed `Trash2` icon button deletes the session: updates state, persists via `saveSessions` (writes `chalk_recent_chats_v2`), and resets to the welcome view when the active session is deleted. Row `onKeyDown` guards `e.target !== e.currentTarget` so keyboard delete on the trash button never bubbles into row selection.
- **Footer**: User profile indicator and logout actions via `useAuth()`.

### 2. Main Chat Area
- **Empty State**: Welcoming illustration and interactive prompt chips — wrapped `w-full max-w-5xl xl:max-w-6xl mx-auto` for studio coherence.
- **User Message Bubble**: Right-aligned prompt card.
- **Assistant Response Card**: Houses the inline visualizer with three phases:
  - *Loading*: Shimmer skeleton with progress indicator.
  - *Error*: Formatted alert with direct retry button.
  - *Success*: Full `VisualExplainer` player.
  - Container is **transparent** (`bg-transparent border-0 p-0 shadow-none`) — content blends with the page background; only subtle internal `border-b`/`border-t` dividers, status badges, and the red error alert remain (no giant dark card).
  - `ActiveChatView` root is `w-full max-w-6xl xl:max-w-7xl mx-auto`.

### 3. Bottom Input Bar
- Wrapped `w-full max-w-5xl xl:max-w-6xl mx-auto` to match the wide studio player.
- Auto-expanding multi-line textarea with character counter.
- Aspect ratio switcher (`16:9` widescreen or `9:16` vertical).
- Keyboard submission: `Enter` sends prompt, `Shift+Enter` inserts line break.

### Sub-Component: `ActiveChatView`
Mounted with a unique key per session (`key={session.jobId}`). Invokes `fetchVisualization(session.prompt)` on mount and manages response caching and lifecycle transitions.

---

## Visual Explainer Suite (`components/visual/`)

The zero-blink, 5-zone interactive DSA player inspired by [dsa.chaicode.com](https://dsa.chaicode.com).

### 1. `VisualExplainer.tsx` - Core Player Container
- Studio-wide shell: root `w-full max-w-6xl xl:max-w-7xl mx-auto min-h-[520px]` with a 2-column grid (`grid-cols-[1fr_420px]`) — left stage `min-h-[380px]`, right code panel fixed `420px` (wide enough that wrapped code needs no horizontal scrollbar).
- Manages full playback lifecycle via `useVisualPlayer(steps.length)`.
- **Persistent `ProblemBanner`** (local component, rendered on EVERY step): pinned to the top of the left visual stage, above the canvas (`w-full px-5 py-3 bg-[#12141c] border-b border-neutral-800/60 flex items-center justify-between flex-wrap gap-2`). It is derived from `steps[0]` only — never from the active step — so it cannot re-animate as the player advances and the viewer always has the target and goal in view:
  - Left: problem title (`text-base font-bold text-white tracking-wide`). `problemNameOf()` strips a leading `Problem Breakdown: | Problem Statement: | Overview:` prefix and a trailing `Problem` (e.g. `Problem Breakdown: Koko Eating Bananas` → `Koko Eating Bananas`).
  - Right: `Input: nums = [...]` badge (`bg-neutral-800/90 text-neutral-300 text-xs font-mono px-3 py-1 rounded-md border border-neutral-700`; array stages only, omits `nums =` for non-numeric values); the constraint badge (`bg-amber-500/15 text-amber-300 text-xs font-mono font-bold ... border-amber-500/30`) from `constraintOf()` — a `variables` entry whose name contains `target`, else the first non-pointer variable (pointer names `i/j/k/lo/low/hi/high/mid/left/right/curr/current/start/end/l/r` are skipped); and the `Goal: <subtitle>` pill (`bg-emerald-500/15 text-emerald-300 text-xs font-semibold ... border-emerald-500/30`) from step 1's `subtitle`.
- **Live Math row**: when the active step carries `calculation`, a full-width row sits directly below the canvas and above the variable badges (`border-t border-neutral-800/50 bg-[#0e1018] px-5 py-3`) rendering `LiveMathBadge`.
- **Explanation bar**: `min-h-[72px] px-6 py-4 bg-[#0e1018] border-t border-neutral-800/60 gap-4` with a `size-5` amber `PencilLine`, an amber bordered `Line N` badge, and the narrative at `text-base sm:text-lg font-medium text-neutral-200 leading-relaxed max-w-5xl select-text` with a 200ms opacity cross-fade keyed on `step.stepIndex`.
- Global keyboard bindings: `ArrowLeft` (previous step), `ArrowRight` (next step), `Space` (toggle playback).
- Fullscreen support via `containerRef.current.requestFullscreen()`.
- **Zero-Blink Guarantee**: The canvas viewport container (`data-testid="canvas"`) remains permanently mounted across step transitions; only child node states mutate.

### 2. `ArrayStage.tsx` - Zone 2 (Array Visualizer)
- **Adaptive element shapes**: each element's `isWord` check (`value.length > 3 || value.includes(' ') || isNaN(Number(value))`) picks the shape:
  - *Numbers / short codes*: hero-sized square box in three tiers driven by `sizeTier` (element count) — `≤ 6` → `hero` (`w-22 h-22 rounded-2xl text-3xl font-extrabold font-mono`), `7–10` → `compact` (`w-18 h-18 rounded-xl text-2xl font-bold font-mono`), `> 10` → `dense` (`w-16 h-16 rounded-xl text-2xl font-bold font-mono`). Sizes use the Tailwind v4 dynamic spacing scale (`w-22` = 5.5rem), not arbitrary values.
  - *Words / phrases* (e.g. "Payment History"): rounded rectangle (`min-w-[130px] max-w-[180px] min-h-[58px] px-3.5 py-2 rounded-xl text-xs font-semibold leading-snug text-center break-words`).
- Row layout: `flex-nowrap` with a tier-driven gap (`gap-5` for `≤ 6` elements, `gap-3` above that) inside an `overflow-x-auto scroll-smooth` scroller — boxes and rectangles never overlap.
- Index labels: `text-xs font-mono text-neutral-400 font-semibold mt-2`.
- Dynamic element state coloring:
  - `default`: Neutral border and slate background
  - `active`: Amber glow and amber border
  - `compare`: Blue highlight with pulse
  - `found`: Emerald border and glowing badge
  - `visited`: Muted dark zinc
  - `path`: Purple highlight
- **Pointer Badges**: Animated pointer arrows (`low`, `high`, `mid`, `i`, `j`) with Framer Motion `layoutId="pointer-{name}"` spring animations (`stiffness: 300, damping: 30`); the arrow glyph is `text-sm font-bold` and the pointer name `text-sm font-mono font-bold`, both in the pointer's glow color.

### 3. `TreeStage.tsx` - Zone 2 (Tree Visualizer)
- Renders hierarchical binary tree structures positioned via heap order:
  - Left child: `2i + 1`
  - Right child: `2i + 2`
- SVG canvas layer renders connecting edges with dynamic path coloring.
- Text-safe node glyphs: `min-w-14 min-h-14 max-w-[110px] px-2 py-1 rounded-2xl border-2` — adaptive labels (values > 12 chars switch to `text-[11px] font-semibold leading-tight text-center break-words`; short values keep `text-lg font-bold`).
- Spacing: level height `95px`, horizontal slot width `105px` (min width floor `520px`) so branches and long biological/algorithm names never crowd.

### 4. `CodePanel.tsx` - Zone 3 (Code Execution Panel)
- Displays monospace algorithm implementation with line numbers.
- **Sliding Indicator**: Active line is highlighted with a sliding amber pill using Framer Motion `layoutId="code-active-pill"` (`stiffness: 400, damping: 35`).
- Code body is `overflow-y-auto overflow-x-hidden` and each line wraps (`flex-1 min-w-0 whitespace-pre-wrap break-words`), so long pseudocode never produces a horizontal scrollbar.

### 5. `VariableBadges.tsx` - Zone 4 (Runtime Variables)
- `VariableBadges`: horizontal wrap of active variable chips (e.g. `left = 0`, `target = 7`). Rendered in dark pill badges with monospace font formatting; a chip flashes amber (`ring-1 ring-amber-400/50` + glow) for 600ms when its value changes.
- `LiveMathBadge` (exported from the same file, rendered by `VisualExplainer` when `step.calculation` is set): the live expanded arithmetic for the active step — container `px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 flex items-center gap-3 shadow-[0_0_15px_rgba(251,191,36,0.08)]`, a `∑` badge (`text-amber-400 font-mono font-bold text-sm bg-amber-500/20 px-2 py-0.5 rounded-md`), the formula at `text-sm sm:text-base font-mono font-semibold text-amber-200 tracking-wide`, and a 250ms opacity cross-fade keyed on the full `calculation` string (formula + verdict).
  - `parseVerdict()` first splits a trailing `(…)` group off the calculation and turns it into a pill. A fail group (`invalid` / `false` / `fail(s|ed)` / `no` / `too small|large|high|low|big` / `move left|right` / `exceed(s|ed)` / `not`, all word-bounded) renders `✗` on `bg-neutral-800/90 text-neutral-300 border-neutral-700`; otherwise a pass group (`valid` / `match` / `true` / `pass(es|ed)` / `success` / `found` / `works` / `yes`) renders `✓` on `bg-emerald-500/20 text-emerald-300 border-emerald-500/30`. Fail wins, and `\b` boundaries keep `invalid` from matching the pass pattern.
  - **Equation fallback**: when no qualifying parenthetical group exists, `verdictFromEquation()` evaluates the formula's *last* comparison — resolving operand names against the step's `variables` and any `name = number` assignment written in the formula — but **only for `==`/`!=`** (→ `✓ Match` / `✗ No match`, world-state semantics). Relational operators (`<`, `>`, `<=`, `>=`) return no pill: their truth does not encode pass/fail (`mid < target` true means "too small, move right", not "valid"). Unresolvable operands → no pill. The badge returns `null` for a missing/blank calculation, so narrative steps get no empty amber shell.

### 6. `CaptionBar.tsx` - Zone 5 (Step Explanation)
- Prominently displays the step title and optional subtitle.
- Renders the explanatory narrative at `text-base sm:text-lg font-medium text-neutral-200 leading-relaxed max-w-5xl` to match the `VisualExplainer` explanation bar.
- Currently unused by `VisualExplainer` (which inlines its own bar) — kept in sync for reuse.

### 7. `ControlsBar.tsx` - Player Controls Toolbar
- Dark studio toolbar (`h-14 bg-[#0a0b10]`); no raw `input[type=range]`.
- **Replay / Step Back / Play-Pause / Step Next**: lucide icons (`RotateCcw`, `SkipBack`, `SkipForward`, `Play`/`Pause`); boundary buttons disable with `opacity-30`; Play/Pause is the prominent white circular button.
- **Custom Scrubber**: click-to-seek track with amber fill + hover-only glowing thumb (`0.5` → `1.0` → `2.0` speed cycles through `cycleSpeed`).
- **Speed Toggle**: `bg-neutral-800` mono pill cycling `0.5x` → `1x` → `2x`.
- **Fullscreen**: `Maximize` icon → container fullscreen API.

### 8. `StepDots.tsx` - Step Indicator
- Compact row of circular dots representing total steps.
- Active step highlighted in amber.
- Clicking any dot jumps immediately to that step index.

---

## Authentication Components

### `AuthForm.tsx`
- Dual-mode credentials form supporting both login and signup.
- Input validation for email format and password length requirements.
- Renders `OAuthButtons` for configured identity providers.
- Coordinates with `useAuth()` hook for state management.

### `AuthSplit.tsx`
- Responsive split-screen presentation:
  - Left panel: Dark branded hero display with Chalk features and proof metrics.
  - Right panel: Form card with light theme styling.

---

## Hooks (`hooks/`)

### `useVisualPlayer.ts`
Custom hook managing visualization playback and timing.

```typescript
export function useVisualPlayer(total: number): {
  index: number;         // Current step index (0 to total - 1)
  playing: boolean;      // True if auto-playing
  speed: 0.5 | 1 | 2;   // Speed multiplier
  next: () => void;      // Advance one step
  prev: () => void;      // Step backward
  goTo: (n: number) => void; // Jump to index
  togglePlay: () => void;    // Play/Pause toggle
  cycleSpeed: () => void;    // Cycle 0.5x -> 1x -> 2x
}
```

- **Timing**: Auto-advance fires on `4500ms / speed` intervals (4.5s per step at 1x, giving time to read the code line and explanation).
- **Auto-Pause**: Playback automatically halts upon reaching the final step.
- **Reset**: When `total` changes, `index` resets to 0 and `playing` halts.

---

## Context Providers & Libs (`lib/`)

### `AuthProvider` (`lib/auth.tsx`)
Supplies session data and auth actions:
- `user`: Authenticated user object or `null`.
- `booting`: True during initial session verification.
- `login(credentials)`: Submits credentials and sets user.
- `signup(data)`: Registers new user and sets user.
- `logout()`: Clears server cookies and client session.
- Subscribes to `chalk:auth-lost` event to clear user when refresh tokens expire.

### `auth-client.ts`
Universal fetch wrapper:
- Injects credentials and CSRF tokens.
- Intercepts 401 responses and triggers silent session refresh.
- Dispatches global auth loss events.

### `visualize.ts`
Client-side schemas and API caller for `/api/visualize`.

---

## Route Middleware (`proxy.ts`)

Next.js Edge middleware handling route authorization via cookie presence:
- Redirects unauthenticated users attempting to access `/generate` to `/login`.
- Redirects logged-in users visiting `/login` or `/signup` to `/generate`.
