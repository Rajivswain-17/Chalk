"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import type { SceneCallout, SceneShot, SceneStep, Vec3 } from "@/lib/visualize";
import { SceneErrorBoundary } from "./SceneErrorBoundary";

const toVec3 = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z);

const GLOW = "#f59e0b"; // amber-500 — the existing glow language

const FRAME_BUDGET_MS = 1000 / 30; // above ~30ms avg → drop post-FX (spec §5)

function applyEmissive(mesh: THREE.Object3D, on: boolean, intensity: number) {
  const m = mesh as THREE.Mesh;
  if (!m.isMesh) return;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const mat of mats) {
    const std = mat as THREE.MeshStandardMaterial;
    if (!std.emissive) continue;
    std.emissive.set(on ? GLOW : "#000000");
    std.emissiveIntensity = on ? intensity : 0;
  }
}

function Model({ step }: { step: SceneStep }) {
  // draco off, meshopt ON: heart.glb requires EXT_meshopt_compression (Ruling 4).
  const { scene } = useGLTF(step.assetUrl, false, true);
  const highlighted = useMemo(() => new Set(step.highlights), [step.highlights]);

  useEffect(() => {
    scene.traverse((o) => applyEmissive(o, highlighted.has(o.name), 0.55));
  }, [scene, highlighted]);

  useFrame(({ clock }) => {
    if (highlighted.size === 0) return;
    const pulse = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 3);
    scene.traverse((o) => {
      if (highlighted.has(o.name)) applyEmissive(o, true, pulse);
    });
  });

  return <primitive object={scene} />;
}

function Rig({ shot, resetKey }: { shot: SceneShot; resetKey: number }) {
  const goal = useMemo(
    () => ({ pos: toVec3(shot.pos), look: toVec3(shot.target), fov: shot.fov }),
    [shot]
  );
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const override = useRef(false);

  // A new step clears the user's orbit override and reclaims the camera (§5).
  useEffect(() => {
    override.current = false;
  }, [resetKey]);

  useFrame((state, dt) => {
    if (override.current || !controls.current) return;
    const k = Math.min(1, dt * 4); // frame-rate independent-ish ~1.2s settle
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.position.lerp(goal.pos, k);
    controls.current.target.lerp(goal.look, k);
    controls.current.update();
    cam.fov += (goal.fov - cam.fov) * k;
    cam.updateProjectionMatrix();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={0.6}
      maxDistance={12}
      onStart={() => {
        override.current = true;
      }}
    />
  );
}

function CalloutPins({ callouts }: { callouts: SceneCallout[] }) {
  return (
    <>
      {callouts.map((c) => (
        <Html
          key={c.anchorId}
          position={toVec3(c.pos)}
          center
          distanceFactor={6}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="animate-[fadeIn_200ms_ease-out] px-2.5 py-1 rounded-md bg-[#0c0d12]/95 border border-amber-500/40 text-amber-200 text-[11px] font-mono font-semibold shadow-lg whitespace-nowrap">
            {c.text}
          </div>
        </Html>
      ))}
    </>
  );
}

/** Samples frame time every frame; the parent latches bloom off on spikes. */
function QualityGuard({ onSample }: { onSample: (ms: number) => void }) {
  useFrame((_, dt) => onSample(dt * 1000));
  return null;
}

function PostFx({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <EffectComposer>
      <Bloom intensity={0.6} luminanceThreshold={0.2} mipmapBlur />
    </EffectComposer>
  );
}

/**
 * Tab-visibility state for the `frameloop` switch (spec §5 "pauses when
 * paused/tab hidden"). Initialized lazily with a `typeof document` guard so the
 * effect body only *subscribes* — calling `setState` synchronously inside an
 * effect is precisely what trips `react-hooks/set-state-in-effect`, which is
 * 2 of the 3 pre-existing eslint baseline errors this plan must not grow
 * (Ruling 10).
 */
function useDocumentVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export default function Scene3DStage({ step }: { step: SceneStep }) {
  const visible = useDocumentVisible();

  // Adaptive post-FX (spec §5): bloom drops — one-way, no oscillation — when
  // the rolling average frame time exceeds the 30fps budget.
  const [bloomOn, setBloomOn] = useState(true);
  const avgFrame = useRef(16);
  const sampleFrame = (ms: number) => {
    avgFrame.current = avgFrame.current * 0.9 + ms * 0.1;
    if (bloomOn && avgFrame.current > FRAME_BUDGET_MS) setBloomOn(false);
  };

  // Full GPU dispose pass on session unmount (spec §5): drop the cached GLB so
  // geometries/materials/textures are released when the player leaves.
  useEffect(() => {
    return () => {
      useGLTF.clear(step.assetUrl);
    };
  }, [step.assetUrl]);

  return (
    <div className="w-full h-full flex-1" style={{ minHeight: 420 }}>
      <SceneErrorBoundary>
        <Canvas
          camera={{
            position: step.shot.pos,
            fov: step.shot.fov,
            near: 0.01,
            far: 100,
          }}
          frameloop={visible ? "always" : "demand"}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) =>
              e.preventDefault()
            );
          }}
        >
          <color attach="background" args={["#0c0d12"]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 4, 5]} intensity={1.4} />
          <directionalLight position={[-4, -2, -3]} intensity={0.5} />
          <Suspense fallback={null}>
            <Model step={step} />
          </Suspense>
          <CalloutPins key={step.stepIndex} callouts={step.callouts} />
          <Rig shot={step.shot} resetKey={step.stepIndex} />
          <QualityGuard onSample={sampleFrame} />
          <PostFx enabled={bloomOn} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
