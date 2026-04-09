'use client';

import type { Vec3 } from '@/core/types';

export interface CapacitorParams {
  height?: number;
  diameter?: number;
  type?: 'electrolytic' | 'ceramic';
  value?: string;
}

export interface ConnectorPoint {
  id: string;
  position: Vec3;
  direction: Vec3;
}

interface CapacitorProps {
  params?: CapacitorParams;
  scale?: number;
}

export function Capacitor({ params = {}, scale = 1 }: CapacitorProps) {
  const {
    height = 0.5,
    diameter = 0.25,
    type = 'electrolytic',
  } = params;

  const leadLength = 0.25;
  const leadRadius = 0.012;

  if (type === 'ceramic') {
    // Ceramic disc capacitor
    const discThickness = 0.08;
    const discRadius = diameter / 2;

    return (
      <group scale={[scale, scale, scale]}>
        {/* Ceramic disc body */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[discRadius, discRadius, discThickness, 24]} />
          <meshPhysicalMaterial
            color="#d4a574"
            metalness={0}
            roughness={0.7}
          />
        </mesh>

        {/* Lead 1 */}
        <mesh position={[-discRadius * 0.4, -discThickness / 2 - leadLength / 2, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[leadRadius, leadRadius, leadLength, 12]} />
          <meshPhysicalMaterial
            color="#c0c0c0"
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>

        {/* Lead 2 */}
        <mesh position={[discRadius * 0.4, -discThickness / 2 - leadLength / 2, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[leadRadius, leadRadius, leadLength, 12]} />
          <meshPhysicalMaterial
            color="#c0c0c0"
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
      </group>
    );
  }

  // Electrolytic capacitor (default)
  const bodyRadius = diameter / 2;

  return (
    <group scale={[scale, scale, scale]}>
      {/* Main cylindrical body */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[bodyRadius, bodyRadius, height, 24]} />
        <meshPhysicalMaterial
          color="#1a1a2e"
          metalness={0.2}
          roughness={0.5}
        />
      </mesh>

      {/* Top cap (aluminum) */}
      <mesh position={[0, height, 0]}>
        <cylinderGeometry args={[bodyRadius * 0.9, bodyRadius * 0.9, 0.03, 24]} />
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={0.8}
          roughness={0.3}
        />
      </mesh>

      {/* Polarity stripe (white/gray) */}
      <mesh position={[-bodyRadius * 0.85, height / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[height * 0.8, 0.02, 0.04]} />
        <meshPhysicalMaterial
          color="#e0e0e0"
          metalness={0}
          roughness={0.8}
        />
      </mesh>

      {/* Negative lead (shorter) */}
      <mesh position={[-bodyRadius * 0.3, -leadLength / 2, 0]}>
        <cylinderGeometry args={[leadRadius, leadRadius, leadLength, 12]} />
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      {/* Positive lead (longer) */}
      <mesh position={[bodyRadius * 0.3, -leadLength * 0.7, 0]}>
        <cylinderGeometry args={[leadRadius, leadRadius, leadLength * 1.4, 12]} />
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

// Connector points for wiring
export function getCapacitorConnectorPoints(params: CapacitorParams = {}): ConnectorPoint[] {
  const type = params.type ?? 'electrolytic';
  const diameter = params.diameter ?? 0.25;
  const leadLength = 0.25;

  if (type === 'ceramic') {
    const discRadius = diameter / 2;
    const discThickness = 0.08;
    return [
      {
        id: 'lead1',
        position: { x: -discRadius * 0.4, y: -discThickness / 2 - leadLength, z: 0 },
        direction: { x: 0, y: -1, z: 0 },
      },
      {
        id: 'lead2',
        position: { x: discRadius * 0.4, y: -discThickness / 2 - leadLength, z: 0 },
        direction: { x: 0, y: -1, z: 0 },
      },
    ];
  }

  // Electrolytic
  const bodyRadius = diameter / 2;
  return [
    {
      id: 'negative',
      position: { x: -bodyRadius * 0.3, y: -leadLength, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    {
      id: 'positive',
      position: { x: bodyRadius * 0.3, y: -leadLength * 1.4, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
