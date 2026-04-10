'use client';

import type { Vec3 } from '@/core/types';

export interface LEDParams {
  color?: string;
  size?: number;
  shape?: 'round' | 'square';
}

export interface ConnectorPoint {
  id: string;
  position: Vec3;
  direction: Vec3;
}

interface LEDProps {
  params?: LEDParams;
  scale?: number;
  color?: string;  // Override for LED color (takes priority over params.color)
}

// Parse color - handles both hex and named colors
function parseColor(color: string): string {
  const namedColors: Record<string, string> = {
    red: '#ff2200',
    green: '#00ff44',
    blue: '#0066ff',
    yellow: '#ffee00',
    orange: '#ff6600',
    white: '#ffffff',
    amber: '#ffbf00',
    pink: '#ff69b4',
    purple: '#9400d3',
    cyan: '#00ffff',
  };

  if (color.startsWith('#')) return color;
  return namedColors[color.toLowerCase()] || '#ff0000';
}

export function LED({ params = {}, scale = 1, color: colorOverride }: LEDProps) {
  const {
    color: paramsColor = '#ff0000',
    size = 0.15,
    shape = 'round',
  } = params;

  const ledColor = parseColor(colorOverride || paramsColor);
  const baseHeight = 0.08;
  const baseRadius = size * 0.8;
  const domeRadius = size;
  const anodeLength = 0.35; // longer leg
  const cathodeLength = 0.25; // shorter leg
  const leadRadius = 0.012;
  const leadSpacing = size * 0.5;

  if (shape === 'square') {
    // Square LED (like SMD or indicator LED)
    const boxSize = size * 1.5;

    return (
      <group scale={[scale, scale, scale]}>
        {/* Square body */}
        <mesh position={[0, boxSize / 4, 0]}>
          <boxGeometry args={[boxSize, boxSize / 2, boxSize]} />
          <meshPhysicalMaterial
            color={ledColor}
            emissive={ledColor}
            emissiveIntensity={1.5}
            transparent
            opacity={0.9}
            transmission={0.2}
          />
        </mesh>

        {/* Lens bump on top */}
        <mesh position={[0, boxSize / 2, 0]}>
          <sphereGeometry args={[boxSize * 0.25, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial
            color={ledColor}
            emissive={ledColor}
            emissiveIntensity={2.0}
            transparent
            opacity={0.95}
            transmission={0.3}
          />
        </mesh>

        {/* Anode lead (longer) */}
        <mesh position={[-leadSpacing / 2, -anodeLength / 2, 0]}>
          <cylinderGeometry args={[leadRadius, leadRadius, anodeLength, 12]} />
          <meshPhysicalMaterial
            color="#c0c0c0"
            metalness={0.9}
            roughness={0.15}
          />
        </mesh>

        {/* Cathode lead (shorter) */}
        <mesh position={[leadSpacing / 2, -cathodeLength / 2, 0]}>
          <cylinderGeometry args={[leadRadius, leadRadius, cathodeLength, 12]} />
          <meshPhysicalMaterial
            color="#c0c0c0"
            metalness={0.9}
            roughness={0.15}
          />
        </mesh>
      </group>
    );
  }

  // Round LED (default - T1-3/4 style)
  return (
    <group scale={[scale, scale, scale]}>
      {/* Cylindrical base */}
      <mesh position={[0, baseHeight / 2, 0]}>
        <cylinderGeometry args={[baseRadius, baseRadius, baseHeight, 24]} />
        <meshPhysicalMaterial
          color="#999999"
          metalness={0.1}
          roughness={0.5}
        />
      </mesh>

      {/* Dome top */}
      <mesh position={[0, baseHeight, 0]}>
        <sphereGeometry args={[domeRadius, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color={ledColor}
          emissive={ledColor}
          emissiveIntensity={1.5}
          transparent
          opacity={0.9}
          transmission={0.3}
        />
      </mesh>

      {/* Flat side indicator (cathode mark) */}
      <mesh position={[baseRadius * 0.9, baseHeight / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[baseHeight * 0.8, 0.01, baseRadius * 0.3]} />
        <meshPhysicalMaterial
          color="#666666"
          metalness={0}
          roughness={0.7}
        />
      </mesh>

      {/* Anode lead (longer, positive) */}
      <mesh position={[-leadSpacing / 2, -anodeLength / 2, 0]}>
        <cylinderGeometry args={[leadRadius, leadRadius, anodeLength, 12]} />
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.15}
        />
      </mesh>

      {/* Cathode lead (shorter, negative) */}
      <mesh position={[leadSpacing / 2, -cathodeLength / 2, 0]}>
        <cylinderGeometry args={[leadRadius, leadRadius, cathodeLength, 12]} />
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.15}
        />
      </mesh>
    </group>
  );
}

// Connector points for wiring
export function getLEDConnectorPoints(params: LEDParams = {}): ConnectorPoint[] {
  const size = params.size ?? 0.15;
  const anodeLength = 0.35;
  const cathodeLength = 0.25;
  const leadSpacing = size * 0.5;

  return [
    {
      id: 'anode',
      position: { x: -leadSpacing / 2, y: -anodeLength, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
    {
      id: 'cathode',
      position: { x: leadSpacing / 2, y: -cathodeLength, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
    },
  ];
}
