'use client';

import type { ConnectorPoint } from './Resistor';

export interface TubeParams {
  radius?: number;         // mm, outer radius, default 20
  height?: number;         // mm, default 40
  wallThickness?: number;  // mm, default 3
  color?: string;
}

interface TubeProps {
  params?: TubeParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Tube({ params = {}, scale = 1, color: colorOverride }: TubeProps) {
  const {
    radius = 20,
    height = 40,
    wallThickness = 3,
    color: paramsColor = '#cccccc',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const outerR = radius * MM_TO_UNITS;
  const innerR = Math.max((radius - wallThickness) * MM_TO_UNITS, 0.001);
  const h = height * MM_TO_UNITS;

  return (
    <group scale={[scale, scale, scale]}>
      {/* Outer cylinder */}
      <mesh>
        <cylinderGeometry args={[outerR, outerR, h, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      {/* Inner hole (slightly taller to cut through) */}
      <mesh>
        <cylinderGeometry args={[innerR, innerR, h + 0.001, 32]} />
        <meshBasicMaterial color="#1a1a2a" />
      </mesh>
      {/* Top ring */}
      <mesh position={[0, h / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      {/* Bottom ring */}
      <mesh position={[0, -h / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getTubeConnectorPoints(params: TubeParams = {}): ConnectorPoint[] {
  const height = (params.height ?? 40) * MM_TO_UNITS;

  return [
    {
      id: 'top',
      position: { x: 0, y: height / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'bottom',
      position: { x: 0, y: -height / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
