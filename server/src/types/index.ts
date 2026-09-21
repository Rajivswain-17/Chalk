export type AspectRatio = "16:9" | "9:16";
export type VideoStatus = "pending" | "processing" | "completed" | "failed";
export type JobStatus = "queued" | "active" | "retrying" | "completed" | "failed";

export type BaseGenerationStage =
  | "planning"
  | "rendering"
  | "packaging"
  | "retrying"
  | "done";

/** Scene-specific stages are persisted as values such as `rendering_step_2`. */
export type GenerationStage =
  | BaseGenerationStage
  | `rendering_step_${number}`
  | `packaging_step_${number}`;

export interface LogicRule {
  line: number;
  text: string;
}

export interface StageElement {
  id: string;
  label: string;
  subLabel?: string | null;
  highlight?: boolean;
  highlightColor?: "orange" | "blue" | "green" | "red" | null;
  pointerLabel?: string | null;
  pointerPosition?: "top" | "bottom" | null;
  pointerColor?: "orange" | "blue" | null;
}

export interface StateVariable {
  key: string;
  value: string;
}

export interface VisualStateStep {
  stepIndex: number;
  totalSteps: number;
  conceptTitle: string;
  subtitle: string;
  stageType: "array_boxes" | "comparison_cards" | "stat_scale" | "flow_nodes";
  stageElements: StageElement[];
  logicRules: LogicRule[];
  activeLine: number;
  stateVariables: StateVariable[];
  caption: string;
  durationSeconds: number;
}

export interface SceneLayout {
  step: VisualStateStep;
  aspectRatio: AspectRatio;
  backgroundColor?: string;
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
