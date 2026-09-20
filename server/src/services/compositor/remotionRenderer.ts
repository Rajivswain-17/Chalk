import { access, mkdir, readFile } from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { jobAttemptDir } from "../../lib/artifacts";
import { env } from "../../lib/env";
import { probeDuration } from "../../lib/media";
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

  // Bundling is expensive, so one worker creates it once and reuses it for all
  // scenes. The source entrypoint remains available in both dev and Docker.
  bundlePromise ??= bundle({
    entryPoint: path.resolve(process.cwd(), "src/remotion/index.tsx"),
  });
  return bundlePromise;
}

/** Render one validated scene to an attempt-isolated MP4 file. */
export async function renderScene(
  layout: SceneLayout,
  sceneIndex: number,
  aspectRatio: AspectRatio,
  jobId: string,
  attempt: number,
): Promise<string> {
  const width = aspectRatio === "9:16" ? 1080 : 1920;
  const height = aspectRatio === "9:16" ? 1920 : 1080;
  const audioSeconds = await probeDuration(layout.audioFile);
  const durationInFrames = Math.max(1, Math.ceil(audioSeconds * FPS) + 15);
  const audio = await readFile(layout.audioFile);
  const audioSource = `data:audio/mpeg;base64,${audio.toString("base64")}`;
  const inputProps: WhiteboardSceneProps = {
    layout,
    audioSource,
    durationInFrames,
    width,
    height,
  };

  const scenesDir = path.join(jobAttemptDir(jobId, attempt), "scenes");
  await mkdir(scenesDir, { recursive: true });
  const outputPath = path.join(
    scenesDir,
    `scene_${String(sceneIndex + 1).padStart(3, "0")}.mp4`,
  );

  try {
    const serveUrl = await getBundleLocation();
    const commonBrowserOptions = env.CHROMIUM_PATH
      ? { browserExecutable: env.CHROMIUM_PATH }
      : {};
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
      ...commonBrowserOptions,
    });
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      codec: "h264",
      outputLocation: outputPath,
      overwrite: true,
      ...commonBrowserOptions,
    });
    return outputPath;
  } catch (error) {
    throw new Error(
      `compositor: scene ${sceneIndex}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
