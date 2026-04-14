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
import { Cone, ConeParams } from './Cone';
import { Sphere, SphereParams } from './Sphere';
import { Hemisphere, HemisphereParams } from './Hemisphere';
import { Cylinder, CylinderParams } from './Cylinder';
import { Torus, TorusParams } from './Torus';
import { Wedge, WedgeParams } from './Wedge';
import { Tube, TubeParams } from './Tube';
import { Fin, FinParams } from './Fin';
import { Nozzle, NozzleParams } from './Nozzle';
import { Dome, DomeParams } from './Dome';

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
  | 'gear'
  // Geometric primitives
  | 'cone'
  | 'sphere'
  | 'hemisphere'
  | 'cylinder'
  | 'torus'
  | 'wedge'
  | 'tube'
  | 'fin'
  | 'nozzle'
  | 'dome';

export interface ComponentGeneratorProps {
  componentType: ComponentType;
  params?: Record<string, unknown>;
  scale?: number;
  color?: string;  // Optional color override from node.color
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
export function ComponentGenerator({ componentType, params = {}, scale = 1, color }: ComponentGeneratorProps) {
  let component: React.ReactNode;

  switch (componentType) {
    // Electronic components
    case 'resistor':
      component = <Resistor params={params as ResistorParams} scale={scale} color={color} />;
      break;

    case 'capacitor':
      component = <Capacitor params={params as CapacitorParams} scale={scale} color={color} />;
      break;

    case 'ic':
      component = <IC params={params as ICParams} scale={scale} color={color} />;
      break;

    case 'led':
      component = <LED params={params as LEDParams} scale={scale} color={color} />;
      break;

    case 'connector':
      component = <Connector params={params as ConnectorParams} scale={scale} color={color} />;
      break;

    // Mechanical primitives
    case 'plate':
      component = <Plate params={params as PlateParams} scale={scale} color={color} />;
      break;

    case 'shaft':
      component = <Shaft params={params as ShaftParams} scale={scale} color={color} />;
      break;

    case 'bearing':
      component = <Bearing params={params as BearingParams} scale={scale} color={color} />;
      break;

    case 'bracket':
      component = <Bracket params={params as BracketParams} scale={scale} color={color} />;
      break;

    case 'link':
      component = <Link params={params as LinkParams} scale={scale} color={color} />;
      break;

    case 'joint':
      component = <Joint params={params as JointParams} scale={scale} color={color} />;
      break;

    case 'housing':
      component = <Housing params={params as HousingParams} scale={scale} color={color} />;
      break;

    case 'gear':
      component = <Gear params={params as GearParams} scale={scale} color={color} />;
      break;

    // Geometric primitives
    case 'cone':
      component = <Cone params={params as ConeParams} scale={scale} color={color} />;
      break;

    case 'sphere':
      component = <Sphere params={params as SphereParams} scale={scale} color={color} />;
      break;

    case 'hemisphere':
      component = <Hemisphere params={params as HemisphereParams} scale={scale} color={color} />;
      break;

    case 'cylinder':
      component = <Cylinder params={params as CylinderParams} scale={scale} color={color} />;
      break;

    case 'torus':
      component = <Torus params={params as TorusParams} scale={scale} color={color} />;
      break;

    case 'wedge':
      component = <Wedge params={params as WedgeParams} scale={scale} color={color} />;
      break;

    case 'tube':
      component = <Tube params={params as TubeParams} scale={scale} color={color} />;
      break;

    case 'fin':
      component = <Fin params={params as FinParams} scale={scale} color={color} />;
      break;

    case 'nozzle':
      component = <Nozzle params={params as NozzleParams} scale={scale} color={color} />;
      break;

    case 'dome':
      component = <Dome params={params as DomeParams} scale={scale} color={color} />;
      break;

    default:
      // Fallback: render a simple box placeholder
      component = (
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color={color || "#888888"} />
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
