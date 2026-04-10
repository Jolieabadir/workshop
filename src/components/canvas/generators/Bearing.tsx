'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface BearingParams {
  outerDiameter?: number;  // mm, default 12
  innerDiameter?: number;  // mm, default 5
  width?: number;          // mm, default 4
  color?: string;
}

interface BearingProps {
  params?: BearingParams;
  scale?: number;
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Bearing({ params = {}, scale = 1 }: BearingProps) {
  const {
    outerDiameter = 12,
    innerDiameter = 5,
    width = 4,
    color = '#707070',
  } = params;

  // Convert to Three.js units
  const od = outerDiameter * MM_TO_UNITS;
  const id = innerDiameter * MM_TO_UNITS;
  const w = width * MM_TO_UNITS;

  const outerRadius = od / 2;
  const innerRadius = id / 2;
  const midRadius = (outerRadius + innerRadius) / 2;
  const ballRadius = (outerRadius - innerRadius) / 4;

  // Generate ball bearings
  const balls = useMemo(() => {
    const ballCount = 8;
    return Array.from({ length: ballCount }, (_, i) => {
      const angle = (i / ballCount) * Math.PI * 2;
      return {
        x: Math.cos(angle) * midRadius,
        z: Math.sin(angle) * midRadius,
        key: i,
      };
    });
  }, [midRadius]);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Outer race */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[outerRadius, outerRadius, w, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      {/* Inner race */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[innerRadius + ballRadius * 0.3, innerRadius + ballRadius * 0.3, w, 24]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      {/* Ball bearings */}
      {balls.map((ball) => (
        <mesh key={ball.key} position={[ball.x, 0, ball.z]}>
          <sphereGeometry args={[ballRadius, 12, 12]} />
          <meshPhysicalMaterial
            color="#a0a0a0"
            metalness={0.95}
            roughness={0.1}
          />
        </mesh>
      ))}

      {/* Inner bore (dark) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[innerRadius, innerRadius, w + 0.002, 24]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

export function getBearingConnectorPoints(params: BearingParams = {}): ConnectorPoint[] {
  const {
    outerDiameter = 12,
    innerDiameter = 5,
    width = 4,
  } = params;

  const od = outerDiameter * MM_TO_UNITS;
  const id = innerDiameter * MM_TO_UNITS;
  const w = width * MM_TO_UNITS;

  return [
    // Inner race (shaft attachment)
    {
      id: 'inner',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    // Outer race (housing attachment)
    {
      id: 'outer',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    // Side faces
    {
      id: 'face1',
      position: { x: 0, y: w / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'face2',
      position: { x: 0, y: -w / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
