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

// Scale multiplier to make mm-based components visible in scene
// Generators use real mm dimensions (40mm = 0.4 units), but scene uses ~1 unit = 1m visual scale
const COMPONENT_SCALE = 10;

/**
 * ComponentGenerator - Renders the appropriate 3D component
 * based on componentType and params.
 *
 * Supports both electronic components (resistor, capacitor, etc.)
 * and mechanical primitives (plate, shaft, link, joint, etc.)
 *
 * All components are wrapped in a 10x scale group so they're visible
 * alongside regular nodes (which are ~1.2 units wide).
 */
export function ComponentGenerator({ componentType, params = {}, scale = 1 }: ComponentGeneratorProps) {
  let component: React.ReactNode;

  switch (componentType) {
    // Electronic components
    case 'resistor':
      component = <Resistor params={params as ResistorParams} scale={scale} />;
      break;

    case 'capacitor':
      component = <Capacitor params={params as CapacitorParams} scale={scale} />;
      break;

    case 'ic':
      component = <IC params={params as ICParams} scale={scale} />;
      break;

    case 'led':
      component = <LED params={params as LEDParams} scale={scale} />;
      break;

    case 'connector':
      component = <Connector params={params as ConnectorParams} scale={scale} />;
      break;

    // Mechanical primitives
    case 'plate':
      component = <Plate params={params as PlateParams} scale={scale} />;
      break;

    case 'shaft':
      component = <Shaft params={params as ShaftParams} scale={scale} />;
      break;

    case 'bearing':
      component = <Bearing params={params as BearingParams} scale={scale} />;
      break;

    case 'bracket':
      component = <Bracket params={params as BracketParams} scale={scale} />;
      break;

    case 'link':
      component = <Link params={params as LinkParams} scale={scale} />;
      break;

    case 'joint':
      component = <Joint params={params as JointParams} scale={scale} />;
      break;

    case 'housing':
      component = <Housing params={params as HousingParams} scale={scale} />;
      break;

    case 'gear':
      component = <Gear params={params as GearParams} scale={scale} />;
      break;

    default:
      // Fallback: render a simple box placeholder
      component = (
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#888888" />
        </mesh>
      );
  }

  // Wrap in 10x scale group so components are visible in scene
  return (
    <group scale={[COMPONENT_SCALE, COMPONENT_SCALE, COMPONENT_SCALE]}>
      {component}
    </group>
  );
}
