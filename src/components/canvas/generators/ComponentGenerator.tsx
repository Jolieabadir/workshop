'use client';

import { Resistor, ResistorParams } from './Resistor';
import { Capacitor, CapacitorParams } from './Capacitor';
import { IC, ICParams } from './IC';
import { LED, LEDParams } from './LED';
import { Connector, ConnectorParams } from './Connector';

export type ComponentType = 'resistor' | 'capacitor' | 'ic' | 'led' | 'connector';

export interface ComponentGeneratorProps {
  componentType: ComponentType;
  params?: Record<string, unknown>;
  scale?: number;
}

/**
 * ComponentGenerator - Renders the appropriate 3D electronic component
 * based on componentType and params.
 */
export function ComponentGenerator({ componentType, params = {}, scale = 1 }: ComponentGeneratorProps) {
  switch (componentType) {
    case 'resistor':
      return <Resistor params={params as ResistorParams} scale={scale} />;

    case 'capacitor':
      return <Capacitor params={params as CapacitorParams} scale={scale} />;

    case 'ic':
      return <IC params={params as ICParams} scale={scale} />;

    case 'led':
      return <LED params={params as LEDParams} scale={scale} />;

    case 'connector':
      return <Connector params={params as ConnectorParams} scale={scale} />;

    default:
      // Fallback: render a simple box placeholder
      return (
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#888888" />
        </mesh>
      );
  }
}
