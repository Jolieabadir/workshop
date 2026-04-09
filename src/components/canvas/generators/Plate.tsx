'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface HolePosition {
  x: number;
  y: number;
  diameter: number;
}

export interface PlateParams {
  width?: number;      // mm, default 40
  height?: number;     // mm, default 20
  thickness?: number;  // mm, default 3
  holePositions?: HolePosition[];
  material?: 'aluminum' | 'steel' | 'plastic';
  color?: string;
}

interface PlateProps {
  params?: PlateParams;
  scale?: number;
}

// Material properties
const MATERIALS = {
  aluminum: { color: '#c0c0c0', metalness: 0.9, roughness: 0.3 },
  steel: { color: '#4a4a4a', metalness: 0.95, roughness: 0.2 },
  plastic: { color: '#2a2a2a', metalness: 0.1, roughness: 0.6 },
};

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Plate({ params = {}, scale = 1 }: PlateProps) {
  const {
    width = 40,
    height = 20,
    thickness = 3,
    holePositions = [],
    material = 'aluminum',
    color,
  } = params;

  // Convert to Three.js units
  const w = width * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const t = thickness * MM_TO_UNITS;

  const materialProps = MATERIALS[material];
  const finalColor = color || materialProps.color;

  // Generate hole meshes
  const holes = useMemo(() => {
    return holePositions.map((hole, i) => ({
      x: hole.x * MM_TO_UNITS,
      y: hole.y * MM_TO_UNITS,
      radius: (hole.diameter / 2) * MM_TO_UNITS,
      key: i,
    }));
  }, [holePositions]);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Main plate body */}
      <mesh>
        <boxGeometry args={[w, t, h]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Holes rendered as dark circles on top surface */}
      {holes.map((hole) => (
        <mesh
          key={hole.key}
          position={[hole.x, t / 2 + 0.001, hole.y]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[hole.radius, 16]} />
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
      ))}
    </group>
  );
}

export function getPlateConnectorPoints(params: PlateParams = {}): ConnectorPoint[] {
  const {
    width = 40,
    height = 20,
    thickness = 3,
    holePositions = [],
  } = params;

  const w = width * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const t = thickness * MM_TO_UNITS;

  const points: ConnectorPoint[] = [
    // Face connectors (top and bottom)
    {
      id: 'top',
      position: { x: 0, y: t / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'bottom',
      position: { x: 0, y: -t / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];

  // Add hole connectors
  holePositions.forEach((hole, i) => {
    points.push({
      id: `hole${i + 1}`,
      position: {
        x: hole.x * MM_TO_UNITS,
        y: 0,
        z: hole.y * MM_TO_UNITS,
      },
      direction: { x: 0, y: 1, z: 0 },
    });
  });

  return points;
}
