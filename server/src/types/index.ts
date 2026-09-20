export type AspectRatio = "16:9" | "9:16";
export type VideoStatus = "pending" | "processing" | "completed" | "failed";
export type JobStatus = "queued" | "active" | "retrying" | "completed" | "failed";

export type BaseGenerationStage =
  | "planning"
  | "scripting"
  | "voice_synthesis"
  | "scene_design"
  | "icon_resolution"
  | "rendering"
  | "packaging"
  | "retrying"
  | "done";

/** Scene-specific stages are persisted as values such as `rendering_scene_2`. */
export type GenerationStage =
  | BaseGenerationStage
  | `${Exclude<BaseGenerationStage, "planning" | "retrying" | "done">}_scene_${number}`;

export interface WordTimestamp {
  /** Spoken token with boundary punctuation removed. */
  word: string;
  startMs: number;
  endMs: number;
}

/** Ordered timings are an array because word order and contiguous indexes matter. */
export type WordTimestampMap = WordTimestamp[];

export interface SceneScript {
  sceneIndex: number;
  title: string;
  narration: string;
  durationEstimateSeconds: number;
}

export type VisualElementType =
  | "text"
  | "icon"
  | "arrow"
  | "rectangle"
  | "circle"
  | "line";

export interface VisualElement {
  type: VisualElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Text value or unresolved semantic icon keyword. */
  content?: string;
  /** Sanitized SVG populated by the icon resolver, never by the AI model. */
  svg?: string;
  style?: "sketch" | "clean";
  /** Word index selected by the designer and resolved locally to milliseconds. */
  animateAtWordIndex?: number;
  animateIn?: number;
}

export interface SceneLayout {
  sceneIndex: number;
  backgroundColor: string;
  elements: VisualElement[];
  /** Server-side path. The renderer converts this to a browser-safe data URL. */
  audioFile: string;
  wordTimestamps: WordTimestampMap;
}

export interface VideoJob {
  jobId: string;
  videoId: string;
  prompt: string;
  aspectRatio: AspectRatio;
}

export type SSEEvent =
  | {
      type: "PROGRESS";
      jobId: string;
      data: { status: JobStatus; stage: string | null; progress: number };
    }
  | {
      type: "SCENE_READY";
      jobId: string;
      data: {
        sceneIndex: number;
        completedScenes: number;
        totalScenes: number;
        playlistUrl: string;
      };
    }
  | {
      type: "COMPLETED";
      jobId: string;
      data: { outputUrl: string; totalScenes: number };
    }
  | {
      type: "ERROR";
      jobId: string;
      data: { message: string };
    };
