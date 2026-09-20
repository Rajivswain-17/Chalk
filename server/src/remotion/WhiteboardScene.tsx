import { useEffect, useRef } from "react";
import rough from "roughjs";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { SceneLayout, VisualElement } from "../types";

const FPS = 30;
const DRAW_FRAMES = 20;

// Remotion 4 types every Composition as <Schema, Props extends Record<string,
// unknown>> and infers Props from `component`/`defaultProps`. The `extends`
// clause satisfies that constraint so inference picks this exact interface
// (instead of falling back to Record<string, unknown>, which breaks
// `component`, `calculateMetadata`, and renderer's `inputProps`).
export interface WhiteboardSceneProps extends Record<string, unknown> {
  layout: SceneLayout;
  audioSource: string;
  durationInFrames: number;
  width: number;
  height: number;
}

function startFrame(element: VisualElement): number {
  return Math.max(0, Math.round(((element.animateIn ?? 0) / 1000) * FPS));
}

/** Draw the actual Rough.js paths progressively instead of overlaying a fake box. */
function RoughElement({ element }: { element: VisualElement }) {
  const frame = useCurrentFrame();
  const svgRef = useRef<SVGSVGElement>(null);
  const start = startFrame(element);
  const progress = interpolate(frame, [start, start + DRAW_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const width = element.width ?? 200;
  const height = element.height ?? 120;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.replaceChildren();
    const renderer = rough.svg(svg);
    const options = {
      roughness: element.style === "clean" ? 0.2 : 1.5,
      bowing: element.style === "clean" ? 0.1 : 1,
      seed: 1000 + Math.round(element.x) + Math.round(element.y),
      stroke: "#171717",
      strokeWidth: 3,
    };

    if (element.type === "rectangle") {
      svg.appendChild(renderer.rectangle(2, 2, width - 4, height - 4, options));
    } else if (element.type === "circle") {
      svg.appendChild(renderer.ellipse(width / 2, height / 2, width - 4, height - 4, options));
    } else {
      svg.appendChild(renderer.line(2, height / 2, width - 2, height / 2, options));
      if (element.type === "arrow") {
        svg.appendChild(renderer.line(width - 2, height / 2, width - 25, height / 2 - 18, options));
        svg.appendChild(renderer.line(width - 2, height / 2, width - 25, height / 2 + 18, options));
      }
    }

    for (const path of svg.querySelectorAll("path")) {
      path.style.strokeDasharray = "2400";
      path.style.strokeDashoffset = String(2400 * (1 - progress));
    }
  }, [element, height, progress, width]);

  if (frame < start) return null;
  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ position: "absolute", left: element.x, top: element.y, overflow: "visible" }}
    />
  );
}

function TextElement({ element }: { element: VisualElement }) {
  const frame = useCurrentFrame();
  const start = startFrame(element);
  if (frame < start) return null;
  const opacity = interpolate(frame, [start, start + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [start, start + 10], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.width,
        color: "#171717",
        fontFamily: "Arial, sans-serif",
        fontSize: 44,
        fontWeight: 600,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {element.content}
    </div>
  );
}

function IconElement({ element }: { element: VisualElement }) {
  const frame = useCurrentFrame();
  const start = startFrame(element);
  if (frame < start || !element.svg) return null;
  const opacity = interpolate(frame, [start, start + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.svg)}`;
  return (
    <img
      src={source}
      alt=""
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.width ?? 160,
        height: element.height ?? 160,
        objectFit: "contain",
        opacity,
      }}
    />
  );
}

export function WhiteboardScene({ layout, audioSource }: WhiteboardSceneProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: layout.backgroundColor }}>
      {layout.elements.map((element, index) => {
        if (element.type === "text") {
          return <TextElement key={index} element={element} />;
        }
        if (element.type === "icon") {
          return <IconElement key={index} element={element} />;
        }
        return <RoughElement key={index} element={element} />;
      })}
      <Audio src={audioSource} />
    </AbsoluteFill>
  );
}
