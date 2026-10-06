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
