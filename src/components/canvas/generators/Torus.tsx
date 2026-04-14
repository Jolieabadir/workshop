'use client';

import type { ConnectorPoint } from './Resistor';

export interface TorusParams {
  radius?: number;      // mm, main ring radius, default 20
  tubeRadius?: number;  // mm, tube cross-section radius, default 5
  color?: string;
}

interface TorusProps {
  params?: TorusParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Torus({ params = {}, scale = 1, color: colorOverride }: TorusProps) {
  const {
    radius = 20,
    tubeRadius = 5,
    color: paramsColor = '#cccccc',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const r = radius * MM_TO_UNITS;
  const tr = tubeRadius * MM_TO_UNITS;

  return (
    <group scale={[scale, scale, scale]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r, tr, 16, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getTorusConnectorPoints(params: TorusParams = {}): ConnectorPoint[] {
  return [
    {
      id: 'center',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
  ];
}
