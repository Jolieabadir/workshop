'use client';

import type { ConnectorPoint } from './Resistor';

export interface CylinderParams {
  radius?: number;  // mm, default 15
  height?: number;  // mm, default 40
  color?: string;
}

interface CylinderProps {
  params?: CylinderParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Cylinder({ params = {}, scale = 1, color: colorOverride }: CylinderProps) {
  const {
    radius = 15,
    height = 40,
    color: paramsColor = '#dddddd',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const r = radius * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;

  return (
    <group scale={[scale, scale, scale]}>
      <mesh>
        <cylinderGeometry args={[r, r, h, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getCylinderConnectorPoints(params: CylinderParams = {}): ConnectorPoint[] {
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
