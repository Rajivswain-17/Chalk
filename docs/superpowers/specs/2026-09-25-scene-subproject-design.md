# Design Spec: 3D Scene Sub-Project (Universal Visual Explainer)

**Date:** 2026-09-25 · **Status:** Design approved in brainstorming; pending written-spec review
**Path:** Architectural (brainstorming skill) → next gate: user review → `writing-plans`

---

## 1. Context & Goals

**Intent:** Expand Chalk from a DSA-only visual explainer into a Universal Visual Explainer. This spec covers the **3D Science scenes sub-project** — the declared priority ("3D is the whole point"). System Design with React Flow is explicitly deferred to a separate later spec.

**Audience & bar:** Chalk is a **real product for users**. Existing DSA users must see zero regression (cost, latency, behavior, bundle). Quality is structural, not probabilistic.

**Success criteria:**
- A curated science prompt renders a guided cinematic 3D tour in the same 5-zone studio player, with camera choreography, glowing callouts, and step playback identical to today's UX.
- Adding a domain or a scene is a registration, not a fork of the player.
- Unknown prompts degrade honestly (suggestions card), never into broken visuals.
- DSA sessions ship byte-identical behavior; Three.js never enters their bundle.

### Decisions from brainstorming (binding)

| Decision | Choice |
|---|---|
| Content ambition | Curated topics (~30–50/domain) + honest fallback |
| Sequencing | 3D first; keystone absorbed into this sub-project; System Design 2D demoted after |
| Asset strategy | Hand-curated CC0 library; LLM emits **references, never geometry** |
| 3D platforms | Desktop-first; mobile rides the 2D fallback ladder |
| Unfreeze budget | Additive + one union break (`VisualStep` → union; `ChatSession.steps` type annotation); storage format unchanged |
| Per-step experience | **Guided cinematic tour** — per-step camera keyframes; user orbit overrides; next step reclaims the camera |
| Authoring approach | **Approach 1: curated scene catalog + shot library; LLM sequences via strict enums.** First hero scene may ship hand-sequenced (Approach-3 bootstrap), LLM sequencer added second |

## 2. Architecture Overview

```
Prompt ──► Router (lexicon fast-path → LLM router → unsupported)
             │                          │
             ▼                          ▼
      Algorithm path (unchanged)   Sequence call (per-scene strict schema)
                                        │  LLM emits: sceneId, shotId, partIds, anchorIds, text
                                        ▼
                              Server expands IDs → camera poses + anchor coords
                                        │  (self-contained steps, one client request)
                                        ▼
                              ChalkStep[] ──► union rides existing localStorage cache
                                        │
                              VisualExplainer reads step.kind
                                        │
                              STAGE_REGISTRY[kind] → { Stage, Layout, Inspector }
                                        │
                              Scene3DStage (lazy chunk: three + fiber + drei)
```

## 3. Keystone: Schema Union, Registry, Cache

### 3.1 Step schema (the one union break)

```ts
type ChalkStep = AlgorithmStep | SceneStep   // discriminated on `kind`

interface StepBase {                // shared
  stepIndex: number;
  title: string;
  subtitle?: string;
  explanation: string;
  variables?: VisualVariable[];     // optional in the union; AlgorithmStep re-requires it (as today)
}

interface AlgorithmStep extends StepBase {
  kind: "algorithm";                // MISSING on old cached steps → normalized to "algorithm" on read
  variables: VisualVariable[];      // required, exactly as today's VisualStep
  // today's VisualStep fields, unchanged: stageType, elements, codeLines,
  // activeLine, calculation?
}

interface SceneStep extends StepBase {
  kind: "scene";
  sceneId: string;                  // ∈ catalog enum
  shotId: string;                   // ∈ scene shot-library enum (expanded server-side)
  highlights: string[];             // partIds ∈ scene parts enum
  callouts: { anchorId: string; text: string }[];   // anchorIds ∈ scene anchors enum
  notes?: string[];                 // SceneInspector content (Zone 3 slot)
}
```

`VisualStep` becomes a backward-compatible alias of `AlgorithmStep`.

### 3.2 Registry & layouts

- `STAGE_REGISTRY: Record<kind, { Stage; Layout; Inspector }>` — one file, one switch.
- `VisualExplainer` resolves by active step's `kind`:
  - `algorithm` → today's `[stage | CodePanel]` grid (`grid-cols-[1fr_420px]`), byte-identical.
  - `scene` → full-bleed stage + `SceneInspector` rendering `notes[]` with existing line-pill styling (Zone 3 becomes a slot, not a fork).
- The `switch` carries a `never` default so **the compiler enforces every future kind has a registry entry**.
- Chrome adaptation (additive): `ProblemBanner` reads fields optionally — scenes show title + `Goal:` pill; `Input:`/constraint pills render only when their source fields exist. `LiveMathRow` already renders only when `calculation` is present.

### 3.3 Cache & backward compatibility

- The discriminant lives **on each step**, so `ChatSession.steps` storage is untouched — plans remain `steps[]` only.
- Old cached DSA sessions lack `kind` → normalize to `"algorithm"` on read; zero migration, 0-generation-call refresh behavior preserved.
- Scene assets/plans are never stored in cache; steps are self-contained (§4.2).

### 3.4 Bundle discipline

- Registry stages other than the algorithm path load via `next/dynamic`.
- Scene chunk (three + fiber + drei + postprocessing, ~400–600KB gz) loads **only** on the first scene step; DSA sessions never download it.

### 3.5 Frozen contracts

Unchanged: `useVisualPlayer` API, `ControlsBar` props, `StepDots`, keyboard/fullscreen, glow `stateStyles` maps, `stageType`/element `state` enums, schema bounds (6–12 steps, 1–12 elements), the `data-testid="canvas"` never-unmounts invariant.
Unfrozen (the budget): `VisualStep` type (→ union) and the `ChatSession.steps` **type annotation** (→ `ChalkStep[]`).

## 4. Scene Catalog & Asset Pipeline

### 4.1 Catalog (server-owned, single source of truth)

`server/src/scenes/catalog.ts` — `Record<sceneId, SceneManifest>`:

```ts
interface SceneManifest {
  id: string;                       // stable slug
  status: "wip" | "live";           // wip → routes to fallback ladder, never renders
  asset: { kind: "mesh"; url: string; bytes: number; tris: number }
       | { kind: "procedural"; recipe: ProcRecipe };   // solar system, lattices, waves
  parts:    { id: string; label: string }[];           // → zod enums
  anchors:  { id: string; partId: string; pos: [x,y,z] }[];   // callout anchors
  shots:    { id: string; label: string; pos: [x,y,z]; target: [x,y,z]; fov: number }[];
  keywords: string[];               // routing lexicon
  license:   { source: string; license: "CC0" | "PD" | … attribution?: string };
}
```

- Strict-mode schemas are **built at boot from this import**: `z.enum(manifest.partIds)` etc. Hallucinated scene/shot/part/anchor IDs are rejected by construction.
- Catalog is never sent to the client (§4.2).

### 4.2 Server-side expansion (key data-flow decision)

The LLM emits **IDs only**. `visualize.service` validates against the selected scene's enums, then **expands** `shotId → {pos,target,fov}` and `anchorIds → coordinates` before responding. Steps arrive self-contained: zero extra client requests, cache path unchanged, catalog changes need no client deploy.

### 4.3 Sourcing & QC (the accepted curation labor)

1. **CC0/public-domain only**: Sketchfab CC0, Poly Haven, NASA, Smithsonian Open Access; attribution recorded in manifest.
2. Import QC: Y-up/scale normalization, origin centered, **part nodes renamed to manifest IDs**, ≤150k tris, then `gltf-transform` (meshopt/draco + KTX2) targeting **≤2MB/scene** (hard cap 5MB).
3. Parametric scenes bypass GLB entirely; textures referenced locally (NASA public domain) — **no remote fetches at runtime** (aligns with offline-safe icon-cache philosophy; drei remote `Environment` presets are forbidden — local HDRI/lights only).

### 4.4 `npm run scenes:validate` (quality gate)

Node script, run as part of every verification pass:
- Parses every mesh GLB: byte/tri budgets, finite/in-range shot poses, camera ≠ target.
- Asserts GLB node names ↔ manifest part IDs match (catches `Cylinder.007` mismatches).
- **Schema smoke:** for each `live` scene, builds the strict schema from its manifest, validates a fixture plan (must pass) and a corrupted fixture using a cross-scene shotId (must fail).
- `npm run routes:check`: golden prompt table → expected routing result across all three tiers.

### 4.5 Scene Workshop (dev-only route)

Orbit the scene, click a part, hotkey → writes shot pose/anchor into the manifest. Included because hand-editing JSON camera coordinates is untenable past scene #1. Dev-only, not shipped in production builds.

## 5. Renderer: `Scene3DStage`

- **Mount lifecycle:** lazy chunk loads on first scene step; R3F `<Canvas>` mounts **once per session**, never unmounts across steps (steps mutate scene props — the zero-blink contract, WebGL edition). Full GPU dispose pass (geometries/materials/textures) on session unmount.
- **Guided camera:** per-step expanded pose → ~1.2s tween (position + target + fov) on auto-advance; short tween on scrub jumps. **User orbit sets an override flag; the next step clears it and tweens back** — the approved experience contract.
- **Highlights:** amber emissive glow + gentle pulse on `highlights[]` — reuses the existing glow language (amber palette), not a new visual system.
- **Callout pins:** drei `Html` billboards at expanded anchors, fade per step, styled as existing chips (dark bg, amber/emerald border, mono label). Per-scene opt-in `occlude` (raycast cost per pin per frame).
- **Hardening:** error boundary around the stage — GLB load failure/corruption → degrade to fallback ladder **with controls alive**, never a white screen. `webglcontextlost` handled. React strict-mode double-mount safe.
- **Performance:** `frameloop` pauses when paused/tab hidden; `@react-three/postprocessing` bloom behind an **adaptive quality guard** (drops post-FX on frame-time spikes); budgets upstream-enforced by `scenes:validate` (≤150k tris, ≤2MB).
- **Fullscreen/scrubber/keyboard:** existing chrome operates unchanged over the stage (containerRef contract preserved).

### Fallback ladder (designed up front)

3D mesh scene → procedural recipe → 2D diagram (existing stages) → honest unsupported card. `status: "wip"` scenes and asset-load failures route down the ladder mechanically.

## 6. Routing & LLM Sequencing

### 6.1 Three-tier router (server-side, inside the single client request)

1. **Lexicon fast-path (free, instant):** score prompt against live scenes' `keywords` + a small algorithm lexicon ("leetcode", "binary search", "two sum"…). Canonical prompts (all sidebar presets) resolve here — **the DSA path keeps its exact cost and latency.** Scene hits skip the router entirely and go straight to §6.2; algorithm hits go straight to today's generation call.
2. **LLM router (fuzzy phrasing only):** one small call (`gpt-4o-mini`; prompt carries the catalog id/keywords table, ~1K tokens) → `{ sceneId | "algorithm" | "unsupported" }`.
3. **Unsupported:** HTTP **200** `{ status: "unsupported", suggestions: [2–3 live scene titles] }` — not an error, never cached, renders an honest card distinct from the error+retry path.

Router/sequencer **failures** (timeouts, 5xx from OpenAI) follow the existing error+retry path; only a successful "no match" is the 200-unsupported response.

### 6.2 Sequencing call (scene path only)

- **Per-scene strict schema built at request time** from that scene's enums + text fields — cross-scene IDs impossible under strict mode.
- System prompt = scene variant of the 3-phase pedagogy: **establish wide → explore parts → conclude**; one concept/step; ≤2 callouts/step; 2–4 sentence explanations; same frozen 6–12 step bounds.
- Payloads are smaller than algorithm plans (IDs + prose vs element arrays) → faster/cheaper sequencing.
- Server expands IDs (§4.2) before responding. Both internal calls sit inside **one** client request → rate limit (250/hr non-prod, 10/hr prod) counts one, unchanged.
- Model tiering: new `OPENAI_MODEL_SCENE` env (default `gpt-4o-mini`, promote to `gpt-4o` empirically); algorithm keeps `OPENAI_MODEL`. Rollback/kill switch: `SCENES_ENABLED` (default false until rollout step 3) + per-scene `status`.
- Progress UX: existing spinner stages copy — "Choosing scene…" → "Directing shots…". Client 120s timeout unchanged.

## 7. Verification

Standing gate unchanged: `npx tsc --noEmit` (server + client) = 0, client `npm run build` = 0, eslint delta = 0. Script gates: `scenes:validate`, `routes:check` (§4.4).

**Manual QA checklist (human-run; browser tools unavailable to the agent):**
1. Guided-camera handoff: grab orbit mid-playback → next step reclaims camera.
2. Repeated session switching → no GPU-memory creep (dispose works; Task Manager).
3. Rename/delete a GLB → graceful degradation, controls alive, no white screen.
4. Unsupported prompt → suggestions card; refresh → 0 generation calls.
5. Scene refresh with cache → instant render, 0 API generation calls.
6. 9:16 mode, fullscreen, scrubber, keyboard arrows/space over a scene.
7. **DSA regression:** all four sidebar presets render exactly as before; bundle for a DSA session contains no three/fiber code.
8. Frame-time guard visibly disables bloom under load (tab throttling).

## 8. Rollout Plan

1. **Keystone refactor alone** (union + registry, algorithm-only) — zero visible change; full gate pass. Own commit/plan.
2. **Vertical slice: heart, hand-sequenced** — manifest + workshop + renderer + first scene fully authored without the LLM (proves asset QC, parts/anchors, shots, camera, callouts end-to-end). *Ruling: heart first because it exercises the mesh pipeline fully — the purpose of the slice; solar system (procedural path) is second and proves the parametric format.*
3. **Router + LLM sequencer + unsupported card** behind `SCENES_ENABLED=false` → QA (§7) → flip on.
4. **Grow the catalog** scene-by-scene (source → QC → shots → keywords → validate → `status: "live"`), with per-generation logging (kind, model, tokens, latency) and `OPENAI_MODEL_SCENE` tuning.
5. **System Design 2D** — separate spec, after scenes ship.

## 9. Non-Goals (locked)

Mobile 3D · text-to-3D generation · runtime CDN asset downloads · user-uploaded GLBs · narration/ElevenLabs integration · React Flow/system-design work · remote runtime fetches of any kind (HDRIs, fonts, models).

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bundle bloat kills DSA UX | Lazy registry chunk; QA item 7 asserts absence |
| WebGL fragility (context loss, leaks) | Error boundary, context-loss handling, dispose pass, QA items 2–3 |
| Hallucinated IDs/geometry | Strict enums from catalog; LLM never emits coordinates |
| Framing quality variance | Shot library = authored cinematography; LLM only selects |
| Asset licensing debt | CC0/PD-only + attribution in manifest, enforced in QC |
| DSA regression | Algorithm path untouched; fast-path routing; union alias |
| Credit burn | Small schemas, per-kind model env, per-generation logging |
| Scope creep back toward "universal" | §9 non-goals + `unsupported` card as a first-class feature |

## 11. Build Decomposition

One spec (this) → `writing-plans` splits into ~5 sequential plans:
1. Keystone (union + registry + banner tolerance)
2. Catalog format + asset QC + `scenes:validate` + heart asset
3. `Scene3DStage` renderer (mount/camera/callouts/hardening) + workshop
4. Router + sequencer + unsupported card + flags
5. Rollout: logging, QA pass, flag flip, wiki updates (`components.md`, `api.md`, `architecture.md`)

System Design 2D = future spec. Each plan follows the established workflow: plan file → executing-plans/SDD → tsc/build gates → wiki update → review.
