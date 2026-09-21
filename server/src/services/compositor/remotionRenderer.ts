import { access, mkdir } from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { jobAttemptDir } from "../../lib/artifacts";
import { env } from "../../lib/env";
import type { AspectRatio, SceneLayout } from "../../types";
import type { WhiteboardSceneProps } from "../../remotion/WhiteboardScene";

const FPS = 30;
const COMPOSITION_ID = "WhiteboardScene";
let bundlePromise: Promise<string> | undefined;

async function getBundleLocation(): Promise<string> {
  if (env.REMOTION_BUNDLE_PATH) {
    const configured = path.resolve(env.REMOTION_BUNDLE_PATH);
    try {
      await access(configured);
      return configured;
    } catch {
      throw new Error(`Configured Remotion bundle does not exist: ${configured}`);
    }
  }

  // Bundling is expensive, so one worker creates it once and reuses it for all steps
  bundlePromise ??= bundle({
    entryPoint: path.resolve(process.cwd(), "src/remotion/index.tsx"),
  });
  return bundlePromise;
}

/** Render one validated visual step to an attempt-isolated MP4 file (zero voice). */
export async function renderScene(
  layout: SceneLayout,
  stepIndex: number,
  aspectRatio: AspectRatio,
  jobId: string,
  attempt: number,
): Promise<string> {
  const width = aspectRatio === "9:16" ? 1080 : 1920;
  const height = aspectRatio === "9:16" ? 1920 : 1080;
  const durationInFrames = Math.max(90, Math.ceil((layout.step.durationSeconds || 5) * FPS));

  const inputProps: WhiteboardSceneProps = {
    layout,
    durationInFrames,
    width,
    height,
  };

  const scenesDir = path.join(jobAttemptDir(jobId, attempt), "scenes");
  await mkdir(scenesDir, { recursive: true });
  const outputPath = path.join(
    scenesDir,
    `scene_${String(stepIndex + 1).padStart(3, "0")}.mp4`,
  );

  try {
    const serveUrl = await getBundleLocation();
    const browserExecutable = env.CHROMIUM_PATH || undefined;
    const chromiumOptions = {
      enableMultiProcessOnLinux: true,
    };

    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
      ...(browserExecutable ? { browserExecutable } : {}),
      chromiumOptions,
    });

    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      codec: "h264",
      outputLocation: outputPath,
      overwrite: true,
      ...(browserExecutable ? { browserExecutable } : {}),
      chromiumOptions,
    });

    return outputPath;
  } catch (error) {
    throw new Error(
      `compositor: step ${stepIndex}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
