// client/src/app/scene-check/page.tsx
// TEMPORARY dev route (Ruling 11): renders scene steps before the Scene Workshop
// exists (Task 8) so the meshopt/WebP decode is verifiable early. Deleted in Task 9.
import { notFound } from "next/navigation";
import { VisualExplainer } from "@/components/visual/VisualExplainer";
import type { SceneStep } from "@/lib/visualize";

const STEPS: SceneStep[] = [
  {
    kind: "scene",
    stepIndex: 0,
    title: "Hearts",
    subtitle: "Overview",
    explanation: "All five hearts in the wide establishing shot.",
    sceneId: "heart",
    shotId: "overview",
    shot: { pos: [0, 0, 4.2], target: [0, 0, 0], fov: 45 },
    assetUrl: "/scenes/heart.glb",
    highlights: [],
    callouts: [],
    notes: ["overview shot"],
  },
  {
    kind: "scene",
    stepIndex: 1,
    title: "Hearts",
    subtitle: "The center heart",
    explanation: "The red heart close up, highlighted and named by a callout pin.",
    sceneId: "heart",
    shotId: "red_closeup",
    shot: { pos: [0, 0.1, 2], target: [0, 0.04, 0], fov: 40 },
    assetUrl: "/scenes/heart.glb",
    highlights: ["heart_red"],
    callouts: [{ anchorId: "a_red", pos: [0, 0.04, 0.24], text: "Center heart" }],
    notes: ["closeup + highlight"],
  },
];

export default function SceneCheckPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="p-6">
      <VisualExplainer steps={STEPS} title="Hearts" />
    </div>
  );
}
