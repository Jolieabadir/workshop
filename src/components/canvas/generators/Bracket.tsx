'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface BracketParams {
  width?: number;       // mm, default 30
  height?: number;      // mm, default 30
  depth?: number;       // mm, default 15
  flangeWidth?: number; // mm, default 2
  holeCount?: number;   // holes per face, default 2
  material?: 'aluminum' | 'steel';
  color?: string;
}

interface BracketProps {
  params?: BracketParams;
  scale?: number;
}

// Material properties
const MATERIALS = {
  aluminum: { color: '#c0c0c0', metalness: 0.9, roughness: 0.3 },
  steel: { color: '#5a5a5a', metalness: 0.95, roughness: 0.2 },
};

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Bracket({ params = {}, scale = 1 }: BracketProps) {
  const {
    width = 30,
    height = 30,
    depth = 15,
    flangeWidth = 2,
    holeCount = 2,
    material = 'aluminum',
    color,
  } = params;

  // Convert to Three.js units
  const w = width * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const d = depth * MM_TO_UNITS;
  const f = flangeWidth * MM_TO_UNITS;

  const materialProps = MATERIALS[material];
  const finalColor = color || materialProps.color;

  // Generate holes for vertical face
  const verticalHoles = useMemo(() => {
    return Array.from({ length: holeCount }, (_, i) => ({
      y: (h / (holeCount + 1)) * (i + 1) - h / 2,
      key: `v${i}`,
    }));
  }, [holeCount, h]);

  // Generate holes for horizontal face
  const horizontalHoles = useMemo(() => {
    return Array.from({ length: holeCount }, (_, i) => ({
      z: (d / (holeCount + 1)) * (i + 1) - d / 2,
      key: `h${i}`,
    }));
  }, [holeCount, d]);

  const holeRadius = 0.015;

  return (
    <group scale={[scale, scale, scale]}>
      {/* Vertical face */}
      <mesh position={[0, h / 2 - f / 2, -d / 2 + f / 2]}>
        <boxGeometry args={[w, h, f]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Horizontal face */}
      <mesh position={[0, f / 2, 0]}>
        <boxGeometry args={[w, f, d]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Holes on vertical face */}
      {verticalHoles.map((hole) => (
        <mesh
          key={hole.key}
          position={[0, hole.y + h / 2 - f / 2, -d / 2 + f + 0.001]}
          rotation={[0, 0, 0]}
        >
          <circleGeometry args={[holeRadius, 12]} />
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
      ))}

      {/* Holes on horizontal face */}
      {horizontalHoles.map((hole) => (
        <mesh
          key={hole.key}
          position={[0, f + 0.001, hole.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[holeRadius, 12]} />
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
      ))}
    </group>
  );
}

export function getBracketConnectorPoints(params: BracketParams = {}): ConnectorPoint[] {
  const {
    width = 30,
    height = 30,
    depth = 15,
    flangeWidth = 2,
    holeCount = 2,
  } = params;

  const w = width * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const d = depth * MM_TO_UNITS;
  const f = flangeWidth * MM_TO_UNITS;

  const points: ConnectorPoint[] = [
    // Vertical face
    {
      id: 'vertical_face',
      position: { x: 0, y: h / 2, z: -d / 2 },
      direction: { x: 0, y: 0, z: -1 },
    },
    // Horizontal face
    {
      id: 'horizontal_face',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];

  // Add hole connectors
  for (let i = 0; i < holeCount; i++) {
    const vY = (h / (holeCount + 1)) * (i + 1);
    points.push({
      id: `vhole${i + 1}`,
      position: { x: 0, y: vY, z: -d / 2 + f },
      direction: { x: 0, y: 0, z: -1 },
    });

    const hZ = (d / (holeCount + 1)) * (i + 1) - d / 2;
    points.push({
      id: `hhole${i + 1}`,
      position: { x: 0, y: f, z: hZ },
      direction: { x: 0, y: 1, z: 0 },
    });
  }

  return points;
}
