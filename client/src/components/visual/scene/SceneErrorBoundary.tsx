"use client";

import { Component, type ReactNode } from "react";

/**
 * Render-error boundary for the lazy 3D chunk (spec §5 hardening). A GLB load
 * failure or WebGL exception degrades to an in-stage message while the player
 * chrome (dots, explanation, controls) stays mounted — never a white screen.
 */
export class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="w-full h-full flex items-center justify-center px-6 text-center text-sm text-neutral-400">
          3D scene unavailable — the model failed to load. Playback controls still work.
        </div>
      );
    }
    return this.props.children;
  }
}
