'use client';

import { useMemo } from 'react';
import type { Vec3 } from '@/core/types';

export interface ConnectorParams {
  pinCount?: number;
  rows?: number;
  type?: 'header' | 'socket' | 'terminal';
}

export interface ConnectorPoint {
  id: string;
  position: Vec3;
  direction: Vec3;
}

interface ConnectorProps {
  params?: ConnectorParams;
  scale?: number;
  color?: string;  // Override for housing color
}

export function Connector({ params = {}, scale = 1, color }: ConnectorProps) {
  const {
    pinCount = 8,
    rows = 2,
    type = 'header',
  } = params;

  // Default colors for each type
  const terminalColor = color || '#2d8040';
  const socketColor = color || '#1a1a1a';
  const headerColor = color || '#e0e0e0';

  const pinSpacing = 0.1; // 2.54mm standard pitch scaled
  const pinRadius = 0.015;
  const pinHeight = 0.15;
  const housingHeight = 0.08;
  const housePadding = 0.04;

  const cols = Math.ceil(pinCount / rows);

  // Calculate housing dimensions
  const housingWidth = cols * pinSpacing + housePadding * 2;
  const housingDepth = rows * pinSpacing + housePadding * 2;

  // Calculate pin positions
  const pins = useMemo(() => {
    const result: { x: number; z: number; pinNumber: number }[] = [];
    const startX = -(cols - 1) * pinSpacing / 2;
    const startZ = -(rows - 1) * pinSpacing / 2;

    let pinNumber = 1;
    for (let row = 0; row < rows && pinNumber <= pinCount; row++) {
      for (let col = 0; col < cols && pinNumber <= pinCount; col++) {
        result.push({
          x: startX + col * pinSpacing,
          z: startZ + row * pinSpacing,
          pinNumber,
        });
        pinNumber++;
      }
    }
    return result;
  }, [pinCount, rows, cols, pinSpacing]);

  if (type === 'terminal') {
    // Screw terminal block
    const terminalWidth = 0.12;
    const terminalHeight = 0.15;

    return (
      <group scale={[scale, scale, scale]}>
        {/* Main housing */}
        <mesh position={[0, housingHeight / 2, 0]}>
          <boxGeometry args={[cols * terminalWidth, terminalHeight, terminalWidth]} />
          <meshPhysicalMaterial
            color={terminalColor}
            metalness={0.05}
            roughness={0.5}
          />
        </mesh>

        {/* Terminal screws on top */}
        {Array.from({ length: cols }).map((_, i) => {
          const xPos = -(cols - 1) * terminalWidth / 2 + i * terminalWidth;
          return (
            <mesh key={`screw-${i}`} position={[xPos, terminalHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.02, 6]} />
              <meshPhysicalMaterial
                color="#d0d0d0"
                metalness={0.9}
                roughness={0.2}
              />
            </mesh>
          );
        })}

        {/* Wire entry holes (front) */}
        {Array.from({ length: cols }).map((_, i) => {
          const xPos = -(cols - 1) * terminalWidth / 2 + i * terminalWidth;
          return (
            <mesh key={`hole-${i}`} position={[xPos, housingHeight / 2, terminalWidth / 2 + 0.001]}>
              <circleGeometry args={[0.02, 12]} />
              <meshPhysicalMaterial
                color="#1a1a1a"
                metalness={0}
                roughness={0.9}
              />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (type === 'socket') {
    // Female header socket
    return (
      <group scale={[scale, scale, scale]}>
        {/* Housing */}
        <mesh position={[0, housingHeight / 2, 0]}>
          <boxGeometry args={[housingWidth, housingHeight, housingDepth]} />
          <meshPhysicalMaterial
            color={socketColor}
            metalness={0.05}
            roughness={0.6}
          />
        </mesh>

        {/* Socket holes (dark recesses) */}
        {pins.map((pin) => (
          <mesh
            key={pin.pinNumber}
            position={[pin.x, housingHeight + 0.001, pin.z]}
          >
            <circleGeometry args={[pinRadius * 1.2, 12]} />
            <meshPhysicalMaterial
              color="#0a0a0a"
              metalness={0}
              roughness={0.9}
            />
          </mesh>
        ))}

        {/* Bottom pins (short stubs) */}
        {pins.map((pin) => (
          <mesh
            key={`bottom-${pin.pinNumber}`}
            position={[pin.x, -pinHeight * 0.3, pin.z]}
          >
            <cylinderGeometry args={[pinRadius * 0.8, pinRadius * 0.8, pinHeight * 0.6, 8]} />
            <meshPhysicalMaterial
              color="#daa520"
              metalness={0.85}
              roughness={0.15}
            />
          </mesh>
        ))}
      </group>
    );
  }

  // Header (default) - male pins
  return (
    <group scale={[scale, scale, scale]}>
      {/* Housing base */}
      <mesh position={[0, housingHeight / 2, 0]}>
        <boxGeometry args={[housingWidth, housingHeight, housingDepth]} />
        <meshPhysicalMaterial
          color={headerColor}
          metalness={0.05}
          roughness={0.5}
        />
      </mesh>

      {/* Pins sticking up */}
      {pins.map((pin) => (
        <mesh
          key={pin.pinNumber}
          position={[pin.x, housingHeight + pinHeight / 2, pin.z]}
        >
          <boxGeometry args={[pinRadius * 1.5, pinHeight, pinRadius * 1.5]} />
          <meshPhysicalMaterial
            color="#daa520"
            metalness={0.85}
            roughness={0.15}
          />
        </mesh>
      ))}

      {/* Pins going down (for PCB) */}
      {pins.map((pin) => (
        <mesh
          key={`bottom-${pin.pinNumber}`}
          position={[pin.x, -pinHeight * 0.4, pin.z]}
        >
          <boxGeometry args={[pinRadius * 1.2, pinHeight * 0.8, pinRadius * 1.2]} />
          <meshPhysicalMaterial
            color="#daa520"
            metalness={0.85}
            roughness={0.15}
          />
        </mesh>
      ))}
    </group>
  );
}

// Connector points for wiring
export function getConnectorConnectorPoints(params: ConnectorParams = {}): ConnectorPoint[] {
  const pinCount = params.pinCount ?? 8;
  const rows = params.rows ?? 2;
  const pinSpacing = 0.1;
  const pinHeight = 0.15;
  const housingHeight = 0.08;

  const cols = Math.ceil(pinCount / rows);
  const startX = -(cols - 1) * pinSpacing / 2;
  const startZ = -(rows - 1) * pinSpacing / 2;

  const points: ConnectorPoint[] = [];
  let pinNumber = 1;

  for (let row = 0; row < rows && pinNumber <= pinCount; row++) {
    for (let col = 0; col < cols && pinNumber <= pinCount; col++) {
      points.push({
        id: `pin${pinNumber}`,
        position: {
          x: startX + col * pinSpacing,
          y: housingHeight + pinHeight,
          z: startZ + row * pinSpacing,
        },
        direction: { x: 0, y: 1, z: 0 },
      });
      pinNumber++;
    }
  }

  return points;
}
