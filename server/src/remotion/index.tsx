import { Composition, registerRoot } from "remotion";
import { WhiteboardScene, type WhiteboardSceneProps } from "./WhiteboardScene";
import type { VisualStateStep } from "../types";

const defaultStep: VisualStateStep = {
  stepIndex: 1,
  totalSteps: 1,
  conceptTitle: "Chalk Visual Explainer",
  subtitle: "Visual State Machine",
  stageType: "array_boxes",
  stageElements: [
    { id: "e1", label: "42", subLabel: "arr[0]", highlight: true, pointerLabel: "pointer" }
  ],
  logicRules: [
    { line: 1, text: "Initialize stage variables" }
  ],
  activeLine: 1,
  stateVariables: [
    { key: "status", value: "active" }
  ],
  caption: "Demonstration of step-by-step visual explainer state machine.",
  durationSeconds: 5,
};

const defaultProps: WhiteboardSceneProps = {
  layout: {
    step: defaultStep,
    aspectRatio: "16:9",
    backgroundColor: "#0d1117",
  },
  durationInFrames: 150,
  width: 1920,
  height: 1080,
};

function RemotionRoot() {
  return (
    <Composition
      id="WhiteboardScene"
      component={WhiteboardScene}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={150}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.durationInFrames,
        width: props.width,
        height: props.height,
      })}
    />
  );
}

registerRoot(RemotionRoot);
