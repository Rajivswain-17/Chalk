// client/src/app/workshop/page.tsx
import { notFound } from "next/navigation";
import { SCENE_DEFINITIONS } from "@/lib/sceneDefinition";
import { SceneWorkshop } from "@/components/visual/scene/SceneWorkshop";

// Dev-only authoring tool (spec §4.5). Not reachable in production builds.
export default function WorkshopPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SceneWorkshop definition={SCENE_DEFINITIONS.heart} />;
}
