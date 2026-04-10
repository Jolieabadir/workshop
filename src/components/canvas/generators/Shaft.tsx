'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface ShaftParams {
  length?: number;     // mm, default 30
  diameter?: number;   // mm, default 5
  type?: 'smooth' | 'threaded' | 'splined';
  color?: string;
}

interface ShaftProps {
  params?: ShaftParams;
  scale?: number;
  color?: string;  // Override for shaft color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Shaft({ params = {}, scale = 1, color: colorOverride }: ShaftProps) {
  const {
    length = 30,
    diameter = 5,
    type = 'smooth',
    color: paramsColor = '#b0b0b0',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const l = length * MM_TO_UNITS;
  const d = diameter * MM_TO_UNITS;
  const r = d / 2;

  // Generate thread rings for threaded type
  const threadRings = useMemo(() => {
    if (type !== 'threaded') return [];
    const threadPitch = 0.02; // 2mm pitch in units
    const count = Math.floor(l / threadPitch);
    return Array.from({ length: count }, (_, i) => ({
      position: -l / 2 + threadPitch * (i + 0.5),
      key: i,
    }));
  }, [type, l]);

  // Generate spline ridges
  const splineRidges = useMemo(() => {
    if (type !== 'splined') return [];
    const ridgeCount = 6;
    return Array.from({ length: ridgeCount }, (_, i) => ({
      angle: (i / ridgeCount) * Math.PI * 2,
      key: i,
    }));
  }, [type]);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Main shaft cylinder */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, l, 24]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.9}
          roughness={0.15}
        />
      </mesh>

      {/* Thread rings for threaded type */}
      {threadRings.map((ring) => (
        <mesh key={ring.key} position={[ring.position, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[r, 0.003, 8, 24]} />
          <meshPhysicalMaterial
            color={color}
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Spline ridges for splined type */}
      {splineRidges.map((ridge) => (
        <mesh
          key={ridge.key}
          position={[0, Math.sin(ridge.angle) * r, Math.cos(ridge.angle) * r]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <boxGeometry args={[l, 0.005, 0.01]} />
          <meshPhysicalMaterial
            color={color}
            metalness={0.9}
            roughness={0.15}
          />
        </mesh>
      ))}
    </group>
  );
}

export function getShaftConnectorPoints(params: ShaftParams = {}): ConnectorPoint[] {
  const length = (params.length ?? 30) * MM_TO_UNITS;

  return [
    {
      id: 'end1',
      position: { x: -length / 2, y: 0, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    },
    {
      id: 'end2',
      position: { x: length / 2, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
  ];
}
