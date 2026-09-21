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
- **Footer**: User profile indicator and logout actions via `useAuth()`.

### 2. Main Chat Area
- **Empty State**: Welcoming illustration and interactive prompt chips.
- **User Message Bubble**: Right-aligned prompt card.
- **Assistant Response Card**: Houses the inline visualizer with three phases:
  - *Loading*: Shimmer skeleton with progress indicator.
  - *Error*: Formatted alert with direct retry button.
  - *Success*: Full `VisualExplainer` player.

### 3. Bottom Input Bar
- Auto-expanding multi-line textarea with character counter.
- Aspect ratio switcher (`16:9` widescreen or `9:16` vertical).
- Keyboard submission: `Enter` sends prompt, `Shift+Enter` inserts line break.

### Sub-Component: `ActiveChatView`
Mounted with a unique key per session (`key={session.jobId}`). Invokes `fetchVisualization(session.prompt)` on mount and manages response caching and lifecycle transitions.

---

## Visual Explainer Suite (`components/visual/`)

The zero-blink, 5-zone interactive DSA player inspired by [dsa.chaicode.com](https://dsa.chaicode.com).

### 1. `VisualExplainer.tsx` - Core Player Container
- Manages full playback lifecycle via `useVisualPlayer(steps.length)`.
- Global keyboard bindings: `ArrowLeft` (previous step), `ArrowRight` (next step), `Space` (toggle playback).
- Fullscreen support via `containerRef.current.requestFullscreen()`.
- **Zero-Blink Guarantee**: The canvas viewport container (`data-testid="canvas"`) remains permanently mounted across step transitions; only child node states mutate.

### 2. `ArrayStage.tsx` - Zone 2 (Array Visualizer)
- Renders indexed array elements as 56x56px rounded cards (`size-14 rounded-xl border-2`).
- Dynamic element state coloring:
  - `default`: Neutral border and slate background
  - `active`: Amber glow and amber border
  - `compare`: Blue highlight with pulse
  - `found`: Emerald border and glowing badge
  - `visited`: Muted dark zinc
  - `path`: Purple highlight
- **Pointer Badges**: Animated pointer arrows (`low`, `high`, `mid`, `i`, `j`) with Framer Motion `layoutId="pointer-{name}"` spring animations (`stiffness: 400, damping: 32`).

### 3. `TreeStage.tsx` - Zone 2 (Tree Visualizer)
- Renders hierarchical binary tree structures positioned via heap order:
  - Left child: `2i + 1`
  - Right child: `2i + 2`
- SVG canvas layer renders connecting edges with dynamic path coloring.
- Circular node glyphs (`size-12 rounded-full border-2`) styled according to node state.

### 4. `CodePanel.tsx` - Zone 3 (Code Execution Panel)
- Displays monospace algorithm implementation with line numbers.
- **Sliding Indicator**: Active line is highlighted with a sliding amber pill using Framer Motion `layoutId="code-pill"` (`stiffness: 500, damping: 40`).

### 5. `VariableBadges.tsx` - Zone 4 (Runtime Variables)
- Horizontal wrap of active variable chips (e.g. `left = 0`, `target = 7`).
- Rendered in dark pill badges with monospace font formatting.

### 6. `CaptionBar.tsx` - Zone 5 (Step Explanation)
- Prominently displays the step title and optional subtitle.
- Renders rich explanatory narrative describing why this state change occurred.

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

- **Timing**: Auto-advance fires on `2500ms / speed` intervals.
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
