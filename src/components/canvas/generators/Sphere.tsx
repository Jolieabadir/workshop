'use client';

import type { ConnectorPoint } from './Resistor';

export interface SphereParams {
  radius?: number;  // mm, default 20
  color?: string;
}

interface SphereProps {
  params?: SphereParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Sphere({ params = {}, scale = 1, color: colorOverride }: SphereProps) {
  const {
    radius = 20,
    color: paramsColor = '#cccccc',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const r = radius * MM_TO_UNITS;

  return (
    <group scale={[scale, scale, scale]}>
      <mesh>
        <sphereGeometry args={[r, 32, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getSphereConnectorPoints(params: SphereParams = {}): ConnectorPoint[] {
  const radius = (params.radius ?? 20) * MM_TO_UNITS;

  return [
    {
      id: 'top',
      position: { x: 0, y: radius, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'bottom',
      position: { x: 0, y: -radius, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    {
      id: 'front',
      position: { x: 0, y: 0, z: radius },
      direction: { x: 0, y: 0, z: 1 },
    },
    {
      id: 'back',
      position: { x: 0, y: 0, z: -radius },
      direction: { x: 0, y: 0, z: -1 },
    },
    {
      id: 'left',
      position: { x: -radius, y: 0, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    },
    {
      id: 'right',
      position: { x: radius, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
  ];
}
