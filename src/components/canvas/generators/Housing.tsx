'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface HousingParams {
  width?: number;         // mm, default 30
  height?: number;        // mm, default 30
  depth?: number;         // mm, default 20
  wallThickness?: number; // mm, default 2
  openFace?: 'top' | 'front' | 'none';
  material?: 'aluminum' | 'steel' | 'plastic';
  color?: string;
}

interface HousingProps {
  params?: HousingParams;
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

export function Housing({ params = {}, scale = 1 }: HousingProps) {
  const {
    width = 30,
    height = 30,
    depth = 20,
    wallThickness = 2,
    openFace = 'top',
    material = 'aluminum',
    color,
  } = params;

  // Convert to Three.js units
  const w = width * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const d = depth * MM_TO_UNITS;
  const t = wallThickness * MM_TO_UNITS;

  const materialProps = MATERIALS[material];
  const finalColor = color || materialProps.color;

  // Interior dimensions
  const innerW = w - t * 2;
  const innerH = h - t * 2;
  const innerD = d - t * 2;

  return (
    <group scale={[scale, scale, scale]}>
      {/* Bottom wall */}
      <mesh position={[0, -h / 2 + t / 2, 0]}>
        <boxGeometry args={[w, t, d]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Top wall (if not open) */}
      {openFace !== 'top' && (
        <mesh position={[0, h / 2 - t / 2, 0]}>
          <boxGeometry args={[w, t, d]} />
          <meshPhysicalMaterial
            color={finalColor}
            metalness={materialProps.metalness}
            roughness={materialProps.roughness}
          />
        </mesh>
      )}

      {/* Left wall */}
      <mesh position={[-w / 2 + t / 2, 0, 0]}>
        <boxGeometry args={[t, h, d]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Right wall */}
      <mesh position={[w / 2 - t / 2, 0, 0]}>
        <boxGeometry args={[t, h, d]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 0, -d / 2 + t / 2]}>
        <boxGeometry args={[innerW, h, t]} />
        <meshPhysicalMaterial
          color={finalColor}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>

      {/* Front wall (if not open) */}
      {openFace !== 'front' && (
        <mesh position={[0, 0, d / 2 - t / 2]}>
          <boxGeometry args={[innerW, h, t]} />
          <meshPhysicalMaterial
            color={finalColor}
            metalness={materialProps.metalness}
            roughness={materialProps.roughness}
          />
        </mesh>
      )}

      {/* Interior darkness */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[innerW - 0.002, innerH - 0.002, innerD - 0.002]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
    </group>
  );
}

export function getHousingConnectorPoints(params: HousingParams = {}): ConnectorPoint[] {
  const {
    width = 30,
    height = 30,
    depth = 20,
    wallThickness = 2,
    openFace = 'top',
  } = params;

  const w = width * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const d = depth * MM_TO_UNITS;
  const t = wallThickness * MM_TO_UNITS;

  const points: ConnectorPoint[] = [
    // Bottom face (exterior)
    {
      id: 'bottom',
      position: { x: 0, y: -h / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    // Top face (exterior or interior if open)
    {
      id: 'top',
      position: { x: 0, y: h / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    // Front face
    {
      id: 'front',
      position: { x: 0, y: 0, z: d / 2 },
      direction: { x: 0, y: 0, z: 1 },
    },
    // Back face
    {
      id: 'back',
      position: { x: 0, y: 0, z: -d / 2 },
      direction: { x: 0, y: 0, z: -1 },
    },
    // Left face
    {
      id: 'left',
      position: { x: -w / 2, y: 0, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    },
    // Right face
    {
      id: 'right',
      position: { x: w / 2, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
    // Interior center
    {
      id: 'interior',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
  ];

  return points;
}
