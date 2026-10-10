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
import { serializeDefinition } from "./definition";
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
  if (20 + jsonLen > buf.length) {
    throw new Error(`${file}: JSON chunk length ${jsonLen} exceeds file size ${buf.length}`);
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
  let actualBytes: number;
  try {
    actualBytes = statSync(file).size;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`scene "${id}": asset missing or unreadable at client/public${url} — ${msg}`);
    return;
  }
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
  checkDefinition(id, m);
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
