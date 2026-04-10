'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '@/core/types';

export interface ResistorParams {
  length?: number;
  diameter?: number;
  value?: string;
  colorBands?: string[];
}

export interface ConnectorPoint {
  id: string;
  position: Vec3;
  direction: Vec3;
}

// Default color bands for a 470Ω resistor (yellow-violet-brown)
const DEFAULT_COLOR_BANDS = ['#FFD700', '#8B00FF', '#8B4513', '#FFD700'];

interface ResistorProps {
  params?: ResistorParams;
  scale?: number;
  color?: string;  // Override for main body color
}

// Standard resistor color code
const RESISTOR_COLORS: Record<string, string> = {
  black: '#1a1a1a',
  brown: '#8B4513',
  red: '#FF0000',
  orange: '#FF6600',
  yellow: '#FFD700',
  green: '#00AA00',
  blue: '#0000FF',
  violet: '#8B00FF',
  gray: '#808080',
  white: '#FFFFFF',
  gold: '#FFD700',
  silver: '#C0C0C0',
};

function parseColorBand(color: string): string {
  // If it's already a hex color, return it
  if (color.startsWith('#')) return color;
  // Otherwise look up the color name
  return RESISTOR_COLORS[color.toLowerCase()] || color;
}

export function Resistor({ params = {}, scale = 1, color }: ResistorProps) {
  const {
    length = 0.4,
    diameter = 0.15,
    colorBands = DEFAULT_COLOR_BANDS,
  } = params;

  const bodyColor = color || '#c4a882';  // ceramic beige default

  const leadLength = 0.3;
  const leadRadius = 0.015;
  const bandWidth = 0.03;
  const bandSpacing = length / (colorBands.length + 1);

  // Create band geometries
  const bands = useMemo(() => {
    return colorBands.map((color, i) => {
      const xPos = -length / 2 + bandSpacing * (i + 1);
      return {
        position: xPos,
        color: parseColorBand(color),
      };
    });
  }, [colorBands, length, bandSpacing]);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Ceramic body */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[diameter / 2, diameter / 2, length, 24]} />
        <meshPhysicalMaterial
          color={bodyColor}
          metalness={0.1}
          roughness={0.7}
        />
      </mesh>

      {/* Color bands */}
      {bands.map((band, i) => (
        <mesh key={i} position={[band.position, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[diameter / 2 + 0.002, diameter / 2 + 0.002, bandWidth, 24]} />
          <meshPhysicalMaterial
            color={band.color}
            metalness={0.1}
            roughness={0.6}
          />
        </mesh>
      ))}

      {/* Lead 1 (left) */}
      <mesh position={[-length / 2 - leadLength / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[leadRadius, leadRadius, leadLength, 12]} />
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      {/* Lead 2 (right) */}
      <mesh position={[length / 2 + leadLength / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
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

// Connector points for wiring
export function getResistorConnectorPoints(params: ResistorParams = {}): ConnectorPoint[] {
  const length = params.length ?? 0.4;
  const leadLength = 0.3;

  return [
    {
      id: 'lead1',
      position: { x: -length / 2 - leadLength, y: 0, z: 0 },
      direction: { x: -1, y: 0, z: 0 },
    },
    {
      id: 'lead2',
      position: { x: length / 2 + leadLength, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    },
  ];
}
