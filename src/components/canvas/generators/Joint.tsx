'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface JointParams {
  type?: 'revolute' | 'prismatic';
  axleDiameter?: number;  // mm, default 3
  range?: number;         // degrees for revolute, mm for prismatic
  flangeWidth?: number;   // mm, default 8
  flangeHeight?: number;  // mm, default 12
  color?: string;
}

interface JointProps {
  params?: JointParams;
  scale?: number;
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Joint({ params = {}, scale = 1 }: JointProps) {
  const {
    type = 'revolute',
    axleDiameter = 3,
    flangeWidth = 8,
    flangeHeight = 12,
    color = '#707070',
  } = params;

  // Convert to Three.js units
  const axleR = (axleDiameter / 2) * MM_TO_UNITS;
  const fW = flangeWidth * MM_TO_UNITS;
  const fH = flangeHeight * MM_TO_UNITS;
  const flangeThickness = 0.02; // 2mm
  const gap = 0.015; // 1.5mm gap between flanges

  if (type === 'prismatic') {
    // Prismatic joint: rail and slider block
    const railLength = 0.08;
    const railWidth = 0.02;
    const railHeight = 0.01;
    const sliderWidth = 0.03;
    const sliderHeight = 0.02;

    return (
      <group scale={[scale, scale, scale]}>
        {/* Rail */}
        <mesh>
          <boxGeometry args={[railLength, railHeight, railWidth]} />
          <meshPhysicalMaterial
            color={color}
            metalness={0.9}
            roughness={0.25}
          />
        </mesh>

        {/* Slider block */}
        <mesh position={[0, railHeight / 2 + sliderHeight / 2, 0]}>
          <boxGeometry args={[sliderWidth, sliderHeight, railWidth * 1.5]} />
          <meshPhysicalMaterial
            color="#909090"
            metalness={0.85}
            roughness={0.3}
          />
        </mesh>

        {/* Rail grooves */}
        <mesh position={[0, railHeight / 2 + 0.001, railWidth / 4]}>
          <boxGeometry args={[railLength, 0.003, 0.003]} />
          <meshBasicMaterial color="#2a2a2a" />
        </mesh>
        <mesh position={[0, railHeight / 2 + 0.001, -railWidth / 4]}>
          <boxGeometry args={[railLength, 0.003, 0.003]} />
          <meshBasicMaterial color="#2a2a2a" />
        </mesh>
      </group>
    );
  }

  // Revolute joint: two flanges with axle pin
  return (
    <group scale={[scale, scale, scale]}>
      {/* Left flange */}
      <mesh position={[-gap / 2 - flangeThickness / 2, 0, 0]}>
        <boxGeometry args={[flangeThickness, fH, fW]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.9}
          roughness={0.25}
        />
      </mesh>

      {/* Right flange */}
      <mesh position={[gap / 2 + flangeThickness / 2, 0, 0]}>
        <boxGeometry args={[flangeThickness, fH, fW]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.9}
          roughness={0.25}
        />
      </mesh>

      {/* Axle pin */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[axleR, axleR, gap + flangeThickness * 2 + 0.01, 16]} />
        <meshPhysicalMaterial
          color="#a0a0a0"
          metalness={0.95}
          roughness={0.15}
        />
      </mesh>

      {/* Axle hole indicators on flanges */}
      <mesh position={[-gap / 2 - flangeThickness - 0.001, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[axleR * 0.8, axleR * 1.2, 16]} />
        <meshPhysicalMaterial
          color="#505050"
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[gap / 2 + flangeThickness + 0.001, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <ringGeometry args={[axleR * 0.8, axleR * 1.2, 16]} />
        <meshPhysicalMaterial
          color="#505050"
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getJointConnectorPoints(params: JointParams = {}): ConnectorPoint[] {
  const {
    type = 'revolute',
    flangeWidth = 8,
    flangeHeight = 12,
  } = params;

  const fW = flangeWidth * MM_TO_UNITS;
  const fH = flangeHeight * MM_TO_UNITS;
  const flangeThickness = 0.02;
  const gap = 0.015;

  if (type === 'prismatic') {
    const railLength = 0.08;
    return [
      {
        id: 'rail_end1',
        position: { x: -railLength / 2, y: 0, z: 0 },
        direction: { x: -1, y: 0, z: 0 },
      },
      {
        id: 'rail_end2',
        position: { x: railLength / 2, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
      },
      {
        id: 'slider',
        position: { x: 0, y: 0.025, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
      },
    ];
  }

  // Revolute joint connectors
  return [
    // Link attachment on left side
    {
      id: 'link1',
      position: { x: -gap / 2 - flangeThickness, y: 0, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    },
    // Link attachment on right side
    {
      id: 'link2',
      position: { x: gap / 2 + flangeThickness, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
    // Axle center (for rotation reference)
    {
      id: 'axle',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
  ];
}
