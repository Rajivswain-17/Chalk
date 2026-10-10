"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SceneCallout, SceneStep, Vec3 } from "@/lib/visualize";
import { SceneErrorBoundary } from "./SceneErrorBoundary";

const toVec3 = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z);

function Model({ step }: { step: SceneStep }) {
  // draco off, meshopt ON: heart.glb requires EXT_meshopt_compression (Ruling 4).
  const { scene } = useGLTF(step.assetUrl, false, true);
  return <primitive object={scene} />;
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
          <div className="px-2.5 py-1 rounded-md bg-[#0c0d12]/95 border border-amber-500/40 text-amber-200 text-[11px] font-mono font-semibold shadow-lg whitespace-nowrap">
            {c.text}
          </div>
        </Html>
      ))}
    </>
  );
}

export default function Scene3DStage({ step }: { step: SceneStep }) {
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
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#0c0d12"]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 4, 5]} intensity={1.4} />
          <directionalLight position={[-4, -2, -3]} intensity={0.5} />
          <Suspense fallback={null}>
            <Model step={step} />
          </Suspense>
          <CalloutPins callouts={step.callouts} />
          <OrbitControls makeDefault enablePan={false} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
