# Scene Catalog & Asset Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-owned scene catalog (manifest format + first live scene), the mesh-asset QC toolchain, and the `scenes:validate` quality gate — spec §4, i.e. plan 2 of the 3D-scene decomposition.

**Architecture:** A new `server/src/scenes/` module: pure types → catalog data record → strict zod schema builders → QC CLI tools → a standalone `npm run scenes:validate` gate script. The heart GLB is sourced (CC0), renamed, normalized, and optimized into `client/public/scenes/heart.glb`, served as a static file; the catalog itself never reaches the client.

**Tech Stack:** TypeScript (CommonJS, `strict`), zod `^3.23.8` (existing), `@gltf-transform/core` + `@gltf-transform/cli` `^4` (devDeps, verified 4.5.1), `tsx ^4.19.2` (existing).

**Spec:** `docs/superpowers/specs/2026-09-25-scene-subproject-design.md` — this plan argues from §4 (Scene Catalog & Asset Pipeline), §11 item 2, §7.6 (verification), §10.2 (licensing). Executors read the spec alongside this plan.

## Global Constraints

- Licenses: **CC0 or PD only**, attribution recorded in every manifest (spec §4.3, §10.2).
- Mesh budgets: **≤150,000 tris**, **≤2MB target / 5MB hard cap** per scene asset (spec §4.3, §3.4).
- **No runtime remote fetches** — assets served from `client/public` (spec §3.4).
- The catalog is **server-owned and never sent to the client** — no route may expose `SCENES` (spec §4.2).
- The LLM emits **IDs only**; coordinate/manifest expansion is server-side. `SceneStepPayload` fixes that shape here (spec §4.2).
- `status: "wip"` scenes never render (routing lands in Plan 4) (spec §4.1).
- Keystone freezes intact: zero client-code change this plan — only a static file under `client/public/` (spec §3.5; `VisualStep`, registry, `ControlsBar`, glow styles, schema bounds untouched).
- Verification gates every task: `server npx tsc --noEmit` = 0, `client npx tsc --noEmit` = 0, `client npm run build` success, `client npx eslint src/components src/lib src/hooks` = exactly **3** baseline errors (delta 0), plus **`npm run scenes:validate` exit 0** (spec §7, §7.6).
- **No new runtime dependencies** — `@gltf-transform/*` are devDeps only (spec §7.4).

## Rulings made while writing this plan

(Recorded here because they deviate from, or pin details the spec leaves open.)

1. **`license.attribution` is required**, not optional — spec §10.2 mandates "attribution in manifest, enforced in QC"; the §4.1 interface sketch marked it `?`.
2. **Normalization target:** origin = bounds center, max dimension = **2.0 world units** (spec §4.3 requires "scale normalization" without a number; 2.0 makes shot coordinates predictable).
3. **Textures: WebP, not KTX2** — spec §4.3 says "meshopt/draco + KTX2", but `gltf-transform` KTX2 output requires the native **KTX-Software 4.4+** binary (empirically: `optimize --texture-compress ktx2` → `Command "ktx" not found`). WebP keeps the byte budget (168 KB → 36.7 KB) with zero native deps. Revisit only if VRAM becomes a concern.
4. **Heart manifest is `status: "live"`** — no router or renderer exists yet, so nothing can route to it prematurely; `scenes:validate`'s smoke gate only runs on live scenes, and Plan 3 (renderer) lands before Plan 4 (routing).
5. **Cross-scene corruption fixture** uses the literal `solar-system::orbit-1` — a plausible foreign ID that `z.enum` must reject; it need not exist in the catalog (unlike a naive reading of "cross-scene", no second manifest is required).
6. **`validate.ts` parses the GLB container JSON manually** (12-byte header + JSON chunk) instead of `@gltf-transform/core` — NodeIO refuses optimized files (`Missing required extension, "EXT_meshopt_compression"`, proven empirically), and the gate needs no vertex decoding anyway. `prepare-mesh.ts report` therefore runs on *uncompressed* prepared files; final compressed assets are measured by the gate.

## Review Focus

1. **Asset/manifest drift** — someone re-optimizes `heart.glb` without updating `asset.bytes`/`asset.tris`, and budget reporting silently lies → Task 4 Step 6 RED drill flips `bytes` and requires `scenes:validate` to exit 1 naming the mismatch.
2. **`optimize` collapsing part structure** — its defaults (`--flatten true --join true`) would merge the five named heart nodes, permanently breaking highlights/callouts/anchors → Task 2 Step 6 pins structure-preserving flags and Step 7 requires post-optimize proof that all 5 mesh nodes survived with canonical names.
3. **Degenerate camera poses** — `pos ≈ target` (or a straight-down shot with default up-vector) yields a NaN `lookAt` / black frame in Plan 3's renderer → Task 3 pins non-degenerate poses (tilted `top_down`, distances ≥ 0.1) and Task 4 Step 2 asserts distance/fov/range checks; RED drill B proves the fov check fires.
4. **Schema smoke proving only the happy path** — a valid fixture passing proves nothing about rejection → Task 4 requires **five** corrupted payloads each individually rejected (cross-scene shotId, foreign sceneId, hallucinated part, hallucinated anchor, strict unknown field), with RED drill C proving the rejection assertion itself can fail.
5. **License provenance unverified** — wrong license recorded or missing attribution ships a legal problem → Task 3 Step 1 pins the CC0 source URL + attribution string gathered in Task 2 Step 3, and Task 4 Step 2 validates allowed-set + http(s) format + nonempty attribution.

## File Structure

| File | Responsibility |
|------|----------------|
| Create: `server/src/scenes/types.ts` | Pure types: `SceneManifest`, `ProcRecipe`, `SceneStepPayload`, `Vec3`. No runtime code. |
| Create: `server/src/scenes/catalog.ts` | `SCENES: Record<string, SceneManifest>` — the data record (heart lands in Task 3). |
| Create: `server/src/scenes/schemas.ts` | `buildSceneStepSchema(manifest)` → strict zod schema; the only place zod meets catalog data. |
| Create: `server/src/scenes/tools/maps/heart.json` | Node-rename map: source GLB node names → canonical part IDs. |
| Create: `server/src/scenes/tools/prepare-mesh.ts` | QC CLI: `prepare` (rename + normalize) and `report` (bytes/tris/centers). |
| Create: `client/public/scenes/heart.glb` | The QC'd asset (36,676 bytes) — static, fetched at render time. |
| Create: `server/src/scenes/fixtures/smokePlans.ts` | Valid + must-reject payloads for the smoke gate. |
| Create: `server/src/scenes/validate.ts` | The `scenes:validate` gate script. |
| Modify: `server/package.json` | devDeps `@gltf-transform/core@^4`, `@gltf-transform/cli@^4`; script `scenes:validate`. |
| Modify: `docs/wiki/architecture.md`, `docs/wiki/index.md` | Task 5 wiki updates (AGENTS.md mandate). |

Decomposition rationale: catalog **data** is separate from types so manifest edits are data-only commits; schema building is its own file because Plan 4's sequencer will import it without dragging the validate gate along; the QC tool lives under `scenes/tools/` beside its rename maps so each future scene ships map+manifest together.

## Non-goals (explicitly other plans)

- `SceneStep` union member, `VisualExplainer` routing, `Scene3DStage`, Scene Workshop → **Plan 3**.
- Router, sequencer, `routes:check` golden table (spec §4.4 bullet 3), unsupported card, flags → **Plan 4**.
- Any client component/code change → none this plan (static file only).
- Any server HTTP endpoint → none (catalog is never exposed).

---

### Task 1: Manifest types, catalog shell, strict schema builder

**Files:**
- Create: `server/src/scenes/types.ts`
- Create: `server/src/scenes/catalog.ts`
- Create: `server/src/scenes/schemas.ts`

**Interfaces:**
- Consumes: zod `^3.23.8` (server dependency, existing).
- Produces (relied on by every later task):
  - `type Vec3 = [number, number, number]`
  - `interface SceneManifest { id; status: "wip" | "live"; asset: { kind: "mesh"; url; bytes; tris } | { kind: "procedural"; recipe }; parts; anchors; shots; keywords; license }` — full shapes in Step 1.
  - `interface SceneStepPayload { sceneId: string; shotId: string; highlights: string[]; callouts: { anchorId: string; text: string }[] }`
  - `const SCENES: Record<string, SceneManifest>` (empty until Task 3).
  - `function buildSceneStepSchema(m: SceneManifest): z.ZodType<SceneStepPayload>` — strict; throws `Error("scene \"<id>\" has no <shots|parts|anchors>")` on empty ID lists.

- [ ] **Step 1: Write `types.ts`**

```ts
// server/src/scenes/types.ts
// Scene catalog types — spec §4.1. Server-owned: never sent to the client (§4.2).

export type Vec3 = [x: number, y: number, z: number];

/** Procedural scene recipe (solar system, lattices, waves) — spec §4.1 asset union. */
export interface ProcRecipe {
  generator: "solar-system" | "lattice" | "wave";
  params: Record<string, number | string>;
}

export interface SceneManifest {
  /** Stable slug; must equal its key in SCENES (validate enforces). */
  id: string;
  /** wip → routes to the fallback ladder, never renders (spec §4.1). */
  status: "wip" | "live";
  asset:
    | { kind: "mesh"; url: string; bytes: number; tris: number }
    | { kind: "procedural"; recipe: ProcRecipe };
  /** Selectable parts → GLB mesh-node names (mesh scenes), become z.enum IDs. */
  parts: { id: string; label: string }[];
  /** Callout anchor points; pos in normalized world units (spec §4.1). */
  anchors: { id: string; partId: string; pos: Vec3 }[];
  /** Shot library the sequencer picks from (spec §4.1). */
  shots: { id: string; label: string; pos: Vec3; target: Vec3; fov: number }[];
  /** Routing lexicon consumed by the Plan-4 router (spec §4.1). */
  keywords: string[];
  /** CC0/PD only; attribution required (spec §4.3, §10.2 — ruling 1). */
  license: { source: string; license: "CC0" | "PD"; attribution: string };
}

/** ID-domain step the LLM emits; coords expanded server-side (spec §4.2). */
export interface SceneStepPayload {
  sceneId: string;
  shotId: string;
  highlights: string[];
  callouts: { anchorId: string; text: string }[];
}
```

- [ ] **Step 2: Write `catalog.ts` (empty shell — Task 3 adds heart)**

```ts
// server/src/scenes/catalog.ts
import type { SceneManifest } from "./types";

/** Single source of truth for scenes (spec §4.1). Never sent to the client (§4.2). */
export const SCENES: Record<string, SceneManifest> = {};
```

- [ ] **Step 3: Write `schemas.ts`**

```ts
// server/src/scenes/schemas.ts
import { z } from "zod";
import type { SceneManifest, SceneStepPayload } from "./types";

/**
 * Builds the strict step schema for one scene from its manifest (spec §4.1):
 * every ID field becomes a z.enum of the catalog's IDs, so hallucinated
 * scene/shot/part/anchor IDs are rejected at parse time. Strict mode also
 * rejects unknown extra fields.
 */
export function buildSceneStepSchema(m: SceneManifest): z.ZodType<SceneStepPayload> {
  const nonEmpty = (ids: string[], what: string): [string, ...string[]] => {
    const [first, ...rest] = ids;
    if (first === undefined) throw new Error(`scene "${m.id}" has no ${what}`);
    return [first, ...rest];
  };
  return z
    .object({
      sceneId: z.literal(m.id),
      shotId: z.enum(nonEmpty(m.shots.map((s) => s.id), "shots")),
      highlights: z.array(z.enum(nonEmpty(m.parts.map((p) => p.id), "parts"))),
      callouts: z.array(
        z.object({
          anchorId: z.enum(nonEmpty(m.anchors.map((a) => a.id), "anchors")),
          text: z.string().min(1),
        }),
      ),
    })
    .strict();
}
```

- [ ] **Step 4: Type-check**

Run (cwd `server/`): `npx tsc --noEmit`
Expected: exit 0, no output. (This task's deliverable is types + a pure function; its runtime behavior is exercised against real fixtures by the validate gate in Task 4 — tsc is this task's test cycle, per the repo's established gate translation.)

- [ ] **Step 5: Commit**

```powershell
git add server/src/scenes docs/superpowers/plans/2026-10-06-scene-catalog-pipeline.md
git commit -m "feat: add scene manifest types, catalog shell, and strict step schema builder"
```

---

### Task 2: Heart asset sourcing + mesh QC pipeline

**Files:**
- Modify: `server/package.json` (devDeps only)
- Create: `server/src/scenes/tools/maps/heart.json`
- Create: `server/src/scenes/tools/prepare-mesh.ts`
- Create: `client/public/scenes/heart.glb` (pipeline output)

**Interfaces:**
- Consumes: none from earlier tasks (independent of Task 1).
- Produces (relied on by Tasks 3–4):
  - `client/public/scenes/heart.glb` — URL `/scenes/heart.glb`; **expected 36,676 bytes, 2,860 tris, 5 mesh nodes** (`heart_red`, `heart_pink`, `heart_purple`, `heart_blue`, `heart_green`).
  - `npx tsx src/scenes/tools/prepare-mesh.ts prepare <in.glb> <out.glb> <rename.json>` → renames per map, normalizes (bounds center → origin, max dim → 2.0), writes `out`, prints report.
  - `npx tsx src/scenes/tools/prepare-mesh.ts report <file.glb>` → JSON `{ bytes, tris, nodes: [{ name, center, tris }] }` (uncompressed GLBs only — ruling 6).
  - Source provenance for Task 3: page `https://poly.pizza/m/dACfv60ILZ`, direct `https://static.poly.pizza/0bc819f1-5f90-4225-8c27-aba059541601.glb`, license **CC0 / Public Domain**, creator **MiniPoly** ("Hearts").

- [ ] **Step 1: Add tooling devDeps**

Run (cwd `server/`): `npm i -D @gltf-transform/core@^4 @gltf-transform/cli@^4`
Expected: exit 0; `package.json` gains both under `devDependencies` (CLI resolves to 4.5.1). The local `gltf-transform` binary keeps Step 6 offline-deterministic — never rely on a bare `npx gltf-transform` fetching an unrelated package.

- [ ] **Step 2: Source the CC0 heart (with fallbacks)**

```powershell
Invoke-WebRequest -Uri "https://static.poly.pizza/0bc819f1-5f90-4225-8c27-aba059541601.glb" -OutFile "$env:TEMP\chalk-heart-source.glb"
(Get-Item "$env:TEMP\chalk-heart-source.glb").Length   # expected 168260
```

If the primary URL fails: fallback asset = Quaternius "Heart" (page `https://poly.pizza/m/1yCRUwFnwX`, direct `https://static.poly.pizza/a53d4e74-46dd-43d3-9815-82cef1fa8ccc.glb`, CC0, 160 tris, 2 nodes — single part `heart_full` after rename; manifest in Task 3 then lists 1 part/anchor instead of 5). If both fail: stop and ask the user for a CC0/PD `.glb` heart file (licenses other than CC0/PD are forbidden — spec §4.3).

- [ ] **Step 3: Verify license provenance on the source page**

```powershell
$html = (Invoke-WebRequest -Uri "https://poly.pizza/m/dACfv60ILZ" -UseBasicParsing).Content
$html -match 'CC0'                 # expected True
$html -match 'Public Domain'       # expected True
$html -match 'MiniPoly'            # expected True (creator, for attribution)
```
Expected: all three `True`. If any fails, do not ship this asset — go to the fallback in Step 2. These facts become Task 3's `license` block verbatim.

- [ ] **Step 4: Write the rename map**

Create `server/src/scenes/tools/maps/heart.json` **without a BOM** (PowerShell 5.1 `Set-Content -Encoding UTF8` writes one; the prepare tool strips a BOM defensively anyway):

```json
{
  "Heat": "heart_red",
  "Cube.001": "heart_pink",
  "Cube.002": "heart_purple",
  "Cube.003": "heart_blue",
  "Cube.004": "heart_green"
}
```

(These five source names were verified against the asset's node list; quadrant mapping is documented by Step 5's center report — red = center, pink = top-right, purple = top-left, green = bottom-left, blue = bottom-right.)

- [ ] **Step 5: Write `prepare-mesh.ts`**

```ts
// server/src/scenes/tools/prepare-mesh.ts
// ----------------------------------------------------------------------------
// Mesh asset QC tool (spec §4.3): renames nodes to manifest part IDs,
// normalizes the scene (bounds-center -> origin, max dimension -> 2.0 world
// units), and reports measurable facts for manifest authoring.
//
// Usage (cwd server/):
//   npx tsx src/scenes/tools/prepare-mesh.ts prepare <in.glb> <out.glb> <rename.json>
//   npx tsx src/scenes/tools/prepare-mesh.ts report  <file.glb>
//
// report mode reads via NodeIO, which cannot open optimized assets
// (EXT_meshopt_compression needs a decoder) — report uncompressed prepared
// files; final compressed assets are measured by `npm run scenes:validate`,
// which parses the GLB container JSON directly.
// ----------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { NodeIO, getBounds } from "@gltf-transform/core";
import type { Mesh, Primitive } from "@gltf-transform/core";

const TARGET_MAX_DIM = 2.0;

interface MeshNodeReport {
  name: string;
  center: [number, number, number];
  tris: number;
}
interface MeshReport {
  bytes: number;
  tris: number;
  nodes: MeshNodeReport[];
}

function primitiveTris(prim: Primitive): number {
  const indices = prim.getIndices();
  const position = prim.getAttribute("POSITION");
  const count = indices ? indices.getCount() : position ? position.getCount() : 0;
  return count / 3;
}

function meshTris(mesh: Mesh): number {
  return mesh.listPrimitives().reduce((sum, p) => sum + primitiveTris(p), 0);
}

async function report(file: string): Promise<void> {
  const doc = await new NodeIO().read(file);
  const nodes: MeshNodeReport[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const bounds = getBounds(node);
    nodes.push({
      name: node.getName() ?? "(unnamed)",
      center: [
        (bounds.min[0] + bounds.max[0]) / 2,
        (bounds.min[1] + bounds.max[1]) / 2,
        (bounds.min[2] + bounds.max[2]) / 2,
      ],
      tris: meshTris(mesh),
    });
  }
  const out: MeshReport = {
    bytes: readFileSync(file).length,
    tris: doc.getRoot().listMeshes().reduce((sum, m) => sum + meshTris(m), 0),
    nodes,
  };
  console.log(JSON.stringify(out, null, 2));
}

async function prepare(input: string, output: string, mapPath: string): Promise<void> {
  // BOM strip: Windows editors often write UTF-8-with-BOM, which breaks JSON.parse.
  const rename = JSON.parse(readFileSync(mapPath, "utf8").replace(/^\uFEFF/, "")) as Record<
    string,
    string
  >;
  const doc = await new NodeIO().read(input);
  for (const node of doc.getRoot().listNodes()) {
    const current = node.getName();
    const next = current !== null ? rename[current] : undefined;
    if (next !== undefined) node.setName(next);
  }
  const scene = doc.getRoot().listScenes()[0];
  if (scene === undefined) throw new Error(`${input}: no scene to normalize`);
  const bounds = getBounds(scene);
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const maxDim = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  if (!(maxDim > 0)) throw new Error(`${input}: degenerate bounds (maxDim=${maxDim})`);
  const scale = TARGET_MAX_DIM / maxDim;
  const wrap = doc
    .createNode("normalize")
    .setScale([scale, scale, scale])
    .setTranslation([-center[0] * scale, -center[1] * scale, -center[2] * scale]);
  for (const root of scene.listChildren()) {
    scene.removeChild(root);
    wrap.addChild(root);
  }
  scene.addChild(wrap);
  await new NodeIO().write(output, doc);
  console.log(`prepared: ${input} -> ${output} (scale=${scale.toFixed(6)})`);
  await report(output);
}

async function main(): Promise<void> {
  const [mode, a, b, c] = process.argv.slice(2);
  if (mode === "prepare" && a && b && c) {
    await prepare(a, b, c);
  } else if (mode === "report" && a) {
    await report(a);
  } else {
    console.error(
      "usage: prepare-mesh.ts prepare <in.glb> <out.glb> <rename.json> | report <file.glb>",
    );
    process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 6: Run prepare → optimize**

```powershell
npx tsx src/scenes/tools/prepare-mesh.ts prepare "$env:TEMP\chalk-heart-source.glb" "$env:TEMP\chalk-heart-prepped.glb" src/scenes/tools/maps/heart.json
New-Item -ItemType Directory -Force "..\client\public\scenes" | Out-Null
npx gltf-transform optimize "$env:TEMP\chalk-heart-prepped.glb" "..\client\public\scenes\heart.glb" --compress meshopt --flatten false --join false --instance false --simplify false --texture-compress webp
```
Expected: prepare exits 0, prints `scale=0.195603` and a report with 5 nodes named canonically, each `tris: 572` (total 2860), centers matching Step 7's table. Optimize exits 0 with `info: heart.prepped.glb (166.39 KB) -> … (36.68 KB)`.
Why these flags: `--flatten false --join false --instance false` preserve the named node structure (Review Focus 2); `--simplify false` keeps geometry exact (2,860 tris, nothing to gain); `--texture-compress webp` per ruling 3 (ktx2 needs the native KTX-Software binary this host lacks).

- [ ] **Step 7: Verify structure survived optimization (Review Focus 2) and record manifest numbers**

```powershell
node -e "
const fs=require('fs');
const b=fs.readFileSync(process.argv[1]);
const jl=b.readUInt32LE(12); const j=JSON.parse(b.toString('utf8',20,20+jl));
const tris=(j.meshes||[]).reduce((s,m)=>s+m.primitives.reduce((t,p)=>t+(p.indices!=null?j.accessors[p.indices].count/3:j.accessors[p.attributes.POSITION].count/3),0),0);
console.log('bytes='+b.length);
console.log('meshNodes='+JSON.stringify((j.nodes||[]).filter(n=>n.mesh!==undefined).map(n=>n.name)));
console.log('tris='+tris);
console.log('images='+JSON.stringify((j.images||[]).map(i=>i.mimeType)));
" "..\client\public\scenes\heart.glb"
```
Expected (pin these into Task 3's manifest):
```
bytes=36676
meshNodes=["heart_red","heart_pink","heart_purple","heart_blue","heart_green"]
tris=2860
images=["image/webp","image/webp","image/webp"]
```
If bytes/nodes differ (e.g. the upstream file was re-served), carry the **measured** values forward — `scenes:validate` asserts exact manifest↔file equality, so Task 3 must use the true numbers.

- [ ] **Step 8: Commit**

```powershell
git add server/package.json server/src/scenes/tools client/public/scenes
git commit -m "feat: add heart scene asset with mesh QC tooling"
```

---

### Task 3: Heart manifest in the catalog

**Files:**
- Modify: `server/src/scenes/catalog.ts`

**Interfaces:**
- Consumes: `SceneManifest` from Task 1; asset facts + provenance from Task 2 (`bytes=36676`, `tris=2860`, 5 mesh nodes, CC0 source page, creator MiniPoly).
- Produces: the live `heart` entry in `SCENES` — consumed by Task 4's gate (structural/pose/smoke checks) and by Plans 3–4 (renderer shot library, router lexicon).

- [ ] **Step 1: Write the heart manifest**

Replace the shell contents of `server/src/scenes/catalog.ts` with:

```ts
// server/src/scenes/catalog.ts
import type { SceneManifest } from "./types";

/** Single source of truth for scenes (spec §4.1). Never sent to the client (§4.2). */
export const SCENES: Record<string, SceneManifest> = {
  heart: {
    id: "heart",
    status: "live", // ruling 4: no router exists yet; smoke gate needs live
    asset: { kind: "mesh", url: "/scenes/heart.glb", bytes: 36_676, tris: 2_860 },
    parts: [
      { id: "heart_red", label: "Red heart (center)" },
      { id: "heart_purple", label: "Purple heart (top-left)" },
      { id: "heart_pink", label: "Pink heart (top-right)" },
      { id: "heart_green", label: "Green heart (bottom-left)" },
      { id: "heart_blue", label: "Blue heart (bottom-right)" },
    ],
    anchors: [
      // z = +0.24 sits in front of the heart surface (~0.196) in normalized units
      { id: "a_red", partId: "heart_red", pos: [0, 0.04, 0.24] },
      { id: "a_purple", partId: "heart_purple", pos: [-0.7, 0.51, 0.24] },
      { id: "a_pink", partId: "heart_pink", pos: [0.7, 0.49, 0.24] },
      { id: "a_green", partId: "heart_green", pos: [-0.5, -0.49, 0.24] },
      { id: "a_blue", partId: "heart_blue", pos: [0.5, -0.51, 0.24] },
    ],
    shots: [
      { id: "overview", label: "Overview", pos: [0, 0, 4.2], target: [0, 0, 0], fov: 45 },
      { id: "red_closeup", label: "Center heart closeup", pos: [0, 0.1, 2.0], target: [0, 0.04, 0], fov: 40 },
      { id: "top_down", label: "Top-down layout", pos: [0, 3.6, 1.6], target: [0, 0, 0], fov: 45 },
      // tilted, never straight down: lookAt with up=+Y degenerates vertically (Review Focus 3)
    ],
    keywords: ["heart", "hearts", "cardiac", "circulation", "blood", "pump", "anatomy", "organ"],
    license: {
      source: "https://poly.pizza/m/dACfv60ILZ",
      license: "CC0",
      attribution: "Hearts by MiniPoly (poly.pizza, CC0)",
    },
  },
};
```

If Task 2 Step 7 measured different `bytes`/`tris`, use the measured values here (validate asserts exact equality).

- [ ] **Step 2: Cross-check anchors against the prepared-asset centers**

From Task 2 Step 6's report (normalized centers): red `(−0.003, 0.034, 0)`, pink `(0.696, 0.490, 0)`, purple `(−0.696, 0.510, 0)`, blue `(0.500, −0.510, 0)`, green `(−0.500, −0.490, 0)`.
Expected: every anchor `pos` matches its part's center within **0.02** on x/y (anchors rounded for readability) and sits at `z=0.24` in front of the surface. If a mismatch exceeds 0.02, recompute the anchor from the report before continuing.

- [ ] **Step 3: Type-check**

Run (cwd `server/`): `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```powershell
git add server/src/scenes/catalog.ts
git commit -m "feat: add heart scene manifest to catalog"
```

---

### Task 4: `scenes:validate` gate + smoke fixtures + RED drills

**Files:**
- Create: `server/src/scenes/fixtures/smokePlans.ts`
- Create: `server/src/scenes/validate.ts`
- Modify: `server/package.json` (script only)

**Interfaces:**
- Consumes: `SCENES` (Task 1 shell, filled Task 3), `buildSceneStepSchema` (Task 1), `SceneManifest`/`SceneStepPayload` types, the asset at `client/public/scenes/heart.glb` (Task 2).
- Produces: `npm run scenes:validate` (exit 0/1) — the standing gate every later verification pass runs (spec §4.4); exports `VALID_PLANS: Record<string, SceneStepPayload[]>` and `INVALID_PLANS: { scene: string; name: string; payload: unknown }[]`.

- [ ] **Step 1: Write the smoke fixtures**

```ts
// server/src/scenes/fixtures/smokePlans.ts
import type { SceneStepPayload } from "../types";

/** Must-parse plan fragments (spec §4.4 schema smoke). */
export const VALID_PLANS: Record<string, SceneStepPayload[]> = {
  heart: [
    {
      sceneId: "heart",
      shotId: "overview",
      highlights: ["heart_red"],
      callouts: [{ anchorId: "a_red", text: "The center heart" }],
    },
    {
      sceneId: "heart",
      shotId: "red_closeup",
      highlights: ["heart_red", "heart_purple"],
      callouts: [
        { anchorId: "a_red", text: "Closest to camera" },
        { anchorId: "a_purple", text: "Top-left heart" },
      ],
    },
  ],
};

/** Must-REJECT payloads (spec §4.4): `scene` names the schema that must refuse them. */
export const INVALID_PLANS: { scene: string; name: string; payload: unknown }[] = [
  {
    scene: "heart",
    name: "cross-scene shotId",
    payload: { sceneId: "heart", shotId: "solar-system::orbit-1", highlights: [], callouts: [] },
  },
  {
    scene: "heart",
    name: "foreign sceneId",
    payload: { sceneId: "mars-base", shotId: "overview", highlights: [], callouts: [] },
  },
  {
    scene: "heart",
    name: "hallucinated part",
    payload: { sceneId: "heart", shotId: "overview", highlights: ["atrium"], callouts: [] },
  },
  {
    scene: "heart",
    name: "hallucinated anchor",
    payload: {
      sceneId: "heart",
      shotId: "overview",
      highlights: ["heart_red"],
      callouts: [{ anchorId: "ghost-anchor", text: "x" }],
    },
  },
  {
    scene: "heart",
    name: "strict unknown field",
    payload: { sceneId: "heart", shotId: "overview", highlights: [], callouts: [], cameraZoom: 3 },
  },
];
```

- [ ] **Step 2: Write `validate.ts`**

```ts
// server/src/scenes/validate.ts
// ----------------------------------------------------------------------------
// scenes:validate — quality gate for the scene catalog (spec §4.4).
// Checks: license provenance, ID uniqueness/references, pose sanity, asset
// budgets + manifest<->file drift, GLB mesh-node <-> parts match, and schema
// smoke (valid fixtures must parse, corrupted fixtures must fail).
//
// Parses the GLB container JSON directly instead of via @gltf-transform/core:
// optimized assets require EXT_meshopt_compression, which NodeIO refuses to
// read without a decoder — the container header needs no decoding (ruling 6).
//
// Usage: npm run scenes:validate     (exit 0 = pass, 1 = issues on stderr)
// ----------------------------------------------------------------------------
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { SCENES } from "./catalog";
import { INVALID_PLANS, VALID_PLANS } from "./fixtures/smokePlans";
import { buildSceneStepSchema } from "./schemas";
import type { SceneManifest } from "./types";

const MAX_TRIS = 150_000;
const TARGET_BYTES = 2 * 1024 * 1024;
const HARD_BYTES = 5 * 1024 * 1024;
const MIN_FOV = 15;
const MAX_FOV = 120;
const MAX_POSE_COORD = 100;
const MAX_ANCHOR_COORD = 10;
const MIN_CAM_DISTANCE = 0.1;
const ALLOWED_LICENSES = new Set(["CC0", "PD"]);
const PUBLIC_DIR = resolve(__dirname, "../../../client/public");

const issues: string[] = [];
const warnings: string[] = [];
const fail = (msg: string): void => void issues.push(msg);
const finite = (v: number): boolean => Number.isFinite(v);

interface GlbJson {
  nodes?: { name?: string; mesh?: number }[];
  meshes?: { primitives: { indices?: number; attributes: Record<string, number> }[] }[];
  accessors?: { count: number }[];
}

function parseGlb(file: string): GlbJson {
  const buf = readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${file}: not a GLB container (bad magic)`);
  }
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) {
    throw new Error(`${file}: missing GLB JSON chunk`);
  }
  return JSON.parse(buf.toString("utf8", 20, 20 + jsonLen)) as GlbJson;
}

function glbTris(j: GlbJson): number {
  let total = 0;
  for (const mesh of j.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const count =
        prim.indices !== undefined
          ? j.accessors?.[prim.indices]?.count ?? 0
          : j.accessors?.[prim.attributes.POSITION]?.count ?? 0;
      total += count / 3;
    }
  }
  return total;
}

function findDupIds(items: { id: string }[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const { id } of items) {
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  return dups;
}

function checkMeshAsset(id: string, m: SceneManifest): void {
  if (m.asset.kind !== "mesh") return;
  const { url, bytes, tris } = m.asset;
  if (!url.startsWith("/")) {
    fail(`scene "${id}": asset.url must be root-relative, got "${url}"`);
    return;
  }
  const file = resolve(PUBLIC_DIR, url.replace(/^\/+/, ""));
  if (!existsSync(file)) {
    fail(`scene "${id}": asset missing at client/public${url}`);
    return;
  }
  const actualBytes = statSync(file).length;
  if (actualBytes !== bytes) {
    fail(`scene "${id}": manifest.bytes ${bytes} != file ${actualBytes} (asset/manifest drift — re-run prepare report and update manifest)`);
  }
  if (actualBytes > HARD_BYTES) {
    fail(`scene "${id}": ${actualBytes} bytes > ${HARD_BYTES} hard cap`);
  } else if (actualBytes > TARGET_BYTES) {
    warnings.push(`scene "${id}": ${actualBytes} bytes above ${TARGET_BYTES} target`);
  }
  let glb: GlbJson;
  try {
    glb = parseGlb(file);
  } catch (err) {
    fail(`scene "${id}": ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const actualTris = glbTris(glb);
  if (actualTris !== tris) {
    fail(`scene "${id}": manifest.tris ${tris} != file ${actualTris}`);
  }
  if (actualTris > MAX_TRIS) {
    fail(`scene "${id}": ${actualTris} tris > ${MAX_TRIS}`);
  }
  const meshNodes = new Set(
    (glb.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? ""),
  );
  const partIds = new Set(m.parts.map((p) => p.id));
  for (const n of meshNodes) {
    if (!partIds.has(n)) fail(`scene "${id}": GLB mesh node "${n}" has no manifest part`);
  }
  for (const p of partIds) {
    if (!meshNodes.has(p)) fail(`scene "${id}": manifest part "${p}" has no GLB mesh node (the "Cylinder.007" class — rename via prepare-mesh)`);
  }
}

function checkSmoke(id: string, m: SceneManifest): void {
  try {
    const schema = buildSceneStepSchema(m);
    const valid = VALID_PLANS[id];
    if (!valid || valid.length === 0) {
      fail(`scene "${id}": no valid smoke fixture`);
    } else {
      for (let i = 0; i < valid.length; i++) {
        const result = schema.safeParse(valid[i]);
        if (!result.success) {
          const detail = result.error.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join("; ");
          fail(`scene "${id}": valid fixture step ${i} rejected — ${detail}`);
        }
      }
    }
    for (const bad of INVALID_PLANS) {
      if (bad.scene !== id) continue;
      if (schema.safeParse(bad.payload).success) {
        fail(`scene "${id}": corrupted fixture ACCEPTED — ${bad.name}`);
      }
    }
  } catch (err) {
    fail(`scene "${id}": schema build threw — ${err instanceof Error ? err.message : String(err)}`);
  }
}

function checkScene(id: string, m: SceneManifest): void {
  if (m.id !== id) fail(`scene key "${id}" != manifest.id "${m.id}"`);
  if (!ALLOWED_LICENSES.has(m.license.license)) fail(`scene "${id}": license "${m.license.license}" is not CC0/PD`);
  if (!/^https?:\/\/\S+$/.test(m.license.source)) fail(`scene "${id}": license.source is not an http(s) URL: ${m.license.source}`);
  if (m.license.attribution.trim() === "") fail(`scene "${id}": attribution is empty`);
  if (m.keywords.length === 0) fail(`scene "${id}": keywords empty (routing lexicon)`);
  for (const [list, what] of [
    [m.parts, "part"],
    [m.anchors, "anchor"],
    [m.shots, "shot"],
  ] as const) {
    for (const dup of findDupIds(list)) fail(`scene "${id}": duplicate ${what} id "${dup}"`);
  }
  const partIds = new Set(m.parts.map((p) => p.id));
  for (const a of m.anchors) {
    if (!partIds.has(a.partId)) fail(`scene "${id}": anchor "${a.id}" references unknown part "${a.partId}"`);
  }

  if (m.status !== "live") return; // wip: type-checked only, never routed (spec §4.1)

  if (m.parts.length === 0) fail(`scene "${id}" (live): no parts`);
  if (m.shots.length === 0) fail(`scene "${id}" (live): no shots`);
  if (m.anchors.length === 0) fail(`scene "${id}" (live): no anchors`);

  for (const s of m.shots) {
    const coords = [...s.pos, ...s.target];
    if (!coords.every(finite)) {
      fail(`scene "${id}" shot "${s.id}": non-finite coordinate`);
    } else if (coords.some((v) => Math.abs(v) > MAX_POSE_COORD)) {
      fail(`scene "${id}" shot "${s.id}": |coord| > ${MAX_POSE_COORD}`);
    }
    if (!(s.fov >= MIN_FOV && s.fov <= MAX_FOV)) {
      fail(`scene "${id}" shot "${s.id}": fov ${s.fov} outside [${MIN_FOV}, ${MAX_FOV}]`);
    }
    const dist = Math.hypot(
      s.pos[0] - s.target[0],
      s.pos[1] - s.target[1],
      s.pos[2] - s.target[2],
    );
    if (dist < MIN_CAM_DISTANCE) {
      fail(`scene "${id}" shot "${s.id}": camera distance ${dist.toFixed(3)} < ${MIN_CAM_DISTANCE} (degenerate lookAt)`);
    }
  }
  for (const a of m.anchors) {
    if (!a.pos.every(finite)) {
      fail(`scene "${id}" anchor "${a.id}": non-finite pos`);
    } else if (a.pos.some((v) => Math.abs(v) > MAX_ANCHOR_COORD)) {
      fail(`scene "${id}" anchor "${a.id}": |coord| > ${MAX_ANCHOR_COORD}`);
    }
  }

  checkMeshAsset(id, m);
  checkSmoke(id, m);
}

function main(): void {
  const entries = Object.entries(SCENES);
  if (entries.length === 0) fail("catalog is empty");
  for (const [id, m] of entries) checkScene(id, m);
  for (const bad of INVALID_PLANS) {
    if (!Object.prototype.hasOwnProperty.call(SCENES, bad.scene)) {
      fail(`fixture "${bad.name}" references unknown scene "${bad.scene}"`);
    }
  }
  if (issues.length > 0) {
    console.error(`scenes:validate FAILED — ${issues.length} issue(s):`);
    for (const i of issues) console.error(`  x ${i}`);
    process.exit(1);
  }
  for (const w of warnings) console.warn(`  ! ${w}`);
  console.log(`scenes:validate OK — ${entries.length} scene(s), ${warnings.length} warning(s)`);
}

main();
```

- [ ] **Step 3: Add the npm script**

In `server/package.json`, add to `"scripts"`:

```json
"scenes:validate": "tsx src/scenes/validate.ts"
```

- [ ] **Step 4: Run the gate (first green)**

Run (cwd `server/`): `npm run scenes:validate`
Expected: exit 0, stdout `scenes:validate OK — 1 scene(s), 0 warning(s)`.

- [ ] **Step 5: Commit (green state — drills below rely on `git checkout` restoring it)**

```powershell
git add server/src/scenes server/package.json
git commit -m "feat: add scenes:validate quality gate"
```

- [ ] **Step 6: RED drill A — manifest drift must be caught (Review Focus 1)**

Edit `server/src/scenes/catalog.ts`: change `bytes: 36_676` → `bytes: 36_600`.
Run: `npm run scenes:validate`
Expected: **exit 1**, stderr names `manifest.bytes 36600 != file 36676`.
Restore: `git checkout -- server/src/scenes/catalog.ts`

- [ ] **Step 7: RED drill B — pose check must fire (Review Focus 3)**

Edit `server/src/scenes/catalog.ts`: in shot `overview`, change `fov: 45` → `fov: 999`.
Run: `npm run scenes:validate`
Expected: **exit 1**, stderr names `shot "overview": fov 999 outside [15, 120]`.
Restore: `git checkout -- server/src/scenes/catalog.ts`

- [ ] **Step 8: RED drill C — the rejection assertion itself must be falsifiable (Review Focus 4)**

Edit `server/src/scenes/fixtures/smokePlans.ts`: in the `strict unknown field` entry, delete `cameraZoom: 3` (the payload is now valid).
Run: `npm run scenes:validate`
Expected: **exit 1**, stderr names `corrupted fixture ACCEPTED — strict unknown field`.
Restore: `git checkout -- server/src/scenes/fixtures/smokePlans.ts`

- [ ] **Step 9: Confirm clean green state**

Run: `npm run scenes:validate`
Expected: exit 0, `scenes:validate OK — 1 scene(s), 0 warning(s)`; `git status --porcelain` shows no modified files.

---

### Task 5: Full verification gates + wiki

**Files:**
- Modify: `docs/wiki/architecture.md` (new subsection)
- Modify: `docs/wiki/index.md` (repository-layout tree)

**Interfaces:**
- Consumes: everything from Tasks 1–4 (runs the full gate suite against it).
- Produces: wiki documentation per `AGENTS.md` ("always update `docs/wiki/*.md` for new major components"); standing instruction that every later verification pass includes `scenes:validate`.

- [ ] **Step 1: Client gates (zero-change proof)**

```powershell
cd client
npx tsc --noEmit                      # Expected: exit 0
npm run build                          # Expected: success
npx eslint src/components src/lib src/hooks   # Expected: exactly 3 errors (baseline — delta 0)
cd ..
```
Client code was not touched this plan; any deviation from the 3-error baseline is a regression.

- [ ] **Step 2: Server + scene gates**

```powershell
cd server
npx tsc --noEmit                      # Expected: exit 0
npm run scenes:validate               # Expected: scenes:validate OK — 1 scene(s), 0 warning(s)
cd ..
```

- [ ] **Step 3: Update `docs/wiki/architecture.md`**

Insert this subsection inside `## Server Architecture`, immediately **after** the `### Library Modules` section and **before** `### Process Lifecycle & Graceful Shutdown`:

```markdown
### Scene Catalog & Asset Pipeline (`server/src/scenes/`)

Server-owned source of truth for 3D scenes (spec §4). **Never sent to the client.**

| File | Role |
|------|------|
| `types.ts` | `SceneManifest` (mesh/procedural asset union, parts/anchors/shots, keywords, license) + `SceneStepPayload` (ID-domain step the LLM emits) |
| `catalog.ts` | `SCENES: Record<string, SceneManifest>` — currently `heart` (live) |
| `schemas.ts` | `buildSceneStepSchema(manifest)` — strict zod schema; `z.enum` per ID list rejects hallucinated scene/shot/part/anchor IDs |
| `validate.ts` | `npm run scenes:validate` gate: budgets (≤150k tris, ≤2MB target/5MB cap), pose sanity (fov 15–120, coords ≤100, camera distance ≥0.1), manifest↔file drift (exact bytes/tris), GLB mesh-node↔parts match, license (CC0/PD + source URL + attribution), schema smoke (valid + corrupted fixtures). Parses the GLB container JSON directly — works on meshopt-compressed files NodeIO refuses. |
| `fixtures/smokePlans.ts` | Valid + must-reject plan payloads for the smoke gate |
| `tools/prepare-mesh.ts` | QC tool: `prepare` renames nodes via `tools/maps/*.json` and normalizes (bounds center → origin, max dim → 2.0); `report` prints bytes/tris/per-node centers (uncompressed GLBs only) |

Scene assets live at `client/public/scenes/*.glb`, fetched by URL at render time (no remote runtime fetches). Deviations from spec §4.3: textures compressed with **WebP** instead of KTX2 (KTX-Software 4.4+ native binary unavailable on this host; revisit if VRAM becomes a concern). Every verification pass runs `npm run scenes:validate` alongside tsc/build/eslint.
```

- [ ] **Step 4: Update `docs/wiki/index.md` repository tree**

Inside the fenced Repository Layout block, make two line insertions:

After the `|       |-- lib/` line, add:

```text
|       |-- scenes/                # Scene catalog, QC tools, validate gate
```

After the `-- client/` line, add:

```text
    |-- public/                   # Static assets: scenes/heart.glb
```

(Keep the box-drawing `|` / `` ` `` characters aligned with the surrounding tree.)

- [ ] **Step 5: Re-run the wiki-mandated gate once (post-edit sanity)**

Run (cwd `server/`): `npm run scenes:validate` → Expected: exit 0.
Run (cwd `client/`): `npx tsc --noEmit` → Expected: exit 0.

- [ ] **Step 6: Commit**

```powershell
git add docs/wiki/architecture.md docs/wiki/index.md
git commit -m "docs: wiki for scene catalog and asset pipeline"
```

---

## Notes for later plans (carry forward)

**Plan 3 (Scene3DStage + workshop):**
- Asset URL `/scenes/heart.glb` — the file's `extensionsRequired` includes `EXT_meshopt_compression` and `EXT_texture_webp`: the renderer **must configure a MeshoptDecoder** (verify drei `useGLTF` meshopt support; fallback: re-run optimize with `--compress quantize`) and confirm GLTFLoader WebP texture support. This was empirically surfaced during Plan 2 — do not rediscover it in the renderer.
- `prepare-mesh report` cannot read optimized files (NodeIO needs the meshopt decoder); measure compressed assets via `scenes:validate` or the container-JSON one-liner from Task 2 Step 7.
- Anchors sit ~0.044 units in front of heart surfaces (`z=+0.24` vs surface ≈0.196) — callout pins need no extra offset.
- Validated pose envelope: |coord| ≤ 100, fov ∈ [15,120], camera distance ≥ 0.1 — the workshop may extend `shots`/`anchors` freely within it, then re-run `scenes:validate`.
- Poster-verified part colors: red=center, purple=TL, pink=TR, green=BL, blue=BR (labels in `parts[].label`).

**Plan 4 (router + sequencer):**
- `SceneStepPayload` + `buildSceneStepSchema` are the strict-schema building blocks: build boot-time schemas from `SCENES` (spec §4.1 "built at boot from this import").
- Router lexicon = `manifest.keywords`; scene enum = `Object.keys(SCENES)`; `routes:check` golden table (spec §4.4 bullet 3) lands here.

**Every subsequent plan:** add `cd server && npm run scenes:validate` to its verification-pass gate list (spec §4.4).
