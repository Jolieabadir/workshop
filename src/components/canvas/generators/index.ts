// ============================================================
// Workshop — Component Generators
// Electronic components + Mechanical primitives
// ============================================================

// Main generator component
export { ComponentGenerator } from './ComponentGenerator';
export type { ComponentGeneratorProps, ComponentType } from './ComponentGenerator';

// ============================================================
// Electronic Component Generators
// ============================================================

export { Resistor, getResistorConnectorPoints } from './Resistor';
export type { ResistorParams } from './Resistor';

export { Capacitor, getCapacitorConnectorPoints } from './Capacitor';
export type { CapacitorParams } from './Capacitor';

export { IC, getICConnectorPoints } from './IC';
export type { ICParams } from './IC';

export { LED, getLEDConnectorPoints } from './LED';
export type { LEDParams } from './LED';

export { Connector, getConnectorConnectorPoints } from './Connector';
export type { ConnectorParams } from './Connector';

// ============================================================
// Mechanical Primitive Generators
// ============================================================

export { Plate, getPlateConnectorPoints } from './Plate';
export type { PlateParams, HolePosition } from './Plate';

export { Shaft, getShaftConnectorPoints } from './Shaft';
export type { ShaftParams } from './Shaft';

export { Bearing, getBearingConnectorPoints } from './Bearing';
export type { BearingParams } from './Bearing';

export { Bracket, getBracketConnectorPoints } from './Bracket';
export type { BracketParams } from './Bracket';

export { Link, getLinkConnectorPoints } from './Link';
export type { LinkParams } from './Link';

export { Joint, getJointConnectorPoints } from './Joint';
export type { JointParams } from './Joint';

export { Housing, getHousingConnectorPoints } from './Housing';
export type { HousingParams } from './Housing';

export { Gear, getGearConnectorPoints } from './Gear';
export type { GearParams } from './Gear';

// Shared connector point type
export type { ConnectorPoint } from './Resistor';

// ============================================================
// Utility: Get connector points for any component type
// ============================================================

import { getResistorConnectorPoints } from './Resistor';
import { getCapacitorConnectorPoints } from './Capacitor';
import { getICConnectorPoints } from './IC';
import { getLEDConnectorPoints } from './LED';
import { getConnectorConnectorPoints } from './Connector';
import { getPlateConnectorPoints } from './Plate';
import { getShaftConnectorPoints } from './Shaft';
import { getBearingConnectorPoints } from './Bearing';
import { getBracketConnectorPoints } from './Bracket';
import { getLinkConnectorPoints } from './Link';
import { getJointConnectorPoints } from './Joint';
import { getHousingConnectorPoints } from './Housing';
import { getGearConnectorPoints } from './Gear';
import type { ConnectorPoint } from './Resistor';
import type { ComponentType } from './ComponentGenerator';

// Must match COMPONENT_SCALE in ComponentGenerator.tsx
const COMPONENT_SCALE = 10;

export function getConnectorPointsForComponent(
  componentType: ComponentType,
  params: Record<string, unknown> = {}
): ConnectorPoint[] {
  let points: ConnectorPoint[];

  switch (componentType) {
    // Electronic components
    case 'resistor':
      points = getResistorConnectorPoints(params);
      break;
    case 'capacitor':
      points = getCapacitorConnectorPoints(params);
      break;
    case 'ic':
      points = getICConnectorPoints(params);
      break;
    case 'led':
      points = getLEDConnectorPoints(params);
      break;
    case 'connector':
      points = getConnectorConnectorPoints(params);
      break;
    // Mechanical primitives
    case 'plate':
      points = getPlateConnectorPoints(params);
      break;
    case 'shaft':
      points = getShaftConnectorPoints(params);
      break;
    case 'bearing':
      points = getBearingConnectorPoints(params);
      break;
    case 'bracket':
      points = getBracketConnectorPoints(params);
      break;
    case 'link':
      points = getLinkConnectorPoints(params);
      break;
    case 'joint':
      points = getJointConnectorPoints(params);
      break;
    case 'housing':
      points = getHousingConnectorPoints(params);
      break;
    case 'gear':
      points = getGearConnectorPoints(params);
      break;
    default:
      return [];
  }

  // Scale connector point positions to match the 10x component scale
  return points.map(point => ({
    ...point,
    position: {
      x: point.position.x * COMPONENT_SCALE,
      y: point.position.y * COMPONENT_SCALE,
      z: point.position.z * COMPONENT_SCALE,
    },
  }));
}
