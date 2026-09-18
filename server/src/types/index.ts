// ============================================================================
// Chalk — shared TypeScript contracts (Chalk/server/src/types/index.ts)
// ----------------------------------------------------------------------------
// Single source of truth for every service boundary:
// agents (planner/scriptwriter/designer) → voice → compositor → queue → SSE.
// No logic here — only interfaces/unions. Runtime validation lives in
// src/validators/index.ts (Zod mirrors of SceneScript / SceneLayout).
// ============================================================================

/**
 * Canvas shape for the whiteboard compositor.
 * - "16:9" → 1920×1080 landscape (YouTube / embed).
 * - "9:16"  → 1080×1920 portrait (Shorts / Reels).
 * Fixed at video creation — compositor bboxes depend on it, so it is immutable
 * once the BullMQ job is enqueued (see VideoJob).
 */
export type AspectRatio = "16:9" | "9:16";

/**
 * Queue-level state of one row in `generation_jobs`.
 * - queued: waiting in Valkey (BullMQ) — worker has not picked it up.
 * - active: worker is running a GenerationStage for it.
 * - completed: packaging finished, videos.outputUrl is set.
 * - failed: terminal error — see jobs.errorMessage + videos.errorMessage.
 */
export type JobStatus = "queued" | "active" | "completed" | "failed";

/**
 * Coarse lifecycle of one row in `videos` (the user-facing intent).
 * - pending: created, no worker output yet (job may still be queued).
 * - processing: worker is actively producing scenes/audio.
 * - completed: HLS playlist ready at videos.outputUrl.
 * - failed: unrecoverable — frontend reads videos.errorMessage.
 */
export type VideoStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Fine-grained pipeline step reported by the worker.
 * Order: planning → scripting → voice_synthesis → scene_design →
 * icon_resolution → rendering → packaging → done.
 * Stored in jobs.currentStage and streamed over SSE as PROGRESS labels.
 */
export type GenerationStage =
  | "planning"
  | "scripting"
  | "voice_synthesis"
  | "scene_design"
  | "icon_resolution"
  | "rendering"
  | "packaging"
  | "done";

/**
 * One word's timing inside a scene's narration audio.
 * Produced by ElevenLabs word timestamps, normalized to milliseconds by
 * services/voice/timestampMapper.ts. The compositor uses these to reveal
 * VisualElements in sync with the voiceover (karaoke-style whiteboard draw).
 */
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
