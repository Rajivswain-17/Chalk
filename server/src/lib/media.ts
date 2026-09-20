import { spawn } from "child_process";

/**
 * Run a media binary without a shell. Using argv arrays prevents command
 * injection and streaming pipes avoid `exec`'s small output buffer.
 */
export function runProcess(
  binary: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-16_384);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16_384);
    });
    child.once("error", (error) => {
      reject(new Error(`${binary} could not start: ${error.message}`));
    });
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${binary} exited with code ${code}: ${stderr.slice(-1_000)}`));
    });
  });
}

/** Read exact media duration through ffprobe in the Node process. */
export async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe returned an invalid duration for ${filePath}`);
  }
  return seconds;
}
