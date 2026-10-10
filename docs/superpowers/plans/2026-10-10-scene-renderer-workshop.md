# Scene Renderer + Scene Workshop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `SceneStep` variant to the client `ChalkStep` union, build the lazily-loaded `Scene3DStage` renderer (guided camera, amber highlights, callout pins, hardening, budgeted post-FX), and ship the dev-only Scene Workshop that hand-authors/edits heart sequencing — spec §5, §4.5, and §3.1/§3.2/§3.4, i.e. plan 3 of the 3D-scene decomposition.

**Architecture:** `SceneStep` is a self-contained step (spec §4.2): the server resolves `shotId → {pos,target,fov}` and `anchorId → pos` before it ever reaches the browser, so the renderer needs **no catalog data at runtime** and the localStorage cache stays steps-only (§3.3). The renderer lands as a `next/dynamic` chunk behind a new `scene` entry in `STAGE_REGISTRY` (§3.2/§3.4), so a DSA session never downloads three. The only catalog-derived data that reaches the client is a **curated per-scene `SceneDefinition`** (parts/anchors/shots only — never `SCENES`, keywords, license, or status), generated from the server catalog and consumed by the dev-only workshop. `SCENES` itself is never imported by or serialized to the client.

**Tech Stack:** TypeScript `strict` (client Next.js 16.3.5 App Router + React 19.2.8, server CommonJS + `tsx`), Tailwind v4, `three@0.186.1`, `@react-three/fiber@9.8.1`, `@react-three/drei@10.7.9`, `@react-three/postprocessing@3.1.3` + `postprocessing@6.39.5` (all new client runtime deps, authorized by spec §3.4/§5), `next/dynamic` for the lazy chunk, `zod ^3.23.8` (server, existing).

**Spec:** `docs/superpowers/specs/2026-09-25-scene-subproject-design.md` — this plan argues from §3.1/§3.2/§3.4 (union, registry, bundle discipline), §4.2 (server-side expansion / ID boundary), §4.5 (Scene Workshop), §5 (renderer), §7 (verification), §8 rollout step 2, and §11 item 3. Executors read the spec alongside this plan.

> **Shell note (verified repo reality — overrides any handoff text):** the harness shell on this host is **Windows PowerShell 5.1** (verified: `bash.exe` on PATH is the WSL stub, and the agent `shell` tool executes PowerShell). Consequences, binding on every task:
> - `cmd && cmd` does **not** work (PS 5.1 has no `&&` pipeline-chain operator). Never chain with `&&`; use one command per line, or `;` when sequencing is intentional.
> - Exit codes: read `$LASTEXITCODE` immediately after the command.
> - `git add a b \` backslash line-continuations do not work — write one long single-line `git add`.
> - `grep`/`cat`/`head` are not available in the general case — use `Select-String -Path <files> -Pattern '<pat>'` and `Get-Content`.
> - Directory changes: run each gate with its own working directory (`cd client` … `cd ..`), or `Push-Location` / `Pop-Location`.
> - File writes go through the harness file editor, not `Set-Content`, so no BOM handling is needed.

## Global Constraints

Copied from the plan-3 handoff and spec §3.5/§7; every task implicitly includes them.

- **Every verification pass runs and passes, in full:**
  - `npx tsc --noEmit` (cwd `server\`) → 0 errors
  - `npx tsc --noEmit` (cwd `client\`) → 0 errors
  - `npm run build` (cwd `client\`) → success
  - `npx eslint src/components src/lib src/hooks` (cwd `client\`) → **exactly 3 errors** (pre-existing baseline: `ChatWorkspace.tsx` ×2, `VariableBadges.tsx` ×1). Any other count is a regression.
  - `npm run scenes:validate` (cwd `server\`) → exit 0, stdout `scenes:validate OK — 1 scene(s), 0 warning(s)`
- **Frozen contracts (spec §3.5) must not regress:** `useVisualPlayer` API, `ControlsBar` props, `StepDots`, keyboard/fullscreen, glow `stateStyles` maps, `stageType`/element `state` enums, the schema bounds (6–12 steps, 1–12 elements), the `data-testid="canvas"` never-unmounts invariant, and **byte-identical DOM for `kind: "algorithm"`**. Widening the union must keep every existing consumer compiling.
- **Unfreeze budget (the one break, spec §5):** the `VisualStep` type (→ union) and the `ChatSession.steps` **type annotation**. Nothing else frozen moves.
- **No new runtime dependencies beyond what the spec authorizes.** Spec §3.4/§5 name `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` — those five packages (incl. `postprocessing`, its peer) are authorized. Any dependency change ships with its lockfile in the **same** commit (`client/package-lock.json`).
- **Zero remote runtime fetches:** assets are local files under `client/public/`; lighting is local (ambient/directional) — **drei `Environment` presets are forbidden** (spec §4.3, §9).
- **`SCENES` is server-owned and is never sent wholesale to the client** (spec §4.2). Resolved deliberately in Ruling R1 below.
- **No test framework exists in this repo.** The established translation: type-check gates + `scenes:validate` + expected-failure RED drills (mutate → expect exit 1 / tsc error with a named message → restore via `git checkout`). Browser/WebGL QA is **human-run** (the agent has no browser bridge); tasks state exactly what the human must observe.
- **HUMAN-ONLY steps never block an implementer subagent.** Steps labeled **HUMAN-ONLY** are run by the human/controller (they need a browser + WebGL). The implementer records `deferred-to-human: <what to observe>` in its report and continues to the commit. Only the four standing gates and a task's RED drills are blocking. **Human gate between Task 2 and Task 3:** the meshopt/WebP decode confirmation (Ruling 4, Ruling 11) — the controller resolves it before Task 3 starts.
- **New client code adds zero eslint errors** (the gate is exactly 3, all pre-existing). Concretely: no synchronous `setState` inside a `useEffect` body (Ruling 10 — that exact rule produced 2 of the 3 baseline errors), no unused imports, no `any`, and **no mutation of a hook-returned value** (Ruling 12 — `eslint-plugin-react-hooks` v7's `immutability` rule; inside `useFrame` use the callback's `state`, and never silence the rule with an inline disable).
- Working in place on `main` (standing preference; no worktree). Commits: `feat:` per task, `docs:` for wiki. Keep commits local unless the human approves a push.
- Update the relevant `docs/wiki/*.md` files whenever new major components land (`AGENTS.md` mandate).

## Rulings made while writing this plan

(Recorded because they resolve spec tensions or detail the spec leaves open.)

1. **Boundary resolution — two channels, `SCENES` never crosses.**
   - *Runtime:* a `SceneStep` is **self-contained** (§4.2/§3.3): it carries the expanded `shot {pos,target,fov}`, an `assetUrl`, `highlights[]` (part IDs, which equal the GLB mesh-node names), and `callouts[]` with **expanded coordinates** plus text. The renderer and the cache therefore need zero catalog data — this is what keeps cache hydration instant (§3.3) and makes §4.2's "server expands IDs before responding" the single source of poses. `shotId`/`anchorId` are retained purely as provenance/labels.
   - *Authoring (dev-only):* the workshop needs the parts/anchors/shot-library, which is what §4.5's "orbit, click a part, hotkey → write shot pose/anchor into the manifest" implies. That crosses as a **curated `SceneDefinition`** for one scene (id, assetUrl, parts, anchors, shots) — generated by a new server script from `SCENES` so the catalog stays the single source of truth. `SceneManifest` fields the client has no business seeing (`keywords`, `license`, `status`, `bytes`/`tris`) never cross; `SCENES` is never imported client-side.
   - *Why not "send the manifest":* violates §4.2. *Why not "send nothing":* the workshop cannot author without the shot library. Cost if wrong: a client-side definition type that Plan 4 replaces with server-expanded steps anyway — additive, low cost.
2. **Workshop writes via copy-out, not a write endpoint.** The workshop renders exportable JSON — (a) manifest-ready `shots`/`anchors` entries and (b) an authored `SceneStep[]` sequence — for the dev to paste into `catalog.ts` / the demo fixture. A browser→disk write would need a dev-only mutating HTTP endpoint (a security surface) plus file-write plumbing; copy-out keeps Plan 3 client-side and the manifest the single source of truth. Cost if wrong: one manual paste per authoring session; Plan 4/5 may add a gated dev endpoint.
3. **Dependency versions pinned to this repo's React 19.2.8 / Next 16.3.5:** `three@0.186.1`, `@react-three/fiber@9.8.1`, `@react-three/drei@10.7.9`, `@react-three/postprocessing@3.1.3`, `postprocessing@6.39.5`. Verified peers: fiber needs `react >=19 <19.4` ✓; drei needs `three>=0.159` + `fiber^9` ✓; postprocessing needs `three >=0.168 <0.187` ✓ (0.186.1). Use `^` ranges; the lockfile is the pin.
4. **Meshopt + WebP loading (carry-forward flag, verified not assumed).** `heart.glb` lists `EXT_meshopt_compression`, `EXT_texture_webp`, `KHR_mesh_quantization` in `extensionsRequired`. drei's `useGLTF(path, useDraco, useMeshopt)` wires **three-stdlib's `MeshoptDecoder`** when `useMeshopt` is true, so the renderer calls `useGLTF(assetUrl, false, true)`. three's `GLTFLoader` natively supports `EXT_texture_webp` (browser WebP) and `KHR_mesh_quantization` with no extra config. Task 2 pins an explicit load check; **fallback** if meshopt proves problematic: re-run `gltf-transform optimize … --compress quantize` and record the changed `bytes`/`tris` in the manifest + wiki (per the Plan-2 carry-forward note). Do not rediscover this.
5. **Post-FX is bloom behind an adaptive guard, isolated in its own task** (§5). It may be dropped/parked with a recorded ruling if the frame-time guard cannot be validated in a human QA session — it is not load-bearing for the vertical slice.
6. **Plan 3's slice of the fallback ladder is "message + controls alive."** The full 3D→procedural→2D→unsupported ladder is routed by Plan 4 (§5, §6). Here, a GLB load failure renders an in-stage message while the player chrome stays mounted (never a white screen).
7. **Definition drift is gate-enforced.** `scenes:validate` gains a check that the generated `client/src/lib/sceneDefinitions/<id>.json` deep-equals the projection of the catalog, so a manifest edit without regeneration fails the standing gate (mirrors Plan 2's asset/manifest drift check).
8. **The execution shell is PowerShell 5.1, not bash.** A prior draft of this plan asserted Git Bash; verified false on this host (`bash.exe` = WSL stub, agent shell = PowerShell). Every command block is written PowerShell-safe: no `&&`, no backslash continuations, `Select-String` instead of `grep`, `$LASTEXITCODE` for exit codes. Cost if wrong: nothing lost — bash blocks would have failed loudly on the first task.
9. **`BannerStep`'s indexed accesses are re-derived, not widened.** `VisualExplainer.tsx:59-60` reads `ChalkStep["elements"]` / `ChalkStep["stageType"]`; those become compile errors the moment `ChalkStep` is a real union (`SceneStep` has neither field). Task 2 Step 7 pins `StageElement[]` / `StageType` (both already exported by `visualize.ts`). This is Plan 1's recorded forward-compat flag, honored here. Cost if wrong: the tsc gate catches it in Task 2 — but the plan would have wasted a cycle.
10. **No `setState` synchronously inside `useEffect` in new client code.** The eslint baseline's 3 errors are exactly that rule firing (`react-hooks/set-state-in-effect`); a fourth would break the standing gate. `useDocumentVisible` (Task 5) therefore initializes state lazily with a `typeof document` guard and only *subscribes* in the effect. Cost if wrong: one lint error over baseline — reversible, but it would fail the gate.
11. **Meshopt/WebP runtime confirmation is a controller checkpoint between Task 2 and Task 3.** No agent can open a browser on this host, so the GLB decode check (Ruling 4) is a human/controller gate: if meshopt decoding fails, the documented fallback re-optimizes with `--compress quantize` and updates manifest `bytes`/`tris` + wiki before Task 3 builds on the renderer. A temporary dev route `client/src/app/scene-check/page.tsx` (created in Task 2, deleted in Task 9) makes that check — and every later visual check — possible without waiting for Task 8's workshop.
12. **`react-hooks/immutability` forbids mutating a hook-returned value — take the instance from `useFrame` state.** The client's `eslint-plugin-react-hooks` (v7 compiler rules) rejects `const { camera } = useThree()` followed by `camera.position.lerp(...)` — 2 new errors, which breaks the exactly-3 gate (found empirically in Task 3: the originally pinned snippet failed it). `Rig` therefore reads `state.camera` from the `useFrame((state, dt) => …)` callback — the same camera instance, no `any`, no suppression. Tasks 4 and 6 mutate three.js objects too: prefer `useFrame`'s `state`, and prove the result with the eslint gate rather than an inline disable.

## Review Focus

Pinned to the task that owns the code; each line gets an explicit verification step in that task.

1. **three leaking into the DSA bundle** — a static import of `Scene3DStage` (or of `three`/drei from any module the algorithm path imports) would ship ~400–600KB gz to every DSA session, silently killing the product's core UX → **Task 2** pins the `next/dynamic` boundary, forbids `three`/drei imports outside `components/visual/scene/`, and Task 9 QA item 7 requires the human to confirm a DSA session downloads no three chunk.
2. **GLB fails to decode (meshopt/WebP) → white screen** — `heart.glb` *requires* `EXT_meshopt_compression`; a missing decoder makes `useGLTF` reject → **Task 2** pins the `useGLTF(url, false, true)` call + an explicit load assertion + the quantize fallback ruling; **Task 5** pins the error boundary that degrades to a message with controls alive.
3. **Degenerate camera poses → NaN `lookAt` / black frame** — a straight-down `top_down` shot or `pos ≈ target` produces NaN → **Task 3** pins frame-rate-independent tweening that reuses the validate envelope unchanged, and **Task 8/9** require the authored demo sequence's poses to be re-checked by `scenes:validate` (|coord| ≤ 100, fov ∈ [15,120], distance ≥ 0.1).
4. **Catalog leakage across the boundary** — importing `SCENES`/`SceneManifest` client-side, or shipping keywords/license/status, violates §4.2 → **Task 7** pins the curated projection + the `scenes:validate` drift check + a grep assertion that no client module imports the server catalog; **Task 8** consumes only `SceneDefinition`.
5. **GPU leak / React strict-mode double mount** — R3F `<Canvas>` plus WebGL resources, mounted/unmounted across session switches, leak GPU memory if disposal is wrong → **Task 5** pins the dispose pass + idempotent effects; Task 9 QA item 2 requires the human to watch GPU memory across repeated session switches.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `client/package.json`, `client/package-lock.json` | modify | add the 5 authorized 3D deps (Task 1) |
| `client/src/lib/visualize.ts` | modify | add `Vec3`, `SceneShot`, `SceneCallout`, `SceneStep`; widen `ChalkStep`; widen `normalizeSteps` |
| `client/src/components/visual/stageRegistry.tsx` | modify | add `"scene"` layout + lazy `scene` entry; narrow algorithm entry |
| `client/src/components/visual/VisualExplainer.tsx` | modify | union-safe chrome (narrow `calculation`/`variables`/`activeLine` per kind) |
| `client/src/components/visual/scene/Scene3DStage.tsx` | create | default-export lazy chunk: Canvas, model, camera rig, pins, quality guard, dispose, authoring hooks |
| `client/src/components/visual/scene/SceneInspector.tsx` | create | Zone-3 slot: `notes[]` line-pills + callout list |
| `client/src/components/visual/scene/SceneErrorBoundary.tsx` | create | render-error boundary + in-stage fallback message |
| `client/src/components/visual/scene/SceneWorkshop.tsx` | create | dev-only authoring UI (orbit, pick part, capture shot, drop anchor, export, preview) |
| `client/src/lib/sceneDefinition.ts` | create | client `SceneDefinition` type + `SCENE_DEFINITIONS` map (JSON-backed) |
| `client/src/lib/sceneDefinitions/heart.json` | create (generated) | curated heart projection written by `scenes:definition` |
| `client/src/lib/sceneFixtures/heartSequence.ts` | create | hand-sequenced `SceneStep[]` demo (the vertical slice) |
| `client/src/app/workshop/page.tsx` | create | dev-only route (`notFound()` in production) |
| `server/src/scenes/definition.ts` | create | pure `buildSceneDefinition(manifest)` projection |
| `server/src/scenes/tools/emit-definition.ts` | create | CLI writing `client/src/lib/sceneDefinitions/*.json` |
| `server/src/scenes/validate.ts` | modify | add definition-drift check |
| `server/package.json` | modify | add `scenes:definition` script |
| `docs/wiki/components.md`, `docs/wiki/architecture.md`, `docs/wiki/index.md` | modify | Task 9 wiki (AGENTS.md mandate) |

Decomposition rationale: the union member and its registry entry are **inseparable** — `satisfies Record<ChalkStep["kind"], StageEntry>` refuses to compile a union member with no entry — so Task 2 ships the union, the registry entry, a *working* (plain) canvas, the inspector, and the VisualExplainer narrowing together. Later tasks add behavior (camera, glow/pins, hardening, post-FX) as separately reviewable diffs. The renderer's internals live under `components/visual/scene/` as one directory so the lazy-chunk boundary is a folder the reviewer can grep. Definition generation is server-side (`scenes/definition.ts` pure + `tools/emit-definition.ts` CLI) because the catalog is server-owned.

## Non-goals (explicitly other plans)

- **Router, LLM sequencer, `routes:check` golden table, unsupported-scene card, and flags (`SCENES_ENABLED`, `OPENAI_MODEL_SCENE`) → Plan 4.** Plan 3 wires **no** server route and changes no `/api/visualize` behavior; `fetchVisualization` and the wire `VisualStep` are untouched.
- The full fallback ladder (procedural recipe, 2D diagram, unsupported card) → Plan 4; Plan 3's degradation is Ruling 6.
- Logging, QA pass, flag flip, wiki for routing → Plan 5.
- System Design 2D → future spec (§9).

---

### Task 1: Client 3D dependencies

**Files:**
- Modify: `client/package.json`, `client/package-lock.json`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Tasks 2–8): `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `postprocessing` resolvable from `client/`.

- [ ] **Step 1: Install the authorized runtime deps**

Run (cwd `client/`): `npm i three@^0.186.1 @react-three/fiber@^9.8.1 @react-three/drei@^10.7.9 @react-three/postprocessing@^3.1.3 postprocessing@^6.39.5`
Expected: exit 0; `package.json` `dependencies` gains all five; `package-lock.json` updates.

- [ ] **Step 2: Prove the tree resolves and the client still builds with no usage yet**

Run (cwd `client/`): `npm ls three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing`
Expected: all five listed, no `UNMET PEER DEPENDENCY`.
Run (cwd `client/`): `npm run build`
Expected: success (unchanged route graph; no new bundle entries because nothing imports the deps yet).

- [ ] **Step 2b: Verify the drei API surface the renderer is pinned against (before writing any call site)**

Run (cwd `client/`):
```powershell
Get-ChildItem node_modules/@react-three/drei -Recurse -Filter *.d.ts | Select-String -Pattern "useGLTF" | Select-Object -First 12
```
Expected: the `useGLTF` declaration showing its parameter list, plus a `clear` member on it. Read the actual signature and confirm:
- `useGLTF(path, useDraco?, useMeshopt?, …)` — parameter **order and defaults** match what Task 2 pins (`useGLTF(url, false, true)` = draco off, meshopt on).
- `useGLTF.clear(url)` exists (Task 5's dispose pass depends on it).
- `Html` and `OrbitControls` are exported from the package root.

If the installed signature differs from the pinned call, Task 2 uses the **installed** form and the implementer records the deviation explicitly in its report — do not guess or force the pinned shape.

- [ ] **Step 3: Confirm the addition is inert for the standing gates**

Run (cwd `client/`): `npx tsc --noEmit` → exit 0.
Run (cwd `client/`): `npx eslint src/components src/lib src/hooks` → **exactly 3** errors.

- [ ] **Step 4: Commit (deps + lockfile together)**

```powershell
git add client/package.json client/package-lock.json
git commit -m "feat: add three, fiber, drei and postprocessing to the client"
```

**Review Focus:** the five packages match the spec-authorized set exactly (Ruling 3) — no extra 3D helper sneaks in; `package.json` and `package-lock.json` land in **one** commit; no `node_modules` change is committed.

---

### Task 2: `SceneStep` union + lazy registry entry + minimal working stage

**Files:**
- Modify: `client/src/lib/visualize.ts`
- Modify: `client/src/components/visual/stageRegistry.tsx`
- Modify: `client/src/components/visual/VisualExplainer.tsx`
- Create: `client/src/components/visual/scene/Scene3DStage.tsx`
- Create: `client/src/components/visual/scene/SceneInspector.tsx`
- Create: `client/src/components/visual/scene/SceneErrorBoundary.tsx`

**Interfaces:**
- Consumes: Task 1's deps; Plan-1 frozen contracts (`ChalkStep`, `normalizeSteps`, `STAGE_REGISTRY`, `StageEntry`, `LAYOUT_CLASSES`, `VisualExplainer`).
- Produces (relied on by later tasks):
  - `type Vec3 = [x: number, y: number, z: number]`
  - `interface SceneShot { pos: Vec3; target: Vec3; fov: number }`
  - `interface SceneCallout { anchorId: string; pos: Vec3; text: string }`
  - `interface SceneStep { kind: "scene"; stepIndex; title; subtitle?; explanation; sceneId; shotId; shot: SceneShot; assetUrl; highlights: string[]; callouts: SceneCallout[]; notes?: string[] }`
  - `type ChalkStep = AlgorithmStep | SceneStep`
  - `normalizeSteps(raw: ReadonlyArray<VisualStep | ChalkStep>): ChalkStep[]`
  - `StageLayout` now `"split" | "scene"`; `STAGE_REGISTRY.scene` entry with `layout: "scene"`
  - default export `Scene3DStage({ step }: { step: SceneStep })` (an optional `authoring` prop is added in Task 8)
  - `SceneInspector({ step }: { step: SceneStep })`
  - `SceneErrorBoundary({ children })`

- [ ] **Step 1: Add the union types + widen `normalizeSteps`**

In `client/src/lib/visualize.ts`, directly after the existing `ChalkStep = AlgorithmStep` line, insert:

```ts
export type Vec3 = [x: number, y: number, z: number];

/** Expanded shot pose (spec §4.2): the server resolves shotId → pos/target/fov
 *  before the step reaches the browser, so the renderer needs no catalog data. */
export interface SceneShot {
  pos: Vec3;
  target: Vec3;
  fov: number;
}

/** A callout pin: expanded anchor coordinates + authored text (spec §3.1/§4.2). */
export interface SceneCallout {
  anchorId: string;
  pos: Vec3;
  text: string;
}

/**
 * Scene step (spec §3.1). Self-contained per §4.2: `shot` and `callouts[].pos`
 * carry expanded geometry, so cache hydration stays steps-only (§3.3) and
 * `SCENES` never needs to reach the client. `shotId`/`anchorId` are retained as
 * provenance/labels (inspector, workshop round-trip).
 */
export interface SceneStep {
  kind: "scene";
  stepIndex: number;
  title: string;
  subtitle?: string;
  explanation: string;
  sceneId: string;
  shotId: string;
  shot: SceneShot;
  assetUrl: string;
  /** Part IDs; equal to the GLB mesh-node names (validate enforces this). */
  highlights: string[];
  callouts: SceneCallout[];
  /** SceneInspector content (Zone 3 slot, spec §3.2). */
  notes?: string[];
}

export type ChalkStep = AlgorithmStep | SceneStep;
```

Then replace the `normalizeSteps` function body/signature with the union-safe version:

```ts
/**
 * Idempotent ingestion stamp (cache hydrate + fetch). Preserves an existing
 * `kind` of any union member (scene steps survive re-normalization) and stamps
 * pre-union cache entries `"algorithm"`. Accepts both the untyped wire shape
 * (`VisualStep`) and already-stamped `ChalkStep`s.
 */
export function normalizeSteps(
  raw: ReadonlyArray<VisualStep | ChalkStep>
): ChalkStep[] {
  return raw.map((s) =>
    "kind" in s && s.kind ? s : { ...s, kind: "algorithm" as const }
  );
}
```

- [ ] **Step 2: RED — the widened union must break exactly two consumers**

Run (cwd `client/`): `npx tsc --noEmit`
Expected: **FAIL** with errors in exactly two files:
1. `stageRegistry.tsx` — the `satisfies Record<ChalkStep["kind"], StageEntry>` line names the missing `scene` key (property `scene` is missing). This is the exhaustiveness gate firing; it also proves the union actually widened. (Do not "fix" by loosening `satisfies`.)
2. `VisualExplainer.tsx:59-60` — `ChalkStep["elements"]` / `ChalkStep["stageType"]` no longer resolve, because `SceneStep` has neither field (Ruling 9).

Both are fixed in Steps 6–7 below. Any *other* error at this point is a signal that Step 1's union edit landed differently than pinned — stop and report instead of widening scope.

- [ ] **Step 3: Create `SceneErrorBoundary.tsx`**

```tsx
"use client";

import { Component, type ReactNode } from "react";

/**
 * Render-error boundary for the lazy 3D chunk (spec §5 hardening). A GLB load
 * failure or WebGL exception degrades to an in-stage message while the player
 * chrome (dots, explanation, controls) stays mounted — never a white screen.
 */
export class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="w-full h-full flex items-center justify-center px-6 text-center text-sm text-neutral-400">
          3D scene unavailable — the model failed to load. Playback controls still work.
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Create `SceneInspector.tsx`**

```tsx
"use client";

import type { SceneStep } from "@/lib/visualize";

/**
 * Zone 3 slot for scene steps (spec §3.2): renders `notes[]` with the existing
 * amber line-pill styling plus the step's callout list. Not a fork of CodePanel
 * — a distinct inspector selected by the registry.
 */
export function SceneInspector({ step }: { step: SceneStep }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">
        Scene · {step.sceneId} · {step.shotId}
      </div>

      {step.notes && step.notes.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {step.notes.map((note, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-neutral-200 leading-relaxed">
                {note}
              </span>
            </li>
          ))}
        </ol>
      )}

      {step.callouts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-400">Callouts</span>
          {step.callouts.map((c) => (
            <div
              key={c.anchorId}
              className="text-xs font-mono px-3 py-1.5 rounded-md bg-[#12141c] border border-neutral-800 text-neutral-300"
            >
              <span className="text-amber-300">{c.anchorId}</span> — {c.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create the minimal-but-working `Scene3DStage.tsx`**

This is the plain vertical slice: load the GLB, light it locally, orbit. Camera choreography/glow/pins/hardening land in Tasks 3–5.

```tsx
"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SceneCallout, SceneStep, Vec3 } from "@/lib/visualize";
import { SceneErrorBoundary } from "./SceneErrorBoundary";

const toVec3 = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z);

function Model({ step }: { step: SceneStep }) {
  // draco off, meshopt ON: heart.glb requires EXT_meshopt_compression (Ruling 4).
  const { scene } = useGLTF(step.assetUrl, false, true);
  return <primitive object={scene} />;
}

function CalloutPins({ callouts }: { callouts: SceneCallout[] }) {
  return (
    <>
      {callouts.map((c) => (
        <Html
          key={c.anchorId}
          position={toVec3(c.pos)}
          center
          distanceFactor={6}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="px-2.5 py-1 rounded-md bg-[#0c0d12]/95 border border-amber-500/40 text-amber-200 text-[11px] font-mono font-semibold shadow-lg whitespace-nowrap">
            {c.text}
          </div>
        </Html>
      ))}
    </>
  );
}

export default function Scene3DStage({ step }: { step: SceneStep }) {
  return (
    <div className="w-full h-full flex-1" style={{ minHeight: 420 }}>
      <SceneErrorBoundary>
        <Canvas
          camera={{
            position: step.shot.pos,
            fov: step.shot.fov,
            near: 0.01,
            far: 100,
          }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#0c0d12"]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 4, 5]} intensity={1.4} />
          <directionalLight position={[-4, -2, -3]} intensity={0.5} />
          <Suspense fallback={null}>
            <Model step={step} />
          </Suspense>
          <CalloutPins callouts={step.callouts} />
          <OrbitControls makeDefault enablePan={false} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
```

Keep the imports to exactly what this file uses (no `useEffect`/`useMemo`/`useRef`/`useState` yet — Tasks 3–6 add them). An unused import is an eslint error and would break the exactly-3 gate.

- [ ] **Step 6: Wire the registry — `"scene"` layout + lazy entry, and narrow the algorithm entry**

In `client/src/components/visual/stageRegistry.tsx`:

Add the imports at the top (after the existing `CodePanel` import):

```tsx
import dynamic from "next/dynamic";
import { SceneInspector } from "./scene/SceneInspector";

// Lazy chunk (spec §3.4): three/fiber/drei load ONLY on the first scene step.
const Scene3DStage = dynamic(() => import("./scene/Scene3DStage"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
      Loading 3D scene…
    </div>
  ),
});
```

Change `StageLayout` and `LAYOUT_CLASSES`:

```tsx
export type StageLayout = "split" | "scene";

export const LAYOUT_CLASSES: Record<StageLayout, string> = {
  split: "grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0",
  // Full-bleed single column: stage on top, inspector slot below (spec §3.2).
  scene: "grid grid-cols-1",
};
```

Change `STAGE_REGISTRY` (both entries now narrow on `kind`, because `ChalkStep` is a real union):

```tsx
export const STAGE_REGISTRY = {
  algorithm: {
    layout: "split",
    renderStage: (step) =>
      step.kind === "algorithm"
        ? step.stageType === "tree"
          ? <TreeStage step={step} />
          : <ArrayStage step={step} />
        : null,
    renderInspector: (step) =>
      step.kind === "algorithm" ? (
        <CodePanel lines={step.codeLines} activeLine={step.activeLine} />
      ) : null,
  },
  scene: {
    layout: "scene",
    renderStage: (step) =>
      step.kind === "scene" ? <Scene3DStage step={step} /> : null,
    renderInspector: (step) =>
      step.kind === "scene" ? <SceneInspector step={step} /> : null,
  },
} satisfies Record<ChalkStep["kind"], StageEntry>;
```

- [ ] **Step 7: Make `VisualExplainer` union-safe (banner type + algorithm-only chrome)**

**7a. Re-derive `BannerStep`'s indexed accesses (RED error #2, Ruling 9).** `VisualExplainer.tsx:55-61` currently reads:

```tsx
type BannerStep = {
  title: string;
  subtitle?: string;
  variables?: VisualVariable[];
  elements?: ChalkStep["elements"];
  stageType?: ChalkStep["stageType"];
};
```

Replace the last two lines with the concrete element/stage types (`SceneStep` has neither field, so the indexed access no longer resolves):

```tsx
  elements?: StageElement[];
  stageType?: StageType;
```

and extend the existing `@/lib/visualize` type import to include `StageElement` and `StageType` (both are already exported there). Behavior is unchanged: the banner stays optional-tolerant, and `ProblemBanner` still receives `steps[0]` whatever its kind.

**7b. Narrow the algorithm-only chrome.** After `if (!entry) return null;` insert:

```tsx
// Algorithm-only chrome: narrow once so the DOM for kind:"algorithm" is unchanged.
const calculation = step.kind === "algorithm" ? step.calculation : undefined;
const variables = step.kind === "algorithm" ? step.variables : undefined;
const activeLine = step.kind === "algorithm" ? step.activeLine : undefined;
```

Then replace the three references below with the narrowed locals:
- `{step.calculation && (` → `{calculation && (`
- inside `LiveMathBadge`: `variables={step.variables}` → `variables={variables}`
- `{step.variables && step.variables.length > 0 && (` → `{variables && variables.length > 0 && (`
- `{step.activeLine !== undefined && step.activeLine >= 0 && (` → `{activeLine !== undefined && activeLine >= 0 && (`
- `Line {step.activeLine + 1}` → `Line {activeLine + 1}`

Everything else (`step.title`, `step.subtitle`, `step.explanation`, `step.stepIndex`, `<ProblemBanner step={overview} …>`) already type-checks against the union.

- [ ] **Step 8: GREEN — all gates**

Run (cwd `client/`): `npx tsc --noEmit` → 0 errors.
Run (cwd `client/`): `npx eslint src/components src/lib src/hooks` → exactly 3 errors.
Run (cwd `client/`): `npm run build` → success.
Run (cwd `server/`): `npx tsc --noEmit` → 0 errors (untouched); `npm run scenes:validate` → exit 0, `scenes:validate OK — 1 scene(s), 0 warning(s)`.

- [ ] **Step 9: Add the temporary `scene-check` dev route (makes QA possible before Task 8)**

Create `client/src/app/scene-check/page.tsx`. It renders two self-contained `SceneStep`s (no `SceneDefinition` needed — steps carry their own expanded geometry, Ruling 1), so the meshopt/WebP decode can be verified before the workshop exists. This route is temporary: Task 9 deletes it.

```tsx
// client/src/app/scene-check/page.tsx
// TEMPORARY dev route (Ruling 11): renders scene steps before the Scene Workshop
// exists (Task 8) so the meshopt/WebP decode is verifiable early. Deleted in Task 9.
import { notFound } from "next/navigation";
import { VisualExplainer } from "@/components/visual/VisualExplainer";
import type { SceneStep } from "@/lib/visualize";

const STEPS: SceneStep[] = [
  {
    kind: "scene",
    stepIndex: 0,
    title: "Hearts",
    subtitle: "Overview",
    explanation: "All five hearts in the wide establishing shot.",
    sceneId: "heart",
    shotId: "overview",
    shot: { pos: [0, 0, 4.2], target: [0, 0, 0], fov: 45 },
    assetUrl: "/scenes/heart.glb",
    highlights: [],
    callouts: [],
    notes: ["overview shot"],
  },
  {
    kind: "scene",
    stepIndex: 1,
    title: "Hearts",
    subtitle: "The center heart",
    explanation: "The red heart close up, highlighted and named by a callout pin.",
    sceneId: "heart",
    shotId: "red_closeup",
    shot: { pos: [0, 0.1, 2], target: [0, 0.04, 0], fov: 40 },
    assetUrl: "/scenes/heart.glb",
    highlights: ["heart_red"],
    callouts: [{ anchorId: "a_red", pos: [0, 0.04, 0.24], text: "Center heart" }],
    notes: ["closeup + highlight"],
  },
];

export default function SceneCheckPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="p-6">
      <VisualExplainer steps={STEPS} title="Hearts" />
    </div>
  );
}
```

Then re-run the Task 2 gates (`tsc`, eslint exactly 3, build, server `tsc` + `scenes:validate`) — the new route is part of the build.

- [ ] **Step 10: HUMAN-ONLY — WebGL load check (the assertion Ruling 4 requires)**

*Not blocking for the implementer: record `deferred-to-human` and continue to the commit. The controller runs this before Task 3 starts (Ruling 11).*

With the dev stack up (`docker compose up -d`, then `cd client` and `npm run dev`), open **`/scene-check`** and step through both steps. Confirm:
- The five heart meshes render with their colors and textures (not black/missing).
- Console shows **no** `THREE.GLTFLoader: Unknown extension "EXT_meshopt_compression"` and no texture-decode error.
- Network shows a single `GET /scenes/heart.glb` (36,676 bytes) — no remote host.
- Pressing next glides the camera between the two shots (Task 3's rig may not exist yet at this point; a hard cut is acceptable for this check).

If meshopt fails, apply Ruling 4's fallback **before Task 3**: re-run `gltf-transform optimize … --compress quantize`, update the manifest's `bytes`/`tris`, re-run `scenes:validate`, and update the wiki note.

- [ ] **Step 11: Commit**

```powershell
git add client/src/lib/visualize.ts client/src/components/visual/stageRegistry.tsx client/src/components/visual/VisualExplainer.tsx client/src/components/visual/scene client/src/app/scene-check
git commit -m "feat: add SceneStep union, lazy stage registry entry and renderer skeleton"
```

**Review Focus:** `stageRegistry.tsx` is the only module in the algorithm path that references the scene chunk, and it does so only through `next/dynamic` (Review Focus 1 — grep: no `from "three"` / `@react-three` outside `components/visual/scene/`); the algorithm entry's narrowing emits byte-identical JSX for `kind:"algorithm"`; `useGLTF(assetUrl, false, true)` is written exactly (Review Focus 2); the `satisfies` line survives Step 2's RED.

---

### Task 3: Guided camera (tween + orbit override + reclaim)

**Files:**
- Modify: `client/src/components/visual/scene/Scene3DStage.tsx`

**Interfaces:**
- Consumes: Task 2's `Scene3DStage`, `SceneShot`, `Rig`.
- Produces: `Rig` gains override/reclaim semantics; no interface change.

- [ ] **Step 1: Add the `Rig` component + override/reclaim, and swap the inline controls**

Add these imports to `Scene3DStage.tsx` (extend the existing ones): `useEffect, useMemo, useRef` from `react`; `useFrame` from `@react-three/fiber` (deliberately **not** `useThree` — see Ruling 12); and `SceneShot` to the `@/lib/visualize` type import. Then add this component beside `Model`, and replace the inline `<OrbitControls makeDefault enablePan={false} />` in the default export with `<Rig shot={step.shot} resetKey={step.stepIndex} />`:

```tsx
function Rig({ shot, resetKey }: { shot: SceneShot; resetKey: number }) {
  const goal = useMemo(
    () => ({ pos: toVec3(shot.pos), look: toVec3(shot.target), fov: shot.fov }),
    [shot]
  );
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const override = useRef(false);

  // A new step clears the user's orbit override and reclaims the camera (§5).
  useEffect(() => {
    override.current = false;
  }, [resetKey]);

  useFrame((state, dt) => {
    if (override.current || !controls.current) return;
    const k = Math.min(1, dt * 4); // frame-rate independent-ish ~1.2s settle
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.position.lerp(goal.pos, k);
    controls.current.target.lerp(goal.look, k);
    controls.current.update();
    cam.fov += (goal.fov - cam.fov) * k;
    cam.updateProjectionMatrix();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={0.6}
      maxDistance={12}
      onStart={() => {
        override.current = true;
      }}
    />
  );
}
```

Update the call site to pass the key: `<Rig shot={step.shot} resetKey={step.stepIndex} />`.

- [ ] **Step 2: Import `ComponentRef`**

Add `type ComponentRef` to the `react` import in `Scene3DStage.tsx` so `ComponentRef<typeof OrbitControls>` resolves.

- [ ] **Step 3: Gate**

Run (cwd `client/`): `npx tsc --noEmit` → 0; `npx eslint src/components src/lib src/hooks` → exactly 3; `npm run build` → success.

- [ ] **Step 4: HUMAN-ONLY — camera check** *(not blocking: record `deferred-to-human` and continue)*

Play a multi-step scene (Task 8's demo): (a) each `next` glides the camera over ~1.2s to the new shot; (b) grabbing orbit mid-playback stops the glide; (c) the **next** step tween-back reclaims the camera; (d) `top_down` renders tilted, never a black/NaN frame (Review Focus 3).

- [ ] **Step 5: Commit**

```powershell
git add client/src/components/visual/scene/Scene3DStage.tsx
git commit -m "feat: guided camera tween with orbit override and step reclaim"
```

**Review Focus:** `resetKey` must change per step (`step.stepIndex`) or the override never clears; the tween must use `dt`-scaled `lerp`, not a fixed constant, or the settle time varies with frame rate; the `top_down` shot must stay non-degenerate (Review Focus 3).

---

### Task 4: Highlights (amber glow + pulse) and callout pins (fade per step)

**Files:**
- Modify: `client/src/components/visual/scene/Scene3DStage.tsx`

**Interfaces:**
- Consumes: Task 2's `Model`, `CalloutPins`.
- Produces: highlighted meshes glow/pulse; pins fade in on mount.

- [ ] **Step 1: Replace `Model` with the highlight/pulse version**

```tsx
const GLOW = "#f59e0b"; // amber-500 — the existing glow language

function applyEmissive(mesh: THREE.Object3D, on: boolean, intensity: number) {
  const m = mesh as THREE.Mesh;
  if (!m.isMesh) return;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const mat of mats) {
    const std = mat as THREE.MeshStandardMaterial;
    if (!std.emissive) continue;
    std.emissive.set(on ? GLOW : "#000000");
    std.emissiveIntensity = on ? intensity : 0;
  }
}

function Model({ step }: { step: SceneStep }) {
  const { scene } = useGLTF(step.assetUrl, false, true);
  const highlighted = useMemo(() => new Set(step.highlights), [step.highlights]);

  useEffect(() => {
    scene.traverse((o) => applyEmissive(o, highlighted.has(o.name), 0.55));
  }, [scene, highlighted]);

  useFrame(({ clock }) => {
    if (highlighted.size === 0) return;
    const pulse = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 3);
    scene.traverse((o) => {
      if (highlighted.has(o.name)) applyEmissive(o, true, pulse);
    });
  });

  return <primitive object={scene} />;
}
```

- [ ] **Step 2: Give pins a mount fade (chips styling per spec §5)**

Wrap each pin's inner div with the existing chip language and a 200ms fade:

```tsx
<div className="animate-[fadeIn_200ms_ease-out] px-2.5 py-1 rounded-md bg-[#0c0d12]/95 border border-amber-500/40 text-amber-200 text-[11px] font-mono font-semibold shadow-lg whitespace-nowrap">
```

Add the keyframes once to `client/src/app/globals.css` (Tailwind v4 `@theme`/plain CSS), if not already present:

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 3: Gate**

Run (cwd `client/`): `npx tsc --noEmit` → 0; `npx eslint src/components src/lib src/hooks` → exactly 3; `npm run build` → success.

- [ ] **Step 4: HUMAN-ONLY — glow/pin check** *(not blocking: record `deferred-to-human` and continue; needs `/scene-check`)*

Confirm highlighted parts glow amber and pulse gently; non-highlighted parts return to normal on the next step; callout pins sit in front of the surface at the anchor, do not intercept pointer events, and re-fade on each step change.

- [ ] **Step 5: Commit**

```powershell
git add client/src/components/visual/scene/Scene3DStage.tsx client/src/app/globals.css
git commit -m "feat: amber highlight glow and fading callout pins for scene steps"
```

**Review Focus:** highlight matching is by **node name** (`o.name` === part ID) — the same names `scenes:validate` asserts against the GLB; emissive state must be fully reset for non-highlighted meshes (no glow bleed between steps); pins must be `pointerEvents: none` so orbit still works.

---

### Task 5: Hardening — error boundary wiring, context loss, visibility pause, dispose

**Files:**
- Modify: `client/src/components/visual/scene/Scene3DStage.tsx`

**Interfaces:**
- Consumes: Task 2's `SceneErrorBoundary`, Canvas.
- Produces: idempotent lifecycle; `useGLTF.clear` on unmount; `frameloop` follows tab visibility.

- [ ] **Step 1: Add the visibility hook + dispose + context-loss handling**

Add `useState` to the `react` import in `Scene3DStage.tsx` (Tasks 2–4 did not need it). Then add:

```tsx
/**
 * Tab-visibility state for the `frameloop` switch (spec §5 "pauses when
 * paused/tab hidden"). Initialized lazily with a `typeof document` guard so the
 * effect body only *subscribes* — calling `setState` synchronously inside an
 * effect is precisely what trips `react-hooks/set-state-in-effect`, which is
 * 2 of the 3 pre-existing eslint baseline errors this plan must not grow
 * (Ruling 10).
 */
function useDocumentVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
```

In the default export, replace the render with:

```tsx
export default function Scene3DStage({ step }: { step: SceneStep }) {
  const visible = useDocumentVisible();

  // Full GPU dispose pass on session unmount (spec §5): drop the cached GLB so
  // geometries/materials/textures are released when the player leaves.
  useEffect(() => {
    return () => {
      useGLTF.clear(step.assetUrl);
    };
  }, [step.assetUrl]);

  return (
    <div className="w-full h-full flex-1" style={{ minHeight: 420 }}>
      <SceneErrorBoundary>
        <Canvas
          camera={{
            position: step.shot.pos,
            fov: step.shot.fov,
            near: 0.01,
            far: 100,
          }}
          frameloop={visible ? "always" : "demand"}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) =>
              e.preventDefault()
            );
          }}
        >
          <color attach="background" args={["#0c0d12"]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 4, 5]} intensity={1.4} />
          <directionalLight position={[-4, -2, -3]} intensity={0.5} />
          <Suspense fallback={null}>
            <Model step={step} />
          </Suspense>
          <CalloutPins callouts={step.callouts} />
          <Rig shot={step.shot} resetKey={step.stepIndex} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
```

The disposed-cache effect keys on `step.assetUrl` only (stable across steps) so switching steps never thrashes the GLTF cache.

- [ ] **Step 2: Gate**

Run (cwd `client/`): `npx tsc --noEmit` → 0; `npx eslint src/components src/lib src/hooks` → exactly 3; `npm run build` → success.

- [ ] **Step 3: HUMAN-ONLY — hardening checks (spec §7 items 2–3)** *(not blocking: record `deferred-to-human` and continue; needs `/scene-check`)*

(a) Rename `client/public/scenes/heart.glb` temporarily → scene shows the fallback message, controls/dots/explanation stay alive, no white screen; restore the file. (b) Switch between sessions repeatedly and watch GPU memory in Task Manager — it must plateau, not climb. (c) Hide the tab → rAF work stops; return → it resumes.

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/visual/scene/Scene3DStage.tsx
git commit -m "feat: harden the 3D stage with boundary, context-loss and dispose"
```

**Review Focus:** the dispose effect's cleanup must not run on every step change (dependency is `assetUrl`, stable across steps) or it thrashes the cache; `frameloop` must be driven by real visibility state, not a constant (Review Focus 5).

---

### Task 6: Adaptive post-FX (bloom behind a frame-time guard)

**Files:**
- Modify: `client/src/components/visual/scene/Scene3DStage.tsx`

**Interfaces:**
- Consumes: Task 5's Canvas.
- Produces: a `QualityGuard` that drops bloom when average frame time spikes; `PostFx` renders the composer only when enabled.

- [ ] **Step 1: Add the guard + composer**

```tsx
import { Bloom, EffectComposer } from "@react-three/postprocessing";

const FRAME_BUDGET_MS = 1000 / 30; // above ~30ms avg → drop post-FX (spec §5)

function QualityGuard({ onSample }: { onSample: (ms: number) => void }) {
  useFrame((_, dt) => onSample(dt * 1000));
  return null;
}

function PostFx({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <EffectComposer>
      <Bloom intensity={0.6} luminanceThreshold={0.2} mipmapBlur />
    </EffectComposer>
  );
}
```

In the default export, add the state + sampler and render them inside `<Canvas>` (after `<Rig …/>`):

```tsx
const [bloomOn, setBloomOn] = useState(true);
const avgFrame = useRef(16);
const sampleFrame = (ms: number) => {
  avgFrame.current = avgFrame.current * 0.9 + ms * 0.1;
  if (bloomOn && avgFrame.current > FRAME_BUDGET_MS) setBloomOn(false);
};
// …
<QualityGuard onSample={sampleFrame} />
<PostFx enabled={bloomOn} />
```

- [ ] **Step 2: Gate**

Run (cwd `client/`): `npx tsc --noEmit` → 0; `npx eslint src/components src/lib src/hooks` → exactly 3; `npm run build` → success.

- [ ] **Step 3: HUMAN-ONLY — perf check (spec §7 item 8)** *(not blocking: record `deferred-to-human` and continue; needs `/scene-check`)*

Throttle the CPU (DevTools ×6) or background-load the tab; confirm bloom disables and the scene keeps rendering. If the guard cannot be observed reliably, record a ruling to ship bloom-on-by-default and park the adaptive drop for Plan 5's QA pass (Ruling 5).

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/visual/scene/Scene3DStage.tsx
git commit -m "feat: adaptive bloom post-processing with a frame-time guard"
```

**Review Focus:** the guard must disable the whole `<EffectComposer>` (not just dim it) when the average exceeds budget; it must not oscillate every frame (one-way latch is fine for this slice); bloom must not be enabled for the algorithm path (it lives only in the lazy chunk).

---

### Task 7: Curated `SceneDefinition` emission + definition-drift gate

**Files:**
- Create: `server/src/scenes/definition.ts`
- Create: `server/src/scenes/tools/emit-definition.ts`
- Create (generated): `client/src/lib/sceneDefinitions/heart.json`
- Create: `client/src/lib/sceneDefinition.ts`
- Modify: `server/src/scenes/validate.ts`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `SCENES` / `SceneManifest` (server), the standing `scenes:validate` gate.
- Produces (relied on by Task 8):
  - server `buildSceneDefinition(m: SceneManifest): SceneDefinition | null`
  - script `npm run scenes:definition` writing `client/src/lib/sceneDefinitions/<id>.json`
  - `validate.ts` fails with `scene "<id>": definition drift — regenerate with npm run scenes:definition` when the file is stale
  - client `SceneDefinition`, `SCENE_DEFINITIONS: Record<string, SceneDefinition>`

- [ ] **Step 1: Write the pure projection**

```ts
// server/src/scenes/definition.ts
// Curated, render-only projection of a scene for the client (spec §4.2 boundary,
// Ruling 1). Deliberately excludes keywords (routing lexicon), license (legal),
// status (routing), and asset bytes/tris — none of those may reach the client,
// and SCENES itself is never serialized.
import type { SceneManifest, Vec3 } from "./types";

export interface SceneDefinition {
  id: string;
  assetUrl: string;
  parts: { id: string; label: string }[];
  anchors: { id: string; partId: string; pos: Vec3 }[];
  shots: { id: string; label: string; pos: Vec3; target: Vec3; fov: number }[];
}

export function buildSceneDefinition(m: SceneManifest): SceneDefinition | null {
  if (m.asset.kind !== "mesh") return null; // procedural is a later plan
  return {
    id: m.id,
    assetUrl: m.asset.url,
    parts: m.parts.map((p) => ({ id: p.id, label: p.label })),
    anchors: m.anchors.map((a) => ({ id: a.id, partId: a.partId, pos: a.pos })),
    shots: m.shots.map((s) => ({
      id: s.id,
      label: s.label,
      pos: s.pos,
      target: s.target,
      fov: s.fov,
    })),
  };
}

/** Canonical serialization — the emit script and the drift check must agree. */
export function serializeDefinition(m: SceneManifest): string | null {
  const def = buildSceneDefinition(m);
  return def === null ? null : `${JSON.stringify(def, null, 2)}\n`;
}
```

- [ ] **Step 2: Write the CLI**

```ts
// server/src/scenes/tools/emit-definition.ts
// Usage (cwd server/): npm run scenes:definition
// Writes the curated client projection for every live mesh scene.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCENES } from "../catalog";
import { serializeDefinition } from "../definition";

const OUT_DIR = resolve(__dirname, "../../../../client/src/lib/sceneDefinitions");

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const written: string[] = [];
  for (const [id, m] of Object.entries(SCENES)) {
    if (m.status !== "live") continue;
    const json = serializeDefinition(m);
    if (json === null) continue;
    writeFileSync(resolve(OUT_DIR, `${id}.json`), json);
    written.push(id);
  }
  console.log(
    `scenes:definition wrote ${written.length} file(s): ${written.join(", ")}`
  );
}

main();
```

- [ ] **Step 3: Add the script and run it**

In `server/package.json` `"scripts"`, add:

```json
"scenes:definition": "tsx src/scenes/tools/emit-definition.ts"
```

Run (cwd `server/`): `npm run scenes:definition`
Expected: exit 0, stdout `scenes:definition wrote 1 file(s): heart`; `client/src/lib/sceneDefinitions/heart.json` created with the 5 parts, 5 anchors, 3 shots.

- [ ] **Step 4: Add the drift check to `validate.ts`**

Add the import:

```ts
import { serializeDefinition } from "./definition";
```

Add this helper beside `checkMeshAsset`:

```ts
function checkDefinition(id: string, m: SceneManifest): void {
  if (m.status !== "live" || m.asset.kind !== "mesh") return;
  const expected = serializeDefinition(m);
  if (expected === null) return;
  // Same relative hop as PUBLIC_DIR: server/src/scenes -> repo root -> client/.
  const file = resolve(__dirname, "../../../client/src/lib/sceneDefinitions", `${id}.json`);
  if (!existsSync(file)) {
    fail(`scene "${id}": missing definition — run npm run scenes:definition`);
    return;
  }
  if (readFileSync(file, "utf8") !== expected) {
    fail(`scene "${id}": definition drift — regenerate with npm run scenes:definition`);
  }
}
```

Call it from `checkScene`, immediately after `checkMeshAsset(id, m);`:

```ts
checkDefinition(id, m);
```

- [ ] **Step 5: GREEN + RED drill — drift must fail the gate**

Run (cwd `server/`): `npm run scenes:validate` → exit 0, `scenes:validate OK — 1 scene(s), 0 warning(s)`.
RED: edit `server/src/scenes/catalog.ts`, change part label `"Red heart (center)"` → `"Red heart"`.
Run: `npm run scenes:validate` → **exit 1**, stderr names `scene "heart": definition drift — regenerate with npm run scenes:definition`.
Restore: `git checkout -- server/src/scenes/catalog.ts`.
Confirm clean: `npm run scenes:validate` → exit 0.

- [ ] **Step 6: Write the client type + map**

```ts
// client/src/lib/sceneDefinition.ts
import type { Vec3 } from "@/lib/visualize";
import heartJson from "./sceneDefinitions/heart.json";

/**
 * Curated render-only scene projection (Ruling 1). This is the ONLY
 * catalog-derived data that crosses to the client; it is generated from the
 * server catalog by `npm run scenes:definition` and must never be edited by
 * hand. It intentionally carries no keywords/license/status/bytes/tris.
 * Dev-only consumers (the Scene Workshop) use it; routed scene steps are
 * self-contained and need no definition (spec §4.2).
 */
export interface SceneDefinition {
  id: string;
  assetUrl: string;
  parts: { id: string; label: string }[];
  anchors: { id: string; partId: string; pos: Vec3 }[];
  shots: { id: string; label: string; pos: Vec3; target: Vec3; fov: number }[];
}

// JSON imports widen tuples to number[]; the generated file is validated
// against the projection server-side, so one cast at the boundary is enough.
export const SCENE_DEFINITIONS: Record<string, SceneDefinition> = {
  heart: heartJson as unknown as SceneDefinition,
};
```

- [ ] **Step 7: Assert no server-catalog import reaches the client**

Run (cwd repo root), PowerShell:
```powershell
Get-ChildItem client\src -Recurse -Include *.ts,*.tsx | Select-String -Pattern 'server/src/scenes|scenes/catalog|SCENES'
```
Expected: **no output** — no client module references the server catalog.

```powershell
Get-ChildItem client\src -Recurse -Include *.ts,*.tsx | Select-String -Pattern 'from "three"|@react-three' | Where-Object { $_.Path -notlike "*components\visual\scene\*" }
```
Expected: **no output** — `three`/drei/fiber are imported only inside the lazy scene directory (Review Focus 1/4). The only permitted reference outside it is `stageRegistry.tsx`'s `next/dynamic(() => import("./scene/Scene3DStage"))`, which matches neither pattern.

- [ ] **Step 8: Gate**

Run (cwd `client/`): `npx tsc --noEmit` → 0; `npm run build` → success; `npx eslint src/components src/lib src/hooks` → exactly 3.
Run (cwd `server/`): `npx tsc --noEmit` → 0; `npm run scenes:validate` → exit 0.

- [ ] **Step 9: Commit**

```powershell
git add server/src/scenes/definition.ts server/src/scenes/tools/emit-definition.ts server/src/scenes/validate.ts server/package.json client/src/lib/sceneDefinition.ts client/src/lib/sceneDefinitions
git commit -m "feat: emit curated scene definitions and gate definition drift"
```

**Review Focus:** the projection must exclude keywords/license/status/bytes/tris (Review Focus 4); the emit and check must share `serializeDefinition` so the two can never disagree; `validate.ts` must not import the CLI (whose `main()` writes files on import) — only the pure module.

---

### Task 8: Scene Workshop (dev-only) + hand-sequenced heart demo

**Files:**
- Create: `client/src/components/visual/scene/SceneWorkshop.tsx`
- Create: `client/src/app/workshop/page.tsx`
- Create: `client/src/lib/sceneFixtures/heartSequence.ts`
- Modify: `client/src/components/visual/scene/Scene3DStage.tsx` (enable the `authoring` prop declared in Task 2)

**Interfaces:**
- Consumes: `SceneDefinition`/`SCENE_DEFINITIONS` (Task 7), `SceneStep` (Task 2), `Scene3DStage` + `SceneAuthoring` (Task 2), `VisualExplainer` (Plan 1).
- Produces: `/workshop` dev route; `HEART_SEQUENCE: SceneStep[]` (the committed hand-sequenced vertical slice).

- [ ] **Step 1: Enforce the export validity envelope in the workshop**

Add to `Scene3DStage.tsx` (module-level, exported so the workshop imports it):

```ts
/** Mirrors the scenes:validate pose envelope — the workshop warns on violations. */
export function shotWithinEnvelope(s: SceneShot): boolean {
  const coords = [...s.pos, ...s.target];
  if (!coords.every((v) => Number.isFinite(v) && Math.abs(v) <= 100)) return false;
  if (!(s.fov >= 15 && s.fov <= 120)) return false;
  const d = Math.hypot(s.pos[0] - s.target[0], s.pos[1] - s.target[1], s.pos[2] - s.target[2]);
  return d >= 0.1;
}
```

- [ ] **Step 2: Write the committed hand-sequenced demo**

```ts
// client/src/lib/sceneFixtures/heartSequence.ts
// The first hand-sequenced scene plan (spec §8 rollout step 2): authored via the
// Scene Workshop, committed here so the renderer has a real multi-step plan
// before the Plan-4 router exists. Poses resolve from the generated definition.
import { SCENE_DEFINITIONS } from "@/lib/sceneDefinition";
import type { SceneCallout, SceneShot, SceneStep, Vec3 } from "@/lib/visualize";

const heart = SCENE_DEFINITIONS.heart;

function pickShot(id: string): SceneShot {
  const s = heart.shots.find((x) => x.id === id);
  if (!s) throw new Error(`heartSequence: unknown shot "${id}"`);
  return { pos: s.pos, target: s.target, fov: s.fov };
}

function pickCallout(anchorId: string, text: string): SceneCallout {
  const a = heart.anchors.find((x) => x.id === anchorId);
  if (!a) throw new Error(`heartSequence: unknown anchor "${anchorId}"`);
  return { anchorId: a.id, pos: a.pos as Vec3, text };
}

export const HEART_SEQUENCE: SceneStep[] = [
  {
    kind: "scene",
    stepIndex: 0,
    title: "Hearts",
    subtitle: "Five hearts, one composition",
    explanation:
      "We are looking at a cluster of five hearts. Each one is a separate part of the model, and later steps will point the camera at individual pieces.",
    sceneId: heart.id,
    shotId: "overview",
    shot: pickShot("overview"),
    assetUrl: heart.assetUrl,
    highlights: [],
    callouts: [],
    notes: ["Wide establishing shot", "All five parts are in frame"],
  },
  {
    kind: "scene",
    stepIndex: 1,
    title: "Hearts",
    subtitle: "The center heart",
    explanation:
      "The red heart sits at the center of the composition. A closeup shot brings it forward and the highlight glow marks it.",
    sceneId: heart.id,
    shotId: "red_closeup",
    shot: pickShot("red_closeup"),
    assetUrl: heart.assetUrl,
    highlights: ["heart_red"],
    callouts: [pickCallout("a_red", "Center heart")],
    notes: ["Camera moves in on the center part", "Emissive glow marks the active part"],
  },
  {
    kind: "scene",
    stepIndex: 2,
    title: "Hearts",
    subtitle: "Top-right and top-left",
    explanation:
      "Two hearts sit above the center. The top-down shot lays the whole arrangement out flat so their relative positions are clear.",
    sceneId: heart.id,
    shotId: "top_down",
    shot: pickShot("top_down"),
    assetUrl: heart.assetUrl,
    highlights: ["heart_pink", "heart_purple"],
    callouts: [pickCallout("a_pink", "Top-right"), pickCallout("a_purple", "Top-left")],
    notes: ["Tilted top-down view (never straight down)", "Two highlights, two callouts"],
  },
  {
    kind: "scene",
    stepIndex: 3,
    title: "Hearts",
    subtitle: "The bottom pair",
    explanation:
      "The green and blue hearts close the ring at the bottom. With every part named, the composition is complete.",
    sceneId: heart.id,
    shotId: "overview",
    shot: pickShot("overview"),
    assetUrl: heart.assetUrl,
    highlights: ["heart_green", "heart_blue"],
    callouts: [pickCallout("a_green", "Bottom-left"), pickCallout("a_blue", "Bottom-right")],
    notes: ["Return to the wide shot", "Remaining parts highlighted and named"],
  },
];
```

- [ ] **Step 3: Write the Workshop component**

```tsx
"use client";

import { useCallback, useState } from "react";
import type { SceneDefinition } from "@/lib/sceneDefinition";
import type { SceneCallout, SceneShot, SceneStep } from "@/lib/visualize";
import Scene3DStage, { shotWithinEnvelope, type SceneAuthoring } from "./Scene3DStage";
import { VisualExplainer } from "../VisualExplainer";

interface DraftStep {
  shotId: string;
  title: string;
  subtitle: string;
  explanation: string;
  highlights: string[];
  calloutAnchorIds: string[];
}

const EMPTY_DRAFT: DraftStep = {
  shotId: "",
  title: "Hearts",
  subtitle: "",
  explanation: "",
  highlights: [],
  calloutAnchorIds: [],
};

export function SceneWorkshop({ definition }: { definition: SceneDefinition }) {
  const [previewing, setPreviewing] = useState(false);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [capturedShots, setCapturedShots] = useState<SceneShot[]>([]);
  const [capturedAnchors, setCapturedAnchors] = useState<
    { id: string; partId: string; pos: [number, number, number] }[]
  >([]);
  const [draft, setDraft] = useState<DraftStep>(EMPTY_DRAFT);
  const [steps, setSteps] = useState<SceneStep[]>([]);
  const [lastPoint, setLastPoint] = useState<[number, number, number]>([0, 0, 0]);

  const authoring: SceneAuthoring = {
    selectedPart,
    onPickPart: (partId, point) => {
      setSelectedPart(partId);
      setLastPoint(point);
    },
    onCaptureShot: (shot) => {
      if (!shotWithinEnvelope(shot)) {
        window.alert("Shot is outside the validate envelope (|coord|<=100, fov 15-120, distance>=0.1).");
        return;
      }
      setCapturedShots((prev) => [...prev, shot]);
    },
  };

  const dropAnchor = useCallback(
    (point: [number, number, number]) => {
      if (!selectedPart) {
        window.alert("Pick a part first, then drop its anchor.");
        return;
      }
      const n = capturedAnchors.length + 1;
      setCapturedAnchors((prev) => [
        ...prev,
        { id: `a_new_${n}`, partId: selectedPart, pos: point },
      ]);
    },
    [selectedPart, capturedAnchors.length]
  );

  const addStep = () => {
    const shot = definition.shots.find((s) => s.id === draft.shotId);
    if (!shot) {
      window.alert("Choose a shot for this step.");
      return;
    }
    const callouts: SceneCallout[] = draft.calloutAnchorIds
      .map((id) => definition.anchors.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => a !== undefined)
      .map((a) => ({
        anchorId: a.id,
        pos: a.pos,
        text: definition.parts.find((p) => p.id === a.partId)?.label ?? a.id,
      }));
    setSteps((prev) => [
      ...prev,
      {
        kind: "scene",
        stepIndex: prev.length,
        title: draft.title,
        subtitle: draft.subtitle || undefined,
        explanation: draft.explanation,
        sceneId: definition.id,
        shotId: shot.id,
        shot: { pos: shot.pos, target: shot.target, fov: shot.fov },
        assetUrl: definition.assetUrl,
        highlights: draft.highlights,
        callouts,
        notes: [],
      },
    ]);
    setDraft(EMPTY_DRAFT);
  };

  const exportJson = JSON.stringify(
    { shots: capturedShots, anchors: capturedAnchors, sequence: steps },
    null,
    2
  );

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  if (previewing && steps.length > 0) {
    return (
      <div className="p-6">
        <button
          className="mb-4 text-sm text-amber-300 underline"
          onClick={() => setPreviewing(false)}
        >
          ← back to authoring
        </button>
        <VisualExplainer steps={steps} title="Hearts" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 p-4 h-screen">
      <div className="border border-neutral-800 rounded-xl overflow-hidden">
        <Scene3DStage
          step={{
            kind: "scene",
            stepIndex: 0,
            title: "Workshop",
            explanation: "",
            sceneId: definition.id,
            shotId: definition.shots[0].id,
            shot: {
              pos: definition.shots[0].pos,
              target: definition.shots[0].target,
              fov: definition.shots[0].fov,
            },
            assetUrl: definition.assetUrl,
            highlights: selectedPart ? [selectedPart] : [],
            callouts: [],
          }}
          authoring={authoring}
        />
      </div>
      <aside className="border border-neutral-800 rounded-xl p-4 flex flex-col gap-4 overflow-y-auto text-sm">
        <div>
          <div className="text-xs font-semibold text-neutral-400 mb-2">
            Parts (click the model, or pick here)
          </div>
          <div className="flex flex-wrap gap-2">
            {definition.parts.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPart(p.id)}
                className={`px-2 py-1 rounded-md text-xs font-mono border ${
                  selectedPart === p.id
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-[#12141c] text-neutral-300 border-neutral-800"
                }`}
              >
                {p.id}
              </button>
            ))}
          </div>
          <button
            className="mt-2 text-xs text-amber-300 underline"
            onClick={() => dropAnchor(lastPoint)}
          >
            Drop anchor for selected part
          </button>
          <div className="text-[11px] text-neutral-500 mt-1">
            Press <span className="font-mono text-amber-300">s</span> in the scene to capture the current camera as a shot.
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-neutral-400">Draft step</div>
          <select
            className="bg-[#12141c] border border-neutral-800 rounded-md px-2 py-1 text-xs"
            value={draft.shotId}
            onChange={(e) => setDraft({ ...draft, shotId: e.target.value })}
          >
            <option value="">Choose shot…</option>
            {definition.shots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            className="bg-[#12141c] border border-neutral-800 rounded-md px-2 py-1 text-xs"
            placeholder="subtitle"
            value={draft.subtitle}
            onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
          />
          <textarea
            className="bg-[#12141c] border border-neutral-800 rounded-md px-2 py-1 text-xs"
            rows={3}
            placeholder="explanation"
            value={draft.explanation}
            onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
          />
          <div className="text-xs font-semibold text-neutral-400">Highlights</div>
          <div className="flex flex-wrap gap-1">
            {definition.parts.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  setDraft({ ...draft, highlights: toggle(draft.highlights, p.id) })
                }
                className={`px-2 py-1 rounded-md text-[11px] font-mono border ${
                  draft.highlights.includes(p.id)
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-[#12141c] text-neutral-400 border-neutral-800"
                }`}
              >
                {p.id}
              </button>
            ))}
          </div>
          <div className="text-xs font-semibold text-neutral-400">Callouts</div>
          <div className="flex flex-wrap gap-1">
            {definition.anchors.map((a) => (
              <button
                key={a.id}
                onClick={() =>
                  setDraft({
                    ...draft,
                    calloutAnchorIds: toggle(draft.calloutAnchorIds, a.id),
                  })
                }
                className={`px-2 py-1 rounded-md text-[11px] font-mono border ${
                  draft.calloutAnchorIds.includes(a.id)
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-[#12141c] text-neutral-400 border-neutral-800"
                }`}
              >
                {a.id}
              </button>
            ))}
          </div>
          <button
            className="px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold"
            onClick={addStep}
          >
            Add step
          </button>
        </div>

        <div className="text-xs text-neutral-400">
          Captured: {capturedShots.length} shot(s), {capturedAnchors.length} anchor(s) · {steps.length} step(s)
        </div>
        <button
          className="px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-xs font-semibold"
          disabled={steps.length === 0}
          onClick={() => setPreviewing(true)}
        >
          Play sequence
        </button>
        <div className="text-xs font-semibold text-neutral-400">
          Export (paste into catalog.ts / heartSequence.ts)
        </div>
        <textarea
          readOnly
          className="bg-[#0c0d12] border border-neutral-800 rounded-md p-2 text-[11px] font-mono h-48"
          value={exportJson}
        />
      </aside>
    </div>
  );
}
```

The panel uses only the existing dark-chip classes — no new visual system.

- [ ] **Step 4: Enable the authoring prop in `Scene3DStage`**

Change the default export signature to accept and forward it:

```tsx
export default function Scene3DStage({
  step,
  authoring,
}: {
  step: SceneStep;
  authoring?: SceneAuthoring;
}) { /* … */ }
```

Add the `SceneAuthoring` interface plus the import it needs to `Scene3DStage.tsx`:

```tsx
import type { ThreeEvent } from "@react-three/fiber";

export interface SceneAuthoring {
  selectedPart: string | null;
  onPickPart: (partId: string | null, point: Vec3) => void;
  onCaptureShot: (shot: SceneShot) => void;
}
```

Inside `<Canvas>`, pass it to the model: `<Model step={step} authoring={authoring} />`. Change `Model` to accept it **on top of Task 4's highlight/pulse body** (do not overwrite that logic):

```tsx
function Model({ step, authoring }: { step: SceneStep; authoring?: SceneAuthoring }) {
  const { scene } = useGLTF(step.assetUrl, false, true);
  const highlighted = useMemo(
    () =>
      authoring?.selectedPart
        ? new Set([...step.highlights, authoring.selectedPart])
        : new Set(step.highlights),
    [step.highlights, authoring?.selectedPart]
  );
  useEffect(() => {
    scene.traverse((o) => applyEmissive(o, highlighted.has(o.name), 0.55));
  }, [scene, highlighted]);
  useFrame(({ clock }) => {
    if (highlighted.size === 0) return;
    const pulse = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 3);
    scene.traverse((o) => {
      if (highlighted.has(o.name)) applyEmissive(o, true, pulse);
    });
  });
  const onPick = authoring
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        authoring.onPickPart(e.object.name || null, [e.point.x, e.point.y, e.point.z]);
      }
    : undefined;
  return <primitive object={scene} onClick={onPick} />;
}
```

and a capture probe inside `<Canvas>`:

```tsx
function CaptureProbe({ onCapture }: { onCapture: (s: SceneShot) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3 }
    | null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "s") return;
      const t = controls?.target ?? new THREE.Vector3();
      const cam = camera as THREE.PerspectiveCamera;
      onCapture({
        pos: [camera.position.x, camera.position.y, camera.position.z],
        target: [t.x, t.y, t.z],
        fov: cam.fov,
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, controls, onCapture]);
  return null;
}
```

Render it only when authoring: `{authoring && <CaptureProbe onCapture={authoring.onCaptureShot} />}`.

- [ ] **Step 5: Write the dev-only route**

```tsx
// client/src/app/workshop/page.tsx
import { notFound } from "next/navigation";
import { SCENE_DEFINITIONS } from "@/lib/sceneDefinition";
import { SceneWorkshop } from "@/components/visual/scene/SceneWorkshop";

// Dev-only authoring tool (spec §4.5). Not reachable in production builds.
export default function WorkshopPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SceneWorkshop definition={SCENE_DEFINITIONS.heart} />;
}
```

- [ ] **Step 6: Gate + HUMAN-ONLY workshop check** *(the gate is blocking; the workshop check is not — record `deferred-to-human`)*

Run (cwd `client/`): `npx tsc --noEmit` → 0; `npm run build` → success; `npx eslint src/components src/lib src/hooks` → exactly 3.
Human: with the dev server up, open `/workshop`; orbit the heart, click a part (it highlights), press `s` to capture a pose, drop an anchor, compose a step, "Play sequence", and confirm the export textarea shows manifest-ready `shots`/`anchors` JSON plus the `SceneStep[]`. Confirm a production build 404s `/workshop`.

- [ ] **Step 7: Commit**

```powershell
git add client/src/components/visual/scene/SceneWorkshop.tsx client/src/components/visual/scene/Scene3DStage.tsx client/src/lib/sceneFixtures/heartSequence.ts client/src/app/workshop/page.tsx
git commit -m "feat: add dev-only scene workshop and hand-sequenced heart demo"
```

**Review Focus:** every pose the workshop emits must pass `shotWithinEnvelope` (Review Focus 3); the workshop must import only `SceneDefinition`, never the server catalog (Review Focus 4); `HEART_SEQUENCE` must only reference shots/anchors that exist in the generated definition (fails loudly otherwise); `/workshop` must 404 in production.

---

### Task 9: Full gate, manual QA, wiki, definition ↔ sequence consistency

**Files:**
- Modify: `docs/wiki/components.md`, `docs/wiki/architecture.md`, `docs/wiki/index.md`


**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: wiki documentation of the union extension, renderer, workshop, and boundary; the standing instruction that definition generation is part of every catalog edit.

- [ ] **Step 1: Confirm demo-sequence consistency by construction (record the ruling)**

**Ruling R1 (demo id consistency):** the demo fixture's poses and callout coordinates come from the generated definition at import time, and its shot/anchor lookups (`pickShot`/`pickCallout` in Task 8) **throw** on an unknown id. That is a real runtime guard with no server change. `scenes:validate`'s definition-drift check (Task 7) already fails the gate when the catalog changes without regeneration, which is the failure mode that would break these ids. **Do not add a server-side string-match assertion over `heartSequence.ts`** — a check that cannot fail meaningfully is worse than no check. Instead:

- RED drill (proves the construction catches a rename): temporarily rename shot `overview` → `overview2` in `server/src/scenes/catalog.ts`. Run `npm run scenes:validate` → **exit 1**, naming `scene "heart": definition drift — regenerate with npm run scenes:definition`. Restore: `git checkout -- server/src/scenes/catalog.ts`. This proves a renamed id cannot silently reach the demo (the regenerated definition would drop it, and `pickShot` would throw at import).
- Record in the commit body that the demo's id references are covered by `tsc` + the generated definition + the fixture's throwing lookups, not by a gate string match.

If a later review insists on a gate-level check, the correct shape is to make the demo read ids from the *generated JSON* (already the case for poses) and expose its referenced ids as data a test can read — not to grep TypeScript source. Note that as a Plan-5 candidate.

- [ ] **Step 2: Run the full standing gate**

```powershell
# cwd: server\
npx tsc --noEmit                      # expect: no output, $LASTEXITCODE 0
npm run scenes:validate               # expect: "scenes:validate OK — 1 scene(s), 0 warning(s)", exit 0

# cwd: client\
npx tsc --noEmit                      # expect: no output, $LASTEXITCODE 0
npm run build                         # expect: success, $LASTEXITCODE 0
npx eslint src/components src/lib src/hooks   # expect: "3 problems (3 errors, 0 warnings)"
```

- [ ] **Step 3: HUMAN-ONLY — manual QA (browser bridge needed; controller/human runs)**

*Not blocking for the implementer: record `deferred-to-human` with the checklist below and continue to the wiki steps.*

Run through spec §7's checklist for the parts Plan 3 owns: item 1 (orbit handoff/reclaim — Task 3), item 2 (no GPU creep across session switches — Task 5), item 3 (missing GLB → fallback, controls alive — Task 5; use `/scene-check` **before** deleting it in Step 6b), item 6 (9:16, fullscreen, scrubber, keyboard arrows/space over a scene), item 7 (**DSA presets unchanged AND the DSA bundle contains no three/fiber code** — Review Focus 1), item 8 (frame-time guard drops bloom — Task 6). Record each result in the task report.

- [ ] **Step 4: Update `docs/wiki/components.md`**

Add to the `visual/` suite: a `Scene3DStage` section (lazy chunk under `components/visual/scene/`; `useGLTF(url, false, true)` meshopt contract; guided-camera override/reclaim; amber highlight glow; callout pins; dispose + visibility pause; adaptive bloom), a `SceneInspector` entry, a `SceneWorkshop` entry (dev-only `/workshop`, copy-out authoring), and update the `stageRegistry.tsx` bullet (new `scene` layout + entry, `"split" | "scene"`), the `visualize.ts` bullet (`SceneStep`, `SceneShot`, `SceneCallout`, `Vec3`; widened `normalizeSteps` accepting both wire and stamped steps), and the `ChatWorkspace` step-cache bullet (union now has two members; cache stays steps-only).

- [ ] **Step 5: Update `docs/wiki/architecture.md`**

Extend the existing "Scene Catalog & Asset Pipeline" section with: the definition boundary (Ruling 1) — curated `SceneDefinition` generated by `npm run scenes:definition`, drift-checked by `scenes:validate`, consumed only by the dev workshop; self-contained scene steps (§4.2); the lazy scene chunk and the DSA-bundle guarantee (§3.4); WebP/meshopt confirmation (Ruling 4); and the workshop's copy-out authoring (Ruling 2). Update the high-level flow diagram's player line to mention `STAGE_REGISTRY[step.kind]` dispatch for both kinds.

- [ ] **Step 6: Update `docs/wiki/index.md`**

Add `client/src/lib/sceneDefinitions/` (generated curated scene projections) and `client/src/app/workshop/` (dev-only) to the repository tree with aligned box-drawing; add `scenes:definition` to any script list.

- [ ] **Step 6b: Remove the temporary `scene-check` route (its job is done — the workshop is the permanent tool)**

```powershell
git rm -r client/src/app/scene-check
git commit -m "chore: remove temporary scene-check dev route"
```
Only do this **after** the HUMAN-ONLY QA in Step 3 has been run (item 3 uses `/scene-check`); if QA is still pending, leave the route in place and note that in the report.

- [ ] **Step 7: Re-run the gate after edits + commit**

```powershell
# cwd: server\
npm run scenes:validate               # expect: exit 0
# cwd: client\
npx tsc --noEmit                      # expect: exit 0
# cwd: repo root\
git add docs/wiki/components.md docs/wiki/architecture.md docs/wiki/index.md
git commit -m "docs: wiki for scene renderer, workshop and definition boundary"
```

**Review Focus:** wiki claims must match shipped code (no documenting Plan 4's router/flags); the QA results (items 2/3/7 especially) must be real human observations, not inferred; Step 1's ruling is followed — **no** hollow server-side string-match guard was added (a check that cannot fail is a defect).

---

## Execution Handoff

- **Recommended: subagent-driven-development.** Tasks 2→8 form a strict interface chain on one new renderer surface (union → registry/stage → camera → glow/pins → lifecycle → post-FX → definition → workshop), and the most likely mistakes — a stray static `three` import that bloats the DSA bundle, a wrong meshopt call that yields a white screen, or a boundary leak that ships catalog fields — are exactly the ones a fresh reviewer per task catches before the next task builds on them. A fresh implementer + reviewer per task, with the pinned interfaces in each brief, is the thorough option these contracts want.
- Alternative: **executing-plans** (native, inline) — workable, since the interfaces are fully specified and every task ends on hard `tsc`/`build`/`eslint`/`scenes:validate` gates, so carry-over risk is lower than it looks.

**Non-negotiables for execution:** the shell is **PowerShell 5.1** — no `&&`, no backslash line-continuations, `Select-String` instead of `grep`, `$LASTEXITCODE` for exit codes (see the shell note at the top of this plan); commits stay **local** (no push without approval); the four standing gates must show **0 / 0 / success / exactly 3** and `scenes:validate OK — 1 scene(s), 0 warning(s)` after every task; HUMAN-ONLY steps are recorded as `deferred-to-human`, never treated as failures.
