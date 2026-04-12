'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useCanvasStore } from '@/store/canvas-store';
import type { Vec3 } from '@/core/types';

// Mechanic avatar behavior configuration (similar to Builder but slightly different)
const MECHANIC_CONFIG = {
  moveSpeed: 4, // Slightly faster than Builder (more purposeful)
  idleDriftSpeed: 0.2,
  bobAmplitude: 0.015, // Smaller bob (more precise)
  bobSpeed: 0.004, // Faster bob (more active)
  pulseSpeed: 0.006, // Ring pulse speed
  orbSize: 0.06, // Slightly smaller than Builder (0.08)
};

// Correction highlight colors by type
const CORRECTION_COLORS: Record<string, string> = {
  rotate: '#4488FF', // Blue
  move: '#44CC44', // Green
  scale: '#FF8844', // Orange
  regenerate: '#FF4444', // Red
};

const HIGHLIGHT_DURATION_MS = 600;

type MechanicMode = 'idle' | 'targeting';

/**
 * Blue glowing orb that appears during the visual feedback loop.
 * Flies to each part as it's being fixed by the Mechanic agent.
 */
export function MechanicAvatar() {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  // Mechanic state
  const modeRef = useRef<MechanicMode>('idle');
  const positionRef = useRef<Vec3>({ x: 2, y: 2, z: 2 });

  // Canvas store state
  const mechanicActive = useCanvasStore((s) => s.mechanicActive);
  const mechanicTarget = useCanvasStore((s) => s.mechanicTarget);
  const nodes = useCanvasStore((s) => s.nodes);

  // Track target changes
  const lastTargetRef = useRef<Vec3 | null>(null);

  useEffect(() => {
    if (mechanicTarget && mechanicTarget !== lastTargetRef.current) {
      modeRef.current = 'targeting';
      lastTargetRef.current = mechanicTarget;
    }
  }, [mechanicTarget]);

  useFrame((_, delta) => {
    if (!meshRef.current || !mechanicActive) return;

    const now = Date.now();
    let targetPos: Vec3;

    if (modeRef.current === 'targeting' && mechanicTarget) {
      // Move toward explicit target (offset to hover near it)
      targetPos = {
        x: mechanicTarget.x - 0.4,
        y: mechanicTarget.y + 0.5,
        z: mechanicTarget.z + 0.4,
      };

      // Check if we've reached the target
      const dist = Math.sqrt(
        Math.pow(meshRef.current.position.x - targetPos.x, 2) +
          Math.pow(meshRef.current.position.y - targetPos.y, 2) +
          Math.pow(meshRef.current.position.z - targetPos.z, 2)
      );

      if (dist < 0.1) {
        modeRef.current = 'idle';
      }
    } else {
      // Idle: stay near current position with slight drift
      targetPos = positionRef.current;
    }

    // Smooth movement toward target
    const speed =
      modeRef.current === 'idle'
        ? MECHANIC_CONFIG.idleDriftSpeed
        : MECHANIC_CONFIG.moveSpeed;
    meshRef.current.position.x = THREE.MathUtils.lerp(
      meshRef.current.position.x,
      targetPos.x,
      delta * speed
    );
    meshRef.current.position.y = THREE.MathUtils.lerp(
      meshRef.current.position.y,
      targetPos.y,
      delta * speed
    );
    meshRef.current.position.z = THREE.MathUtils.lerp(
      meshRef.current.position.z,
      targetPos.z,
      delta * speed
    );

    // Gentle bob
    meshRef.current.position.y +=
      Math.sin(now * MECHANIC_CONFIG.bobSpeed) * MECHANIC_CONFIG.bobAmplitude;

    // Update position ref
    positionRef.current = {
      x: meshRef.current.position.x,
      y: meshRef.current.position.y,
      z: meshRef.current.position.z,
    };

    // Pulse the glow (faster when active)
    if (lightRef.current) {
      const pulseSpeed =
        modeRef.current === 'idle' ? 0.003 : MECHANIC_CONFIG.pulseSpeed;
      lightRef.current.intensity = 1.2 + Math.sin(now * pulseSpeed) * 0.4;
      lightRef.current.position.copy(meshRef.current.position);
    }

    // Animate the pulsing ring around the orb
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2;
      ringRef.current.rotation.z += delta * 2;
      const ringPulse = 1 + Math.sin(now * 0.005) * 0.15;
      ringRef.current.scale.setScalar(ringPulse);
      ringRef.current.position.copy(meshRef.current.position);
    }
  });

  // Don't render if mechanic is not active
  if (!mechanicActive) return null;

  return (
    <>
      {/* Main orb */}
      <mesh ref={meshRef} position={[positionRef.current.x, positionRef.current.y, positionRef.current.z]}>
        {/* Inner core */}
        <sphereGeometry args={[MECHANIC_CONFIG.orbSize, 16, 16]} />
        <meshStandardMaterial
          color="#4488FF"
          emissive="#2266DD"
          emissiveIntensity={2.5}
          toneMapped={false}
        />
        {/* Label */}
        <Html distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              fontSize: '10px',
              color: '#4488FF',
              background: 'rgba(0,0,0,0.6)',
              padding: '2px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              transform: 'translateY(-20px)',
            }}
          >
            mechanic
          </div>
        </Html>
      </mesh>

      {/* Pulsing ring around orb */}
      <mesh ref={ringRef} position={[positionRef.current.x, positionRef.current.y, positionRef.current.z]}>
        <torusGeometry args={[0.12, 0.01, 8, 32]} />
        <meshStandardMaterial
          color="#4488FF"
          emissive="#4488FF"
          emissiveIntensity={1.5}
          transparent
          opacity={0.6}
          toneMapped={false}
        />
      </mesh>

      {/* Glow light */}
      <pointLight
        ref={lightRef}
        color="#4488FF"
        intensity={1.2}
        distance={2.5}
        decay={2}
      />
    </>
  );
}

/**
 * Animated ring that appears around a node when a correction is applied.
 * Scales up and fades out over ~0.5 seconds.
 */
interface CorrectionHighlightProps {
  nodeId: string;
  type: string;
  timestamp: number;
  id: string;
}

export function CorrectionHighlight({ nodeId, type, timestamp, id }: CorrectionHighlightProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const node = useCanvasStore((s) => s.nodes[nodeId]);
  const removeCorrectionHighlight = useCanvasStore((s) => s.removeCorrectionHighlight);

  const color = CORRECTION_COLORS[type] || '#4488FF';

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;

    const elapsed = Date.now() - timestamp;
    const progress = Math.min(elapsed / HIGHLIGHT_DURATION_MS, 1);

    // Scale up from 0 to full size
    const scale = THREE.MathUtils.lerp(0, 1.5, Math.min(progress * 2, 1));
    meshRef.current.scale.setScalar(scale);

    // Fade out after scaling up
    const opacity = progress < 0.5 ? 1 : THREE.MathUtils.lerp(1, 0, (progress - 0.5) * 2);
    materialRef.current.opacity = opacity;

    // Rotate for visual effect
    meshRef.current.rotation.z += 0.05;

    // Remove highlight after animation completes
    if (progress >= 1) {
      removeCorrectionHighlight(id);
    }
  });

  // Don't render if node doesn't exist
  if (!node) return null;

  return (
    <mesh
      ref={meshRef}
      position={[node.position.x, node.position.y, node.position.z]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <torusGeometry args={[0.8, 0.05, 8, 32]} />
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        emissive={color}
        emissiveIntensity={2}
        transparent
        opacity={1}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Container component that renders all active correction highlights.
 */
export function CorrectionHighlights() {
  const highlights = useCanvasStore((s) => s.correctionHighlights);

  return (
    <>
      {highlights.map((highlight) => (
        <CorrectionHighlight
          key={highlight.id}
          id={highlight.id}
          nodeId={highlight.nodeId}
          type={highlight.type}
          timestamp={highlight.timestamp}
        />
      ))}
    </>
  );
}
