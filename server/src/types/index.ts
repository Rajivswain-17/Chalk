
export type AspectRatio = "16:9" | "9:16";


export type JobStatus = "queued" | "active" | "completed" | "failed";


export type VideoStatus = "pending" | "processing" | "completed" | "failed";



export type GenerationStage =
  | "planning"
  | "scripting"
  | "voice_synthesis"
  | "scene_design"
  | "icon_resolution"
  | "rendering"
  | "packaging"
  | "done";

export interface WordTimestamp {
  /** The spoken token, e.g. "photosynthesis". Punctuation stripped. */
  word: string;
  /** Start offset from the scene audio head, in milliseconds. */
  startMs: number;
  /** End offset from the scene audio head, in milliseconds. */
  endMs: number;
}

/**
 * Word timings keyed by word index (0 = first word of scene narration).
 * Record (not array) so the mapper can sparsely fill / patch entries and the
 * compositor can O(1)-lookup the active word per frame.
 */
export type WordTimestampMap = Record<number, WordTimestamp>;

/**
 * One scene's voiceover script (output of the scriptwriter agent).
 * Pure text + estimates — no layout yet (layout comes from sceneDesigner).
 */
export interface SceneScript {
  /** Zero-based position in the video (0 = opener). Defines render order. */
  sceneIndex: number;
  /** Short heading, e.g. "Chlorophyll absorbs light". Used for progress UI. */
  title: string;
  /** Full voiceover text sent to ElevenLabs for this scene. */
  narration: string;
  /** Planner's pre-TTS guess at scene length. Replaced by real mp3 duration. */
  durationEstimateSeconds: number;
}

/**
 * A single drawable item on the 1920×1080 whiteboard canvas.
 * Emitted by the sceneDesigner agent, validated by sceneLayoutSchema.
 */
export interface VisualElement {
  /** Draw primitive: text/icon/arrow/rectangle/circle/line (Rough.js ops). */
  type: "text" | "icon" | "arrow" | "rectangle" | "circle" | "line";
  /** Left edge in canvas pixels (0–1920 for 16:9; 0–1080 for 9:16). */
  x: number;
  /** Top edge in canvas pixels (0–1080 for 16:9; 0–1920 for 9:16). */
  y: number;
  /** Box width in px. Optional for line/arrow (derived from endpoints). */
  width?: number;
  /** Box height in px. Optional for line/arrow. */
  height?: number;
  /** Text literal OR icon keyword (e.g. "leaf") resolved via icon services. */
  content?: string;
  /** sketch = Rough.js hand-drawn wobble; clean = crisp vector. */
  style?: "sketch" | "clean";
  /** Ms from scene start when this element animates in (synced to a word). */
  animateIn?: number;
}

/**
 * Fully-resolved scene ready for the Remotion compositor.
 * = sceneDesigner layout + ElevenLabs mp3 + mapped word timings.
 */
export interface SceneLayout {
  /** Zero-based position — must match its SceneScript.sceneIndex. */
  sceneIndex: number;
  /** Canvas fill, e.g. "#FFFFFF" whiteboard or "#0F0F0F" dark mode. */
  backgroundColor: string;
  /** All draw ops for this scene, sorted by animateIn ascending. */
  elements: VisualElement[];
  /** Absolute path to the scene narration mp3 (OUTPUT_DIR/audio/...). */
  audioFile: string;
  /** Word-level timings for lip-sync-style draw reveals. */
  wordTimestamps: WordTimestampMap;
}

/**
 * BullMQ job payload (`video-jobs` queue). Enqueued by the controller after
 * inserting videos + generation_jobs rows; consumed by services/queue/worker.
 * Minimal by design — worker re-reads DB for the rest (single source of truth).
 */
export interface VideoJob {
  /** DB job row id (generation_jobs.id) — worker updates progress against it. */
  jobId: string;
  /** Parent video row id (videos.id) — owns output files + final status. */
  videoId: string;
  /** Original user prompt (verbatim) — planner input, preserved for retries. */
  prompt: string;
  /** Canvas shape — threads through to sceneDesigner + Remotion dimensions. */
  aspectRatio: AspectRatio;
}

/**
 * One Server-Sent Event pushed on GET /api/videos/:id/events.
 * - PROGRESS: { stage: GenerationStage, progress: 0–100 }
 * - SCENE_READY: { sceneIndex, totalScenes }
 * - COMPLETED: { outputUrl }
 * - ERROR: { message }
 */
export interface SSEEvent {
  /** Channel discriminator — frontend switches rendering on this. */
  type: "PROGRESS" | "SCENE_READY" | "COMPLETED" | "ERROR";
  /** DB job id (generation_jobs.id) so clients can ignore stale streams. */
  jobId: string;
  /** Event-specific payload (see docblock above for per-type keys). */
  data: Record<string, unknown>;
}
