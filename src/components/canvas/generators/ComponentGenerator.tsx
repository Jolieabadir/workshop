'use client';

import { Resistor, ResistorParams } from './Resistor';
import { Capacitor, CapacitorParams } from './Capacitor';
import { IC, ICParams } from './IC';
import { LED, LEDParams } from './LED';
import { Connector, ConnectorParams } from './Connector';
import { Plate, PlateParams } from './Plate';
import { Shaft, ShaftParams } from './Shaft';
import { Bearing, BearingParams } from './Bearing';
import { Bracket, BracketParams } from './Bracket';
import { Link, LinkParams } from './Link';
import { Joint, JointParams } from './Joint';
import { Housing, HousingParams } from './Housing';
import { Gear, GearParams } from './Gear';

export type ComponentType =
  // Electronic components
  | 'resistor'
  | 'capacitor'
  | 'ic'
  | 'led'
  | 'connector'
  // Mechanical primitives
  | 'plate'
  | 'shaft'
  | 'bearing'
  | 'bracket'
  | 'link'
  | 'joint'
  | 'housing'
  | 'gear';

export interface ComponentGeneratorProps {
  componentType: ComponentType;
  params?: Record<string, unknown>;
  scale?: number;
}

/**
 * ComponentGenerator - Renders the appropriate 3D component
 * based on componentType and params.
 *
 * Supports both electronic components (resistor, capacitor, etc.)
 * and mechanical primitives (plate, shaft, link, joint, etc.)
 */
export function ComponentGenerator({ componentType, params = {}, scale = 1 }: ComponentGeneratorProps) {
  switch (componentType) {
    // Electronic components
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

    // Mechanical primitives
    case 'plate':
      return <Plate params={params as PlateParams} scale={scale} />;

    case 'shaft':
      return <Shaft params={params as ShaftParams} scale={scale} />;

    case 'bearing':
      return <Bearing params={params as BearingParams} scale={scale} />;

    case 'bracket':
      return <Bracket params={params as BracketParams} scale={scale} />;

    case 'link':
      return <Link params={params as LinkParams} scale={scale} />;

    case 'joint':
      return <Joint params={params as JointParams} scale={scale} />;

    case 'housing':
      return <Housing params={params as HousingParams} scale={scale} />;

    case 'gear':
      return <Gear params={params as GearParams} scale={scale} />;

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
