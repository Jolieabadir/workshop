'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useCanvasStore } from '@/store/canvas-store';

export function BuilderAvatar() {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const target = useCanvasStore((s) => s.builderTarget);
  const position = useCanvasStore((s) => s.builderPosition);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // Smoothly lerp toward target
    const dest = target ?? { x: 0, y: 2, z: 2 };
    const offset = { x: dest.x + 0.5, y: dest.y + 0.6, z: dest.z + 0.5 };

    meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, offset.x, delta * 3);
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, offset.y, delta * 3);
    meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, offset.z, delta * 3);

    // Gentle bob
    meshRef.current.position.y += Math.sin(Date.now() * 0.003) * 0.02;

    // Pulse the glow
    if (lightRef.current) {
      lightRef.current.intensity = 1.5 + Math.sin(Date.now() * 0.005) * 0.5;
      lightRef.current.position.copy(meshRef.current.position);
    }

    // Update store position for other systems
    useCanvasStore.setState({
      builderPosition: {
        x: meshRef.current.position.x,
        y: meshRef.current.position.y,
        z: meshRef.current.position.z,
      },
    });
  });

  return (
    <>
      <mesh ref={meshRef} position={[position.x, position.y, position.z]}>
        {/* Inner core */}
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color="#f472b6"
          emissive="#ec4899"
          emissiveIntensity={2}
          toneMapped={false}
        />
        {/* Label */}
        <Html distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              fontSize: '10px',
              color: '#ec4899',
              background: 'rgba(0,0,0,0.6)',
              padding: '2px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              transform: 'translateY(-20px)',
            }}
          >
            builder
          </div>
        </Html>
      </mesh>
      {/* Glow light */}
      <pointLight
        ref={lightRef}
        color="#ec4899"
        intensity={1.5}
        distance={3}
        decay={2}
      />
    </>
  );
}
