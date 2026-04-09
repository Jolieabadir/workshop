'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';
import { IdeaNode } from './IdeaNode';
import { ConnectionLine } from './ConnectionLine';
import { BuilderAvatar } from './BuilderAvatar';
import { HandCursor } from './HandCursor';
import { SpatialEngine } from './SpatialEngine';
import { PostProcessing } from './PostProcessing';

// Smoothing factor for camera movement (lower = smoother)
const CAMERA_SMOOTHING = 0.04;

function HandControlledOrbitControls() {
  const controlsRef = useRef<OrbitControlsType>(null);

  // Get camera control state from left hand
  const cameraControl = useHandStore((s) => s.cameraControl);
  const isTracking = useHandStore((s) => s.isTracking);
  const leftHandDetected = useHandStore((s) => s.leftHand.isDetected);

  // Disable mouse controls when hand tracking is active to prevent fighting
  const disableMouseControls = isTracking && leftHandDetected;

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !cameraControl.isActive) return;

    // Apply camera rotation deltas from left hand
    // Azimuth = horizontal rotation (left-right)
    // Polar = vertical rotation (up-down)

    if (cameraControl.azimuthDelta !== 0) {
      // Smoothly rotate horizontally
      const targetAzimuth = controls.getAzimuthalAngle() + cameraControl.azimuthDelta * CAMERA_SMOOTHING;
      controls.setAzimuthalAngle(targetAzimuth);
    }

    if (cameraControl.polarDelta !== 0) {
      // Smoothly rotate vertically (clamped by OrbitControls min/max polar angle)
      const currentPolar = controls.getPolarAngle();
      const targetPolar = currentPolar + cameraControl.polarDelta * CAMERA_SMOOTHING;
      controls.setPolarAngle(targetPolar);
    }

    if (cameraControl.zoomDelta !== 0) {
      // Zoom in/out by adjusting distance
      const currentDistance = controls.getDistance();
      const targetDistance = currentDistance - cameraControl.zoomDelta * CAMERA_SMOOTHING;
      // Clamp to min/max distance
      const clampedDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, targetDistance));

      // Move camera to new distance while maintaining direction
      const direction = controls.target.clone().sub(controls.object.position).normalize();
      controls.object.position.copy(controls.target).sub(direction.multiplyScalar(clampedDistance));
    }

    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={2}
      maxDistance={50}
      enablePan
      // Disable mouse rotation/zoom when left hand is controlling camera
      enableRotate={!disableMouseControls}
      enableZoom={!disableMouseControls}
      // Constrain polar angle to prevent flipping
      minPolarAngle={Math.PI * 0.1}
      maxPolarAngle={Math.PI * 0.85}
    />
  );
}

function SceneContent() {
  const nodes = useCanvasStore((s) => s.nodes);
  const connections = useCanvasStore((s) => s.connections);

  return (
    <>
      {/* Environment */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <Stars radius={100} depth={50} count={2000} factor={4} fade speed={1} />
      <Grid
        position={[0, -1, 0]}
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1a1a2e"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#2a2a4e"
        fadeDistance={30}
        infiniteGrid
      />

      {/* Idea nodes */}
      {Object.values(nodes).map((node) => (
        <IdeaNode key={node.id} node={node} />
      ))}

      {/* Connections */}
      {Object.values(connections).map((conn) => (
        <ConnectionLine key={conn.id} connection={conn} />
      ))}

      {/* Builder avatar */}
      <BuilderAvatar />

      {/* Hand cursor (follows right hand tracking + handles raycasting interaction) */}
      <HandCursor />

      {/* Spatial engine (force-directed layout for nodes) */}
      <SpatialEngine />

      {/* Camera controls (responds to left hand) */}
      <HandControlledOrbitControls />

      {/* Post-processing effects (bloom, ambient occlusion, vignette) */}
      <PostProcessing />
    </>
  );
}

export function Workshop3DCanvas() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a1a' }}>
      <Canvas
        camera={{ position: [0, 3, 8], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0a0a1a' }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
