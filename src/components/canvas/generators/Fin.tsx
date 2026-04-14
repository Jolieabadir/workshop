'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { ConnectorPoint } from './Resistor';

export interface FinParams {
  rootChord?: number;   // mm, chord at root (attachment), default 30
  tipChord?: number;    // mm, chord at tip, default 15
  span?: number;        // mm, length from root to tip, default 40
  thickness?: number;   // mm, default 3
  sweepAngle?: number;  // degrees, leading edge sweep, default 30
  color?: string;
}

interface FinProps {
  params?: FinParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Fin({ params = {}, scale = 1, color: colorOverride }: FinProps) {
  const {
    rootChord = 30,
    tipChord = 15,
    span = 40,
    thickness = 3,
    sweepAngle = 30,
    color: paramsColor = '#cc3333',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const rc = rootChord * MM_TO_UNITS;
  const tc = tipChord * MM_TO_UNITS;
  const s = span * MM_TO_UNITS;
  const t = thickness * MM_TO_UNITS;

  // Calculate sweep offset
  const sweepRad = (sweepAngle * Math.PI) / 180;
  const sweepOffset = s * Math.tan(sweepRad);

  // Create extruded fin shape
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();

    // Create fin profile (trapezoid with sweep)
    // Start at root trailing edge
    shape.moveTo(0, 0);
    // Root leading edge
    shape.lineTo(rc, 0);
    // Tip leading edge (with sweep offset)
    shape.lineTo(sweepOffset + tc, s);
    // Tip trailing edge
    shape.lineTo(sweepOffset, s);
    // Back to start
    shape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: t,
      bevelEnabled: false,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center the geometry
    geo.translate(-rc / 2, -s / 2, -t / 2);
    // Rotate so fin stands up (Y is span direction)
    geo.rotateX(-Math.PI / 2);

    return geo;
  }, [rc, tc, s, t, sweepOffset]);

  return (
    <group scale={[scale, scale, scale]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

export function getFinConnectorPoints(params: FinParams = {}): ConnectorPoint[] {
  const span = (params.span ?? 40) * MM_TO_UNITS;

  return [
    {
      id: 'root',
      position: { x: 0, y: -span / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    {
      id: 'tip',
      position: { x: 0, y: span / 2, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    },
  ];
}
