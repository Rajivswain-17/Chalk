import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import { attemptName, hlsAttemptDir } from "../../lib/artifacts";
import { probeDuration, runProcess } from "../../lib/media";

export const getVideoDuration = probeDuration;

function segmentName(sceneIndex: number): string {
  return `seg_${String(sceneIndex + 1).padStart(3, "0")}.ts`;
}

/**
 * Encode one complete visual scene as an MPEG-TS HLS segment.
 * Synthesizes a tiny silent audio track alongside the video frames
 * to ensure 100% universal player & iOS Safari compatibility without external TTS.
 */
export async function packageSceneToHLS(
  sceneVideoPath: string,
  sceneIndex: number,
  videoId: string,
  attempt: number,
): Promise<string> {
  const directory = hlsAttemptDir(videoId, attempt);
  await mkdir(directory, { recursive: true });
  const segmentPath = path.join(directory, segmentName(sceneIndex));

  try {
    await runProcess("ffmpeg", [
      "-y",
      "-i",
      sceneVideoPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-level:v",
      "4.1",
      "-r",
      "30",
      "-g",
      "60",
      "-keyint_min",
      "60",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-mpegts_flags",
      "+resend_headers",
      "-muxdelay",
      "0",
      "-avoid_negative_ts",
      "make_zero",
      "-f",
      "mpegts",
      segmentPath,
    ]);
    return segmentPath;
  } catch (error) {
    throw new Error(
      `hls: scene ${sceneIndex}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Atomically replace the growing event playlist after a scene is complete. */
export async function updatePlaylist(
  videoId: string,
  attempt: number,
  segmentPaths: string[],
  isFinal: boolean,
): Promise<string> {
  if (segmentPaths.length === 0) throw new Error("hls: cannot write an empty playlist");

  const directory = hlsAttemptDir(videoId, attempt);
  await mkdir(directory, { recursive: true });
  const playlistPath = path.join(directory, "playlist.m3u8");
  const durations = await Promise.all(segmentPaths.map(probeDuration));
  const targetDuration = Math.max(1, ...durations.map(Math.ceil));
  const publicBase = `/hls/${videoId}/${attemptName(attempt)}`;
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:EVENT",
  ];

  segmentPaths.forEach((segmentPath, index) => {
    if (index > 0) lines.push("#EXT-X-DISCONTINUITY");
    lines.push(`#EXTINF:${durations[index].toFixed(3)},`);
    lines.push(`${publicBase}/${path.basename(segmentPath)}`);
  });
  if (isFinal) lines.push("#EXT-X-ENDLIST");

  const temporaryPath = `${playlistPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${lines.join("\n")}\n`, "utf8");
  await rename(temporaryPath, playlistPath);
  return playlistPath;
}
