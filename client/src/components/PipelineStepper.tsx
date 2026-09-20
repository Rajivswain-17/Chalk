import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// PipelineStepper — visualizes the worker's stage string as 7 ordered steps.
// Worker emits: planning → scripting_scene_N → voice_synthesis_scene_N →
// scene_design_scene_N → icon_resolution_scene_N → rendering_scene_N →
// packaging_scene_N → done (COMPLETED). Unknown/future stages degrade to the
// closest prefix match; unparseable stages show as queued.

const STEPS = [
  { key: "planning", label: "Planning" },
  { key: "scripting", label: "Scriptwriting" },
  { key: "voice_synthesis", label: "Voiceover" },
  { key: "scene_design", label: "Scene design" },
  { key: "icon_resolution", label: "Icons" },
  { key: "rendering", label: "Rendering" },
  { key: "packaging", label: "Streaming" },
] as const;

/** Map a raw stage string to the active step index. -1 = queued, 7 = done. */
function stageToIndex(stage: string | null): number {
  if (!stage) return -1;
  if (stage === "planning") return 0;
  if (stage === "done") return STEPS.length;
  const prefix = stage.replace(/_scene_\d+$/, "");
  const index = STEPS.findIndex((s) => s.key === prefix);
  return index; // -1 for unknown stages → renders as queued, never crashes.
}

/** Extract the scene number from `rendering_scene_2` → 2 (0-based, -1 if none). */
function stageScene(stage: string | null): number {
  const match = stage?.match(/_scene_(\d+)$/);
  return match ? Number(match[1]) : -1;
}

interface PipelineStepperProps {
  stage: string | null;
  progress: number;
  completedScenes: number;
  totalScenes: number | null;
}

export function PipelineStepper({
  stage,
  progress,
  completedScenes,
  totalScenes,
}: PipelineStepperProps) {
  const active = stageToIndex(stage);
  const scene = stageScene(stage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={active >= STEPS.length ? "default" : "secondary"}>
          {active >= STEPS.length
            ? "Ready to watch"
            : active < 0
              ? "Queued"
              : STEPS[active].label}
        </Badge>
        <span className="text-sm text-muted-foreground tabular-nums">
          {totalScenes
            ? `Scene ${Math.min(completedScenes + 1, totalScenes)} of ${totalScenes}`
            : `${progress}%`}
        </span>
      </div>

      <Progress value={progress} aria-label="Render progress" />

      <ol className="space-y-1">
        {STEPS.map((step, i) => {
          const done = i < active || active >= STEPS.length;
          const current = i === active;
          return (
            <li
              key={step.key}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                current && "bg-muted font-medium",
                !done && !current && "text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="size-4 shrink-0 text-green-600" />
              ) : current ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <span className="size-4 shrink-0 rounded-full border border-muted-foreground/40" />
              )}
              <span>{step.label}</span>
              {current && scene >= 0 && totalScenes && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {scene + 1}/{totalScenes}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
