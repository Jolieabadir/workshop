'use client';

import type { ConnectorPoint } from './Resistor';

export interface HemisphereParams {
  radius?: number;  // mm, default 20
  color?: string;
}

interface HemisphereProps {
  params?: HemisphereParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Hemisphere({ params = {}, scale = 1, color: colorOverride }: HemisphereProps) {
  const {
    radius = 20,
    color: paramsColor = '#cccccc',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const r = radius * MM_TO_UNITS;

  return (
    <group scale={[scale, scale, scale]}>
      {/* Half sphere - phiStart=0, phiLength=2*PI, thetaStart=0, thetaLength=PI/2 */}
      <mesh>
        <sphereGeometry args={[r, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      {/* Base cap */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getHemisphereConnectorPoints(params: HemisphereParams = {}): ConnectorPoint[] {
  const radius = (params.radius ?? 20) * MM_TO_UNITS;

  return [
    {
      id: 'top',
      position: { x: 0, y: radius, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'base',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
