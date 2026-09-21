import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// PipelineStepper  visualizes the visual state machine stages.
// Emitted stages: planning -> rendering_step_N -> packaging_step_N -> done.

const STEPS = [
  { key: "planning", label: "Planning Visual Steps" },
  { key: "rendering", label: "Rendering Stage Elements" },
  { key: "packaging", label: "Packaging HLS Stream" },
] as const;

/** Map a raw stage string to the active step index. -1 = queued, 3 = done. */
function stageToIndex(stage: string | null): number {
  if (!stage) return -1;
  if (stage === "planning") return 0;
  if (stage === "done") return STEPS.length;
  if (stage.startsWith("rendering")) return 1;
  if (stage.startsWith("packaging")) return 2;
  const prefix = stage.replace(/_step_\d+$/, "").replace(/_scene_\d+$/, "");
  const index = STEPS.findIndex((s) => s.key === prefix);
  return index >= 0 ? index : -1;
}

/** Extract the step number from rendering_step_2 -> 2 (0-based or 1-based). */
function stageScene(stage: string | null): number {
  const match = stage?.match(/_step_(\d+)$/) || stage?.match(/_scene_(\d+)$/);
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
            ? `Step ${Math.min(completedScenes + 1, totalScenes)} of ${totalScenes}`
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
                <Check className="size-4 shrink-0 text-emerald-500" />
              ) : current ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-amber-500" />
              ) : (
                <span className="size-4 shrink-0 rounded-full border border-muted-foreground/40" />
              )}
              <span>{step.label}</span>
              {current && scene >= 0 && totalScenes && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {scene}/{totalScenes}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
