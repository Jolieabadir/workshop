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

export function getConnectorPointsForComponent(
  componentType: ComponentType,
  params: Record<string, unknown> = {}
): ConnectorPoint[] {
  // Connector points are returned in local component coordinates.
  // ConnectionLine.tsx handles scaling by COMPONENT_SCALE when computing world positions.
  switch (componentType) {
    // Electronic components
    case 'resistor':
      return getResistorConnectorPoints(params);
    case 'capacitor':
      return getCapacitorConnectorPoints(params);
    case 'ic':
      return getICConnectorPoints(params);
    case 'led':
      return getLEDConnectorPoints(params);
    case 'connector':
      return getConnectorConnectorPoints(params);
    // Mechanical primitives
    case 'plate':
      return getPlateConnectorPoints(params);
    case 'shaft':
      return getShaftConnectorPoints(params);
    case 'bearing':
      return getBearingConnectorPoints(params);
    case 'bracket':
      return getBracketConnectorPoints(params);
    case 'link':
      return getLinkConnectorPoints(params);
    case 'joint':
      return getJointConnectorPoints(params);
    case 'housing':
      return getHousingConnectorPoints(params);
    case 'gear':
      return getGearConnectorPoints(params);
    default:
      return [];
  }
}
