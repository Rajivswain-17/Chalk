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
