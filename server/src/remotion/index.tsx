import { Composition, registerRoot } from "remotion";
import { WhiteboardScene, type WhiteboardSceneProps } from "./WhiteboardScene";

const defaultProps: WhiteboardSceneProps = {
  layout: {
    sceneIndex: 0,
    backgroundColor: "#FFFFFF",
    elements: [],
    audioFile: "",
    wordTimestamps: [],
  },
  audioSource: "",
  durationInFrames: 30,
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
      durationInFrames={30}
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
