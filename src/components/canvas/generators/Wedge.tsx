'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { ConnectorPoint } from './Resistor';

export interface WedgeParams {
  width?: number;   // mm, default 30
  height?: number;  // mm, default 20
  depth?: number;   // mm, default 40
  color?: string;
}

interface WedgeProps {
  params?: WedgeParams;
  scale?: number;
  color?: string;  // Override color (takes priority over params.color)
}

// Convert mm to Three.js units (1 unit = 100mm)
const MM_TO_UNITS = 0.01;

export function Wedge({ params = {}, scale = 1, color: colorOverride }: WedgeProps) {
  const {
    width = 30,
    height = 20,
    depth = 40,
    color: paramsColor = '#cccccc',
  } = params;

  const color = colorOverride || paramsColor;

  // Convert to Three.js units
  const w = width * MM_TO_UNITS;
  const h = height * MM_TO_UNITS;
  const d = depth * MM_TO_UNITS;

  // Create triangular prism geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Vertices for triangular prism (wedge)
    // Triangle face at front: bottom-left, bottom-right, top-center
    // Extended along depth (z-axis)
    const vertices = new Float32Array([
      // Front face (triangle)
      -w / 2, -h / 2, d / 2,   // 0: front bottom-left
       w / 2, -h / 2, d / 2,   // 1: front bottom-right
       0,      h / 2, d / 2,   // 2: front top-center

      // Back face (triangle)
      -w / 2, -h / 2, -d / 2,  // 3: back bottom-left
       w / 2, -h / 2, -d / 2,  // 4: back bottom-right
       0,      h / 2, -d / 2,  // 5: back top-center
    ]);

    // Indices for the faces
    const indices = [
      // Front face
      0, 1, 2,
      // Back face
      5, 4, 3,
      // Bottom face (quad as 2 triangles)
      3, 4, 1,
      3, 1, 0,
      // Left slope face
      3, 0, 2,
      3, 2, 5,
      // Right slope face
      1, 4, 5,
      1, 5, 2,
    ];

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();

    return geo;
  }, [w, h, d]);

  return (
    <group scale={[scale, scale, scale]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

export function getWedgeConnectorPoints(params: WedgeParams = {}): ConnectorPoint[] {
  const height = (params.height ?? 20) * MM_TO_UNITS;
  const depth = (params.depth ?? 40) * MM_TO_UNITS;

  return [
    {
      id: 'base',
      position: { x: 0, y: -height / 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    {
      id: 'back',
      position: { x: 0, y: 0, z: -depth / 2 },
      direction: { x: 0, y: 0, z: -1 },
    },
    {
      id: 'slope',
      position: { x: 0, y: 0, z: depth / 4 },
      direction: { x: 0, y: 0.7, z: 0.7 },  // Diagonal up and forward
    },
  ];
}
