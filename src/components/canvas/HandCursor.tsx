'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useHandStore } from '@/store/hand-store';

// Gesture colors for the cursor
const GESTURE_COLORS: Record<string, THREE.Color> = {
  none: new THREE.Color('#ffffff'),
  point: new THREE.Color('#00ff88'),
  pinch: new THREE.Color('#ff6b9d'),
  open_palm: new THREE.Color('#6c63ff'),
  fist: new THREE.Color('#ff9500'),
};

export function HandCursor() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  const position = useHandStore((s) => s.position);
  const gesture = useHandStore((s) => s.gesture);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);
  const isTracking = useHandStore((s) => s.isTracking);

  // Smoothed position for lerping
  const smoothedPos = useRef(new THREE.Vector3(0, 2, 2));
  const targetPos = useRef(new THREE.Vector3(0, 2, 2));

  useFrame((_, delta) => {
    if (!meshRef.current || !glowRef.current) return;

    // Update target position
    if (position) {
      targetPos.current.set(position.x, position.y, position.z);
    }

    // Smooth lerp to target
    smoothedPos.current.lerp(targetPos.current, delta * 12);
    meshRef.current.position.copy(smoothedPos.current);
    glowRef.current.position.copy(smoothedPos.current);

    // Update color based on gesture
    const targetColor = GESTURE_COLORS[gesture] || GESTURE_COLORS.none;

    if (materialRef.current) {
      materialRef.current.color.lerp(targetColor, delta * 8);
      materialRef.current.emissive.lerp(targetColor, delta * 8);

      // Pulse intensity when grabbing
      const baseIntensity = grabbedNodeId ? 1.2 : 0.6;
      const pulse = Math.sin(Date.now() * 0.008) * 0.2;
      materialRef.current.emissiveIntensity = baseIntensity + (grabbedNodeId ? pulse : 0);
    }

    if (glowMaterialRef.current) {
      glowMaterialRef.current.color.lerp(targetColor, delta * 8);

      // Pulsing opacity
      const basOpacity = gesture === 'pinch' ? 0.4 : 0.2;
      const pulse = Math.sin(Date.now() * 0.006) * 0.1;
      glowMaterialRef.current.opacity = basOpacity + pulse;
    }

    // Scale based on gesture
    const targetScale = gesture === 'pinch' ? 1.3 : gesture === 'open_palm' ? 1.5 : 1;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 10);

    // Glow scale follows with larger multiplier
    const glowScale = targetScale * 2.5;
    glowRef.current.scale.lerp(new THREE.Vector3(glowScale, glowScale, glowScale), delta * 8);

    // Hide if not tracking or no position
    const visible = isTracking && position !== null;
    meshRef.current.visible = visible;
    glowRef.current.visible = visible;
  });

  return (
    <>
      {/* Main cursor sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.08, 24, 24]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.6}
          transparent
          opacity={0.9}
          roughness={0.1}
          metalness={0.3}
        />
      </mesh>

      {/* Glow effect sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color="#ffffff"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
