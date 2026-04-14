'use client';

import type { ConnectorPoint } from './Resistor';

export interface DomeParams {
  radius?: number;          // mm, hemisphere radius, default 20
  cylinderHeight?: number;  // mm, height of cylinder base, default 10
  color?: string;
}

interface DomeProps {
  params?: DomeParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Dome({ params = {}, scale = 1, color: colorOverride }: DomeProps) {
  const {
    radius = 20,
    cylinderHeight = 10,
    color: paramsColor = '#cccccc',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const r = radius * MM_TO_UNITS;
  const ch = cylinderHeight * MM_TO_UNITS;

  // Hemisphere sits on top of cylinder
  const hemisphereY = ch / 2;

  return (
    <group scale={[scale, scale, scale]}>
      {/* Cylinder base */}
      <mesh position={[0, -r / 2 + ch / 2, 0]}>
        <cylinderGeometry args={[r, r, ch, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      {/* Hemisphere top */}
      <mesh position={[0, hemisphereY, 0]}>
        <sphereGeometry args={[r, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getDomeConnectorPoints(params: DomeParams = {}): ConnectorPoint[] {
  const radius = (params.radius ?? 20) * MM_TO_UNITS;
  const cylinderHeight = (params.cylinderHeight ?? 10) * MM_TO_UNITS;

  // Total height = cylinder + hemisphere radius
  const totalHeight = cylinderHeight + radius;

  return [
    {
      id: 'top',
      position: { x: 0, y: cylinderHeight / 2 + radius, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'base',
      position: { x: 0, y: -radius / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
