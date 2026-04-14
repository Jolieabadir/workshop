'use client';

import type { ConnectorPoint } from './Resistor';

export interface ConeParams {
  radiusBottom?: number;  // mm, default 20
  radiusTop?: number;     // mm, default 0 (pointed)
  height?: number;        // mm, default 40
  color?: string;
}

interface ConeProps {
  params?: ConeParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Cone({ params = {}, scale = 1, color: colorOverride }: ConeProps) {
  const {
    radiusBottom = 20,
    radiusTop = 0,
    height = 40,
    color: paramsColor = '#cccccc',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const rB = radiusBottom * MM_TO_UNITS;
  const rT = radiusTop * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;

  return (
    <group scale={[scale, scale, scale]}>
      <mesh>
        <coneGeometry args={[rB, h, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      {/* If truncated cone (radiusTop > 0), add cap */}
      {rT > 0 && (
        <mesh position={[0, h / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[rT, 32]} />
          <meshPhysicalMaterial
            color={color}
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
      )}
    </group>
  );
}

export function getConeConnectorPoints(params: ConeParams = {}): ConnectorPoint[] {
  const height = (params.height ?? 40) * MM_TO_UNITS;

  return [
    {
      id: 'tip',
      position: { x: 0, y: height / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'base',
      position: { x: 0, y: -height / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
