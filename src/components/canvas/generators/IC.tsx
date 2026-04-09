'use client';

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { Vec3 } from '@/core/types';

export interface ICParams {
  pinCount?: number;
  bodyWidth?: number;
  bodyLength?: number;
  label?: string;
}

export interface ConnectorPoint {
  id: string;
  position: Vec3;
  direction: Vec3;
}

interface ICProps {
  params?: ICParams;
  scale?: number;
}

export function IC({ params = {}, scale = 1 }: ICProps) {
  const {
    pinCount = 8,
    bodyWidth = 0.3,
    bodyLength = 0.6,
    label = '',
  } = params;

  const bodyHeight = 0.1;
  const pinWidth = 0.02;
  const pinHeight = 0.01;
  const pinLength = 0.08;
  const pinSpacing = 0.1; // 2.54mm standard DIP spacing scaled

  const pinsPerSide = Math.ceil(pinCount / 2);

  // Calculate pin positions
  const pins = useMemo(() => {
    const result: { x: number; z: number; side: 'left' | 'right'; pinNumber: number }[] = [];
    const startZ = -(pinsPerSide - 1) * pinSpacing / 2;

    // Left side pins (pin 1 at top-left, going down)
    for (let i = 0; i < pinsPerSide; i++) {
      result.push({
        x: -bodyWidth / 2 - pinLength / 2,
        z: startZ + i * pinSpacing,
        side: 'left',
        pinNumber: i + 1,
      });
    }

    // Right side pins (counting continues from bottom-right, going up)
    for (let i = 0; i < pinsPerSide && (pinsPerSide + i + 1) <= pinCount; i++) {
      result.push({
        x: bodyWidth / 2 + pinLength / 2,
        z: startZ + (pinsPerSide - 1 - i) * pinSpacing,
        side: 'right',
        pinNumber: pinsPerSide + i + 1,
      });
    }

    return result;
  }, [pinCount, pinsPerSide, bodyWidth, pinLength, pinSpacing]);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Main IC body */}
      <mesh position={[0, bodyHeight / 2, 0]}>
        <boxGeometry args={[bodyWidth, bodyHeight, bodyLength]} />
        <meshPhysicalMaterial
          color="#1a1a1a"
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>

      {/* Pin 1 notch/indicator (semicircular indentation at one end) */}
      <mesh position={[0, bodyHeight + 0.001, -bodyLength / 2 + 0.04]}>
        <circleGeometry args={[0.025, 16]} />
        <meshPhysicalMaterial
          color="#2a2a2a"
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>

      {/* Pins */}
      {pins.map((pin) => (
        <mesh
          key={pin.pinNumber}
          position={[pin.x, 0, pin.z]}
          rotation={[0, 0, 0]}
        >
          <boxGeometry args={[pinLength, pinHeight, pinWidth]} />
          <meshPhysicalMaterial
            color="#c0c0c0"
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Bent portion of pins (going down) */}
      {pins.map((pin) => (
        <mesh
          key={`${pin.pinNumber}-vert`}
          position={[
            pin.side === 'left' ? pin.x - pinLength / 2 + pinWidth / 2 : pin.x + pinLength / 2 - pinWidth / 2,
            -pinLength / 2,
            pin.z
          ]}
        >
          <boxGeometry args={[pinWidth, pinLength, pinWidth]} />
          <meshPhysicalMaterial
            color="#c0c0c0"
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Label on top */}
      {label && (
        <Html
          position={[0, bodyHeight + 0.02, 0]}
          center
          distanceFactor={6}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              color: '#e0e0e0',
              fontSize: '8px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              textShadow: '0 0 2px #000',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// Connector points for wiring
export function getICConnectorPoints(params: ICParams = {}): ConnectorPoint[] {
  const pinCount = params.pinCount ?? 8;
  const bodyWidth = params.bodyWidth ?? 0.3;
  const pinLength = 0.08;
  const pinSpacing = 0.1;

  const pinsPerSide = Math.ceil(pinCount / 2);
  const startZ = -(pinsPerSide - 1) * pinSpacing / 2;
  const points: ConnectorPoint[] = [];

  // Left side pins
  for (let i = 0; i < pinsPerSide; i++) {
    points.push({
      id: `pin${i + 1}`,
      position: {
        x: -bodyWidth / 2 - pinLength,
        y: -pinLength,
        z: startZ + i * pinSpacing,
      },
      direction: { x: 0, y: -1, z: 0 },
    });
  }

  // Right side pins
  for (let i = 0; i < pinsPerSide && (pinsPerSide + i + 1) <= pinCount; i++) {
    points.push({
      id: `pin${pinsPerSide + i + 1}`,
      position: {
        x: bodyWidth / 2 + pinLength,
        y: -pinLength,
        z: startZ + (pinsPerSide - 1 - i) * pinSpacing,
      },
      direction: { x: 0, y: -1, z: 0 },
    });
  }

  return points;
}
