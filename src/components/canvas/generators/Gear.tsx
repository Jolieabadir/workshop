'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '@/core/types';
import type { ConnectorPoint } from './Resistor';

export interface GearParams {
  toothCount?: number;    // default 12
  module?: number;        // mm, default 1 (determines tooth size)
  thickness?: number;     // mm, default 3
  boreDiameter?: number;  // mm, default 3
  color?: string;
}

interface GearProps {
  params?: GearParams;
  scale?: number;
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Gear({ params = {}, scale = 1 }: GearProps) {
  const {
    toothCount = 12,
    module = 1,
    thickness = 3,
    boreDiameter = 3,
    color = '#808080',
  } = params;

  // Gear dimensions
  // Pitch diameter = module * toothCount
  // Outside diameter = pitch diameter + 2 * module
  const pitchDiameter = module * toothCount * MM_TO_UNITS;
  const outsideDiameter = (module * toothCount + 2 * module) * MM_TO_UNITS;
  const rootDiameter = (module * toothCount - 2.5 * module) * MM_TO_UNITS;
  const t = thickness * MM_TO_UNITS;
  const boreR = (boreDiameter / 2) * MM_TO_UNITS;

  const outerR = outsideDiameter / 2;
  const rootR = rootDiameter / 2;

  // Create gear tooth profile
  const toothShape = useMemo(() => {
    const shape = new THREE.Shape();
    const toothAngle = (Math.PI * 2) / toothCount;
    const toothWidth = toothAngle * 0.4; // Tooth takes 40% of the space
    const gapWidth = toothAngle * 0.6;   // Gap takes 60%

    shape.moveTo(boreR, 0);

    for (let i = 0; i < toothCount; i++) {
      const startAngle = i * toothAngle;
      const toothStart = startAngle + gapWidth / 2;
      const toothEnd = toothStart + toothWidth;

      // Arc along root to start of tooth
      for (let j = 0; j <= 4; j++) {
        const a = startAngle + (gapWidth / 2) * (j / 4);
        shape.lineTo(Math.cos(a) * rootR, Math.sin(a) * rootR);
      }

      // Tooth rise
      const riseAngle = toothStart;
      shape.lineTo(Math.cos(riseAngle) * outerR, Math.sin(riseAngle) * outerR);

      // Tooth top
      for (let j = 0; j <= 2; j++) {
        const a = toothStart + toothWidth * (j / 2);
        shape.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
      }

      // Tooth fall
      shape.lineTo(Math.cos(toothEnd) * rootR, Math.sin(toothEnd) * rootR);
    }

    shape.lineTo(rootR, 0);

    // Create center hole
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(holePath);

    return shape;
  }, [toothCount, outerR, rootR, boreR]);

  // Extrude settings
  const extrudeSettings = useMemo(() => ({
    steps: 1,
    depth: t,
    bevelEnabled: false,
  }), [t]);

  return (
    <group scale={[scale, scale, scale]} rotation={[Math.PI / 2, 0, 0]}>
      {/* Gear body with teeth */}
      <mesh position={[0, 0, -t / 2]}>
        <extrudeGeometry args={[toothShape, extrudeSettings]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.9}
          roughness={0.25}
        />
      </mesh>

      {/* Hub (slightly raised center) */}
      <mesh>
        <cylinderGeometry args={[boreR * 2, boreR * 2, t * 1.2, 24]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.9}
          roughness={0.25}
        />
      </mesh>

      {/* Center bore (dark) */}
      <mesh>
        <cylinderGeometry args={[boreR, boreR, t * 1.3, 16]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

export function getGearConnectorPoints(params: GearParams = {}): ConnectorPoint[] {
  const {
    toothCount = 12,
    module = 1,
    thickness = 3,
  } = params;

  const pitchDiameter = module * toothCount * MM_TO_UNITS;
  const t = thickness * MM_TO_UNITS;

  return [
    // Shaft bore (center)
    {
      id: 'shaft',
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    // Face 1 (top)
    {
      id: 'face1',
      position: { x: 0, y: t / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
    // Face 2 (bottom)
    {
      id: 'face2',
      position: { x: 0, y: -t / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    // Pitch circle (for meshing with another gear)
    {
      id: 'pitch',
      position: { x: pitchDiameter / 2, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
  ];
}
