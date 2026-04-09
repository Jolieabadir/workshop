'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useCanvasStore } from '@/store/canvas-store';
import type { Vec3 } from '@/core/types';

// Builder avatar behavior configuration
const BUILDER_CONFIG = {
  moveSpeed: 3,           // Lerp speed toward target
  idleDriftSpeed: 0.3,    // Slow drift when idle
  orbitSpeed: 2,          // Speed when orbiting around groups
  orbitRadius: 1.5,       // Distance from center when orbiting
  orbitDuration: 2000,    // How long to orbit (ms)
  bobAmplitude: 0.02,     // Vertical bob amount
  bobSpeed: 0.003,        // Bob frequency
};

type BuilderMode = 'idle' | 'targeting' | 'orbiting';

export function BuilderAvatar() {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Builder state
  const modeRef = useRef<BuilderMode>('idle');
  const orbitCenterRef = useRef<Vec3>({ x: 0, y: 1.5, z: 0 });
  const orbitStartTimeRef = useRef<number>(0);
  const lastTargetRef = useRef<Vec3 | null>(null);
  const activityCentroidRef = useRef<Vec3>({ x: 0, y: 1.5, z: 0 });

  // Canvas store state
  const target = useCanvasStore((s) => s.builderTarget);
  const position = useCanvasStore((s) => s.builderPosition);
  const nodes = useCanvasStore((s) => s.nodes);
  const connections = useCanvasStore((s) => s.connections);
  const focusStack = useCanvasStore((s) => s.focusStack);

  // Track activity centroid (center of recently touched nodes)
  useEffect(() => {
    // Get positions of recent focus stack nodes (up to 5)
    const recentNodeIds = focusStack.slice(0, 5);
    const recentPositions = recentNodeIds
      .map((id) => nodes[id]?.position)
      .filter((p): p is Vec3 => p !== undefined);

    if (recentPositions.length > 0) {
      activityCentroidRef.current = {
        x: recentPositions.reduce((sum, p) => sum + p.x, 0) / recentPositions.length,
        y: recentPositions.reduce((sum, p) => sum + p.y, 0) / recentPositions.length,
        z: recentPositions.reduce((sum, p) => sum + p.z, 0) / recentPositions.length,
      };
    }
  }, [focusStack, nodes]);

  // Detect when new connections are made → move to midpoint
  const prevConnectionCountRef = useRef(Object.keys(connections).length);
  useEffect(() => {
    const currentCount = Object.keys(connections).length;
    if (currentCount > prevConnectionCountRef.current) {
      // New connection was added - find the newest one
      const connectionList = Object.values(connections);
      if (connectionList.length > 0) {
        const newest = connectionList[connectionList.length - 1];
        const fromNode = nodes[newest.fromId];
        const toNode = nodes[newest.toId];

        if (fromNode && toNode) {
          // Set target to midpoint between connected nodes
          const midpoint: Vec3 = {
            x: (fromNode.position.x + toNode.position.x) / 2,
            y: (fromNode.position.y + toNode.position.y) / 2 + 0.5,
            z: (fromNode.position.z + toNode.position.z) / 2,
          };
          useCanvasStore.setState({ builderTarget: midpoint });
          modeRef.current = 'targeting';
        }
      }
    }
    prevConnectionCountRef.current = currentCount;
  }, [connections, nodes]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const now = Date.now();
    let targetPos: Vec3;

    // Determine target position based on mode
    if (target && target !== lastTargetRef.current) {
      // New target set externally
      modeRef.current = 'targeting';
      lastTargetRef.current = target;
    }

    if (modeRef.current === 'orbiting') {
      // Orbit around a center point
      const elapsed = now - orbitStartTimeRef.current;
      if (elapsed > BUILDER_CONFIG.orbitDuration) {
        modeRef.current = 'idle';
      } else {
        const angle = (elapsed / 1000) * BUILDER_CONFIG.orbitSpeed;
        targetPos = {
          x: orbitCenterRef.current.x + Math.cos(angle) * BUILDER_CONFIG.orbitRadius,
          y: orbitCenterRef.current.y + 0.5,
          z: orbitCenterRef.current.z + Math.sin(angle) * BUILDER_CONFIG.orbitRadius,
        };
      }
    }

    if (modeRef.current === 'targeting' && target) {
      // Move toward explicit target
      targetPos = {
        x: target.x + 0.5,
        y: target.y + 0.6,
        z: target.z + 0.5,
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
    }

    if (modeRef.current === 'idle') {
      // Slowly drift toward activity centroid
      targetPos = {
        x: activityCentroidRef.current.x + 1,
        y: activityCentroidRef.current.y + 0.8,
        z: activityCentroidRef.current.z + 1,
      };
    }

    // Fallback target
    targetPos ??= { x: 0, y: 2, z: 2 };

    // Smooth movement toward target
    const speed = modeRef.current === 'idle' ? BUILDER_CONFIG.idleDriftSpeed : BUILDER_CONFIG.moveSpeed;
    meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetPos.x, delta * speed);
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetPos.y, delta * speed);
    meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, targetPos.z, delta * speed);

    // Gentle bob
    meshRef.current.position.y += Math.sin(now * BUILDER_CONFIG.bobSpeed) * BUILDER_CONFIG.bobAmplitude;

    // Pulse the glow (faster when active)
    if (lightRef.current) {
      const pulseSpeed = modeRef.current === 'idle' ? 0.003 : 0.008;
      lightRef.current.intensity = 1.5 + Math.sin(now * pulseSpeed) * 0.5;
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

  // Public method to trigger orbit mode (can be called from group creation)
  // For now, we detect group creation in the store and trigger orbit
  const prevGroupCountRef = useRef(0);
  const groups = useCanvasStore((s) => s.groups);

  useEffect(() => {
    const currentCount = Object.keys(groups).length;
    if (currentCount > prevGroupCountRef.current) {
      // New group created - orbit around its centroid
      const groupList = Object.values(groups);
      if (groupList.length > 0) {
        const newest = groupList[groupList.length - 1];
        orbitCenterRef.current = newest.position;
        orbitStartTimeRef.current = Date.now();
        modeRef.current = 'orbiting';
      }
    }
    prevGroupCountRef.current = currentCount;
  }, [groups]);

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
