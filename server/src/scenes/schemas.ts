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
