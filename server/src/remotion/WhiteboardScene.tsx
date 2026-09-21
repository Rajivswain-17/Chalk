import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneLayout, VisualStateStep } from "../types";

export interface WhiteboardSceneProps extends Record<string, unknown> {
  layout: SceneLayout;
  durationInFrames: number;
  width: number;
  height: number;
}

export function WhiteboardScene({ layout }: WhiteboardSceneProps) {
  const frame = useCurrentFrame();
  const step = layout.step;

  // Animations based on frame (30 fps)
  // Header: 0 - 15 frames
  const headerOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const headerTranslateY = interpolate(frame, [0, 12], [-15, 0], { extrapolateRight: "clamp" });

  // Panels: 10 - 25 frames
  const panelOpacity = interpolate(frame, [8, 22], [0, 1], { extrapolateRight: "clamp" });

  // Stage elements: 15 - 30 frames
  const stageOpacity = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: "clamp" });
  const stageScale = interpolate(frame, [12, 28], [0.96, 1], { extrapolateRight: "clamp" });

  // Caption: 20 - 35 frames
  const captionOpacity = interpolate(frame, [18, 32], [0, 1], { extrapolateRight: "clamp" });
  const captionTranslateY = interpolate(frame, [18, 32], [15, 0], { extrapolateRight: "clamp" });

  // Highlight pulse: smooth sine glow
  const pulse = Math.sin(frame / 6) * 0.2 + 0.8;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: layout.backgroundColor || "#0B0D13",
        color: "#F1F5F9",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        padding: "48px 64px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          opacity: headerOpacity,
          transform: `translateY(${headerTranslateY}px)`,
          marginBottom: "32px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#F59E0B",
              marginBottom: "6px",
            }}
          >
            CONCEPT
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "36px",
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: "-0.02em",
              }}
            >
              {step.conceptTitle}
            </h1>
            <div
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                padding: "4px 14px",
                borderRadius: "20px",
                fontSize: "15px",
                color: "#94A3B8",
                fontWeight: 500,
              }}
            >
              {step.subtitle}
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <div
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#FBBF24",
              padding: "6px 16px",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
          >
            STEP {step.stepIndex + 1} / {step.totalSteps}
          </div>
          {/* Progress dots */}
          <div style={{ display: "flex", gap: "6px" }}>
            {Array.from({ length: step.totalSteps }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === step.stepIndex ? "18px" : "6px",
                  height: "6px",
                  borderRadius: "3px",
                  background: i === step.stepIndex ? "#F59E0B" : "rgba(255, 255, 255, 0.2)",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Workspace (Stage on Left, Logic/State on Right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.45fr 1fr",
          gap: "36px",
          flex: 1,
          alignItems: "center",
          minHeight: 0,
        }}
      >
        {/* Left: The Visual Stage */}
        <div
          style={{
            background: "radial-gradient(ellipse at center, #151824 0%, #0F121C 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "20px",
            height: "100%",
            maxHeight: "520px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "36px",
            position: "relative",
            opacity: stageOpacity,
            transform: `scale(${stageScale})`,
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Stage Element Layouts */}
          {step.stageType === "comparison_cards" ? (
            <div style={{ display: "flex", gap: "28px", width: "100%", justifyContent: "center" }}>
              {step.stageElements.map((el) => {
                const isHighlight = el.highlight;
                const borderColor = el.highlightColor === "orange" ? "#F59E0B" : el.highlightColor === "green" ? "#10B981" : el.highlightColor === "red" ? "#EF4444" : "#38BDF8";
                return (
                  <div
                    key={el.id}
                    style={{
                      flex: 1,
                      maxWidth: "260px",
                      background: isHighlight ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 255, 255, 0.03)",
                      border: isHighlight ? `3px solid ${borderColor}` : "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "16px",
                      padding: "24px 20px",
                      textAlign: "center",
                      boxShadow: isHighlight ? `0 0 30px ${borderColor}33` : "none",
                      transform: isHighlight ? `scale(${1 + (pulse - 0.8) * 0.08})` : "scale(1)",
                    }}
                  >
                    <div style={{ fontSize: "28px", fontWeight: 800, color: isHighlight ? borderColor : "#FFFFFF", marginBottom: "8px" }}>
                      {el.label}
                    </div>
                    {el.subLabel && (
                      <div style={{ fontSize: "16px", color: "#94A3B8", fontWeight: 600 }}>
                        {el.subLabel}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Default Array Boxes / Flow Nodes
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
              {step.stageElements.map((el) => {
                const isHighlight = el.highlight;
                const borderColor = el.highlightColor === "blue" ? "#38BDF8" : el.highlightColor === "green" ? "#10B981" : "#F59E0B";
                return (
                  <div
                    key={el.id}
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      margin: "12px 6px",
                    }}
                  >
                    {/* Top Pointer if any */}
                    {el.pointerPosition === "top" && el.pointerLabel && (
                      <div
                        style={{
                          marginBottom: "8px",
                          fontSize: "14px",
                          fontWeight: 700,
                          color: el.pointerColor === "blue" ? "#38BDF8" : "#F59E0B",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <span>{el.pointerLabel}</span>
                        <span style={{ fontSize: "12px" }}>▼</span>
                      </div>
                    )}

                    {/* The Cell / Box */}
                    <div
                      style={{
                        minWidth: "76px",
                        height: "82px",
                        padding: "0 18px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        background: isHighlight ? "rgba(245, 158, 11, 0.12)" : "rgba(255, 255, 255, 0.04)",
                        border: isHighlight ? `3px solid ${borderColor}` : "1.5px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "14px",
                        fontSize: "30px",
                        fontWeight: 800,
                        color: isHighlight ? "#FFFFFF" : "#CBD5E1",
                        boxShadow: isHighlight ? `0 0 24px ${borderColor}40` : "none",
                        transform: isHighlight ? `scale(${1 + (pulse - 0.8) * 0.06})` : "scale(1)",
                      }}
                    >
                      {el.label}
                    </div>

                    {/* Sub-label / Index below */}
                    {el.subLabel && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "14px",
                          color: "#64748B",
                          fontWeight: 600,
                        }}
                      >
                        {el.subLabel}
                      </div>
                    )}

                    {/* Bottom Pointer if any */}
                    {el.pointerPosition === "bottom" && el.pointerLabel && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "14px",
                          fontWeight: 700,
                          color: el.pointerColor === "blue" ? "#38BDF8" : "#F59E0B",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: "12px" }}>▲</span>
                        <span>{el.pointerLabel}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: The Logic Panel & State Box */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%", maxHeight: "520px", opacity: panelOpacity }}>
          {/* Logic / Rules Card */}
          <div
            style={{
              flex: 1,
              background: "#131620",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "22px 24px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#94A3B8",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "16px",
              }}
            >
              LOGIC & RULES
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, justifyContent: "center" }}>
              {step.logicRules.map((rule) => {
                const isActive = rule.line === step.activeLine;
                return (
                  <div
                    key={rule.line}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      background: isActive ? "rgba(245, 158, 11, 0.16)" : "transparent",
                      borderLeft: isActive ? "3px solid #F59E0B" : "3px solid transparent",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <span style={{ fontSize: "14px", fontFamily: "monospace", color: isActive ? "#FBBF24" : "#475569", width: "18px" }}>
                      {rule.line}
                    </span>
                    <span
                      style={{
                        fontSize: "16px",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        color: isActive ? "#FFFFFF" : "#94A3B8",
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {rule.text}
                    </span>
                    {isActive && (
                      <span style={{ marginLeft: "auto", color: "#F59E0B", fontSize: "12px" }}>
                        ▶
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live State Variables Box */}
          {step.stateVariables && step.stateVariables.length > 0 && (
            <div
              style={{
                background: "#131620",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                padding: "18px 24px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#94A3B8",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: "12px",
                }}
              >
                LIVE STATE
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                {step.stateVariables.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "14px", color: "#64748B", fontFamily: "monospace" }}>{v.key}:</span>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: "#38BDF8", fontFamily: "monospace" }}>{v.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Explanatory Caption Pill */}
      <div
        style={{
          marginTop: "28px",
          display: "flex",
          justifyContent: "center",
          opacity: captionOpacity,
          transform: `translateY(${captionTranslateY}px)`,
        }}
      >
        <div
          style={{
            background: "#161926",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "14px",
            padding: "14px 28px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            maxWidth: "85%",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          }}
        >
          <span style={{ fontSize: "18px" }}>✏️</span>
          <span
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "#E2E8F0",
              lineHeight: 1.5,
            }}
          >
            {step.caption}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
