# Chalk Fixes: Adaptive Shapes, Step Cache, Rate Limit, Card Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline execution). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Adaptive element shapes (rect for words, box for numbers), localStorage step caching to stop 429-on-refresh, 250/hr dev rate limit, transparent assistant/error containers.

**Architecture:** Targeted edits to 3 files (`ArrayStage.tsx`, `ChatWorkspace.tsx`, `visualize.routes.ts`). No new components, no dependency changes. Frozen interfaces: `VisualStep`/`StageElement` types, `useVisualPlayer` API, glow `stateStyles` maps, `fetchVisualization` signature.

**Spec:** User fix brief 2026-09-22 (chat message, 4 numbered items) + `docs/wiki/` (components.md, api.md).

**Root cause (systematic-debugging Phase 1, 429):** `ActiveChatView` mount effect always fetches; `ChatSession` never persists `steps` → every refresh burns rate-limit budget against a 10/hr cap. Not a server bug — a missing client cache. Fixes target both ends.

## Global Constraints
- Preserve dark theme, glow effects, color scheme exactly (`stateStyles`/`nodeStateStyles` glow maps untouched).
- Frozen interfaces: `VisualStep`, `useVisualPlayer`, `ControlsBar` props, `fetchVisualization`, `visualizeResponseSchema`.
- No new npm dependencies; strict eslint (no `any`, no unused vars, no sync setState-in-effect — repo has 2 accepted pre-existing ChatWorkspace errors at :94/:152).
- Verification per task: `npx tsc --noEmit` (client and/or server) → 0 errors; final gate: client `npm run build` + lint delta check. **Repo has no test framework** (ledgered ruling from prior runs, user-specified verification is tsc) — class-string/styling steps are verified by tsc + build + grep of exact class strings.
- Working in place on `main` (standing user preference — no worktree).

## Review Focus (final reviewer checks deliberately)
- Cache path: cached session → **zero** API calls (effect must early-return AND initial state must hydrate from `session.steps` so loading=false renders immediately; no sync setState-in-effect added).
- Cache write: after fetch success, `steps` persisted to `sessions` + `localStorage` AND `activeSession` kept consistent.
- 429 residual path: retry() still fetches (intended — manual user action) — verify this is the ONLY remaining fetch trigger for cached sessions.
- Shapes: `isWord` logic exact; numbers still square (`w-16 h-16`), words rounded rect (`min-w-[130px] max-w-[180px]`); `gap-4 flex-nowrap` + scroll; glow classes byte-identical.
- Rate limit: 250 non-production, 10 production; `NODE_ENV` read correctly in container (dev default).
- Transparent card: outer container exactly `bg-transparent border-0 p-0 shadow-none`; inner status badges/dividers/error alert still visible; user bubble untouched.

---

## Task 1: Adaptive shapes in ArrayStage (item 1)

**Files:** Modify `client/src/components/visual/ArrayStage.tsx`

- [ ] **Step 1:** Inside the map callback, add `const isWord = el.value.length > 3 || el.value.includes(" ") || isNaN(Number(el.value));`
- [ ] **Step 2:** Replace box div classes: base `"rounded-xl flex items-center justify-center transition-all duration-500 ease-in-out select-none text-white"` + `stateClass`; number branch `"w-16 h-16 text-2xl font-bold font-mono"`; word branch `"min-w-[130px] max-w-[180px] min-h-[58px] px-3.5 py-2 rounded-xl text-xs font-semibold leading-snug text-center break-words flex items-center justify-center"`. Inner `<span className="font-mono">` → render `el.value` directly (font classes live on container). Drop `isCompact` sizing branch (spec has exactly two branches; overflow-x scroll handles wide rows — ledgered ruling).
- [ ] **Step 3:** Container row: `gap-3` → `gap-4`, keep `flex-nowrap`, add `scroll-smooth`; outer scroller keeps `overflow-x-auto`.
- [ ] **Step 4:** `cd client && npx tsc --noEmit` → Expected: 0 errors.
- [ ] **Step 5:** Commit `feat: adaptive element shapes (rect for words, box for numbers)`.

## Task 2: localStorage step caching (item 2)

**Files:** Modify `client/src/components/ChatWorkspace.tsx`

- [ ] **Step 1:** `ChatSession` interface: add `steps?: VisualStep[];`.
- [ ] **Step 2:** `ChatWorkspace` adds callback `handleCacheSteps(jobId: string, steps: VisualStep[])` → maps `sessions` (replace matching job, add `steps`), calls `saveSessions(updated)`, and updates `activeSession` when it matches (keeps state consistent). Pass as prop `onCacheSteps` to `ActiveChatView`.
- [ ] **Step 3:** `ActiveChatView`: props `{ session, onCacheSteps }`. Hydrate initial state lazily: `useState<VisualStep[] | null>(() => session.steps ?? null)` and `useState(() => !session.steps)` for loading — cached sessions render finished immediately (no sync setState in effect; no new lint errors).
- [ ] **Step 4:** Mount effect: first line `if (tooShort || session.steps) return;` → cached path performs **0 fetches**. Fetch path `.then`: `setSteps(r.steps)` + `if (!cancelled) onCacheSteps(session.jobId, r.steps)` (also fire on success even if cancelled? No — only when !cancelled, per plan; user navigation away mid-fetch is rare and next select re-picks from updated sessions... ruling: fire `onCacheSteps` unguarded would update storage even when unmounted; keep guarded by `!cancelled` for state but persist steps regardless? **Decision: persist unguarded** — the API result is valuable regardless of navigation; guard only the setState). `retry()` also calls `onCacheSteps` on success.
- [ ] **Step 5:** `cd client && npx tsc --noEmit` → Expected: 0 errors; `npx eslint src/components/ChatWorkspace.tsx` → Expected: only the 2 pre-existing errors (no new set-state-in-effect).
- [ ] **Step 6:** Commit `feat: cache visualization steps in localStorage, stop 429 on refresh`.

## Task 3: Rate limit bump (item 3)

**Files:** Modify `server/src/routes/visualize.routes.ts`

- [ ] **Step 1:** Line 8: `limit` becomes conditional — 250 when `NODE_ENV !== "production"`, 10 in production. Match repo env-reading pattern (check `lib/env.ts` export; use it if other routes do, else `process.env`).
- [ ] **Step 2:** `cd server && npx tsc --noEmit` → Expected: 0 errors.
- [ ] **Step 3:** Commit `feat: bump visualize rate limit to 250/hr outside production`.

## Task 4: Transparent assistant/error container (item 4)

**Files:** Modify `client/src/components/ChatWorkspace.tsx`

- [ ] **Step 1:** Assistant response container (line ~537): `"bg-zinc-900/90 border border-zinc-800 rounded-2xl rounded-tl-sm p-4 sm:p-5 shadow-xl space-y-4"` → `"bg-transparent border-0 p-0 shadow-none space-y-4"` (spec verbatim: transparent, borderless, paddingless, shadowless; internal `border-b`/`border-t` dividers, status badges, skeleton, and the red error alert stay — they are the "subtle, modern alert", not the giant dark box). User bubble untouched.
- [ ] **Step 2:** `cd client && npx tsc --noEmit` → Expected: 0 errors; grep confirms no `bg-zinc-900/90` remains on that container.
- [ ] **Step 3:** Commit `feat: remove harsh card background from assistant response container`.

## Final Verification + Wiki

- [ ] `cd server && npx tsc --noEmit` and `cd client && npx tsc --noEmit && npm run build` → all 0 errors, build passes.
- [ ] Update `docs/wiki/components.md` (ArrayStage shapes, ChatWorkspace caching, transparent card) and `docs/wiki/api.md` (rate limit 250 non-prod).
- [ ] Final whole-branch review (fresh subagent), fix Critical/Important once, ledger minors.
