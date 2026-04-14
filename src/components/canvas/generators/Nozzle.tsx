'use client';

import type { ConnectorPoint } from './Resistor';

export interface NozzleParams {
  radiusTop?: number;      // mm, inlet radius, default 12
  radiusBottom?: number;   // mm, outlet radius, default 18
  height?: number;         // mm, default 30
  wallThickness?: number;  // mm, default 2
  color?: string;
}

interface NozzleProps {
  params?: NozzleParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Nozzle({ params = {}, scale = 1, color: colorOverride }: NozzleProps) {
  const {
    radiusTop = 12,
    radiusBottom = 18,
    height = 30,
    wallThickness = 2,
    color: paramsColor = '#555555',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const rT = radiusTop * MM_TO_UNITS;
  const rB = radiusBottom * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const wall = wallThickness * MM_TO_UNITS;

  const innerRT = Math.max(rT - wall, 0.001);
  const innerRB = Math.max(rB - wall, 0.001);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Outer cone */}
      <mesh>
        <cylinderGeometry args={[rT, rB, h, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.85}
          roughness={0.2}
        />
      </mesh>
      {/* Inner cone (hollow) */}
      <mesh>
        <cylinderGeometry args={[innerRT, innerRB, h + 0.001, 32]} />
        <meshBasicMaterial color="#1a1a2a" />
      </mesh>
      {/* Top ring (inlet) */}
      <mesh position={[0, h / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerRT, rT, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.85}
          roughness={0.2}
        />
      </mesh>
      {/* Bottom ring (outlet) */}
      <mesh position={[0, -h / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerRB, rB, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.85}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

export function getNozzleConnectorPoints(params: NozzleParams = {}): ConnectorPoint[] {
  const height = (params.height ?? 30) * MM_TO_UNITS;

  return [
    {
      id: 'inlet',
      position: { x: 0, y: height / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    {
      id: 'outlet',
      position: { x: 0, y: -height / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
