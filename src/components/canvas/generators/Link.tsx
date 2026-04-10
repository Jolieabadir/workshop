'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface LinkParams {
  length?: number;      // mm, default 40
  width?: number;       // mm, default 10
  thickness?: number;   // mm, default 3
  holeAtEnds?: boolean; // default true
  material?: 'aluminum' | 'steel' | 'plastic';
  color?: string;
}

interface LinkProps {
  params?: LinkParams;
  scale?: number;
}

// Material properties
const MATERIALS = {
  aluminum: { color: '#c0c0c0', metalness: 0.9, roughness: 0.3 },
  steel: { color: '#5a5a5a', metalness: 0.95, roughness: 0.2 },
  plastic: { color: '#2a2a2a', metalness: 0.1, roughness: 0.6 },
};

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Link({ params = {}, scale = 1 }: LinkProps) {
  const {
    length = 40,
    width = 10,
    thickness = 3,
    holeAtEnds = true,
    material = 'aluminum',
    color,
  } = params;

  // Convert to Three.js units
  const l = length * MM_TO_UNITS;
  const w = width * MM_TO_UNITS;
  const t = thickness * MM_TO_UNITS;

  const materialProps = MATERIALS[material];
  const finalColor = color || materialProps.color;

  // End cap radius (half of width for rounded ends)
  const endRadius = w / 2;
  const straightLength = l - w; // Length of straight section
  const holeRadius = w * 0.25;

  return (
    <group scale={[scale, scale, scale]}>
      {/* Main rectangular body */}
      <mesh>
        <boxGeometry args={[straightLength, t, w]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Left rounded end */}
      <mesh position={[-straightLength / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[endRadius, endRadius, t, 16, 1, false, Math.PI / 2, Math.PI]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Right rounded end */}
      <mesh position={[straightLength / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[endRadius, endRadius, t, 16, 1, false, -Math.PI / 2, Math.PI]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Holes at ends */}
      {holeAtEnds && (
        <>
          {/* Left hole - top */}
          <mesh position={[-straightLength / 2, t / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[holeRadius, 16]} />
            <meshBasicMaterial color="#1a1a1a" />
          </mesh>
          {/* Left hole - bottom */}
          <mesh position={[-straightLength / 2, -t / 2 - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[holeRadius, 16]} />
            <meshBasicMaterial color="#1a1a1a" />
          </mesh>
          {/* Right hole - top */}
          <mesh position={[straightLength / 2, t / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[holeRadius, 16]} />
            <meshBasicMaterial color="#1a1a1a" />
          </mesh>
          {/* Right hole - bottom */}
          <mesh position={[straightLength / 2, -t / 2 - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[holeRadius, 16]} />
            <meshBasicMaterial color="#1a1a1a" />
          </mesh>
        </>
      )}
    </group>
  );
}

export function getLinkConnectorPoints(params: LinkParams = {}): ConnectorPoint[] {
  const {
    length = 40,
    width = 10,
  } = params;

  const l = length * MM_TO_UNITS;
  const w = width * MM_TO_UNITS;
  const straightLength = l - w;

  return [
    // End connectors (at the tips of the rounded ends)
    {
      id: 'start',
      position: { x: -l / 2, y: 0, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    },
    {
      id: 'end',
      position: { x: l / 2, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
    // Pin holes at each end (for axle connections)
    {
      id: 'pin1',
      position: { x: -straightLength / 2, y: 0, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    },
    {
      id: 'pin2',
      position: { x: straightLength / 2, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
  ];
}
