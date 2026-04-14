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

// ============================================================
// Geometric Primitive Generators
// ============================================================

export { Cone, getConeConnectorPoints } from './Cone';
export type { ConeParams } from './Cone';

export { Sphere, getSphereConnectorPoints } from './Sphere';
export type { SphereParams } from './Sphere';

export { Hemisphere, getHemisphereConnectorPoints } from './Hemisphere';
export type { HemisphereParams } from './Hemisphere';

export { Cylinder, getCylinderConnectorPoints } from './Cylinder';
export type { CylinderParams } from './Cylinder';

export { Torus, getTorusConnectorPoints } from './Torus';
export type { TorusParams } from './Torus';

export { Wedge, getWedgeConnectorPoints } from './Wedge';
export type { WedgeParams } from './Wedge';

export { Tube, getTubeConnectorPoints } from './Tube';
export type { TubeParams } from './Tube';

export { Fin, getFinConnectorPoints } from './Fin';
export type { FinParams } from './Fin';

export { Nozzle, getNozzleConnectorPoints } from './Nozzle';
export type { NozzleParams } from './Nozzle';

export { Dome, getDomeConnectorPoints } from './Dome';
export type { DomeParams } from './Dome';

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
import { getConeConnectorPoints } from './Cone';
import { getSphereConnectorPoints } from './Sphere';
import { getHemisphereConnectorPoints } from './Hemisphere';
import { getCylinderConnectorPoints } from './Cylinder';
import { getTorusConnectorPoints } from './Torus';
import { getWedgeConnectorPoints } from './Wedge';
import { getTubeConnectorPoints } from './Tube';
import { getFinConnectorPoints } from './Fin';
import { getNozzleConnectorPoints } from './Nozzle';
import { getDomeConnectorPoints } from './Dome';
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
    // Geometric primitives
    case 'cone':
      return getConeConnectorPoints(params);
    case 'sphere':
      return getSphereConnectorPoints(params);
    case 'hemisphere':
      return getHemisphereConnectorPoints(params);
    case 'cylinder':
      return getCylinderConnectorPoints(params);
    case 'torus':
      return getTorusConnectorPoints(params);
    case 'wedge':
      return getWedgeConnectorPoints(params);
    case 'tube':
      return getTubeConnectorPoints(params);
    case 'fin':
      return getFinConnectorPoints(params);
    case 'nozzle':
      return getNozzleConnectorPoints(params);
    case 'dome':
      return getDomeConnectorPoints(params);
    default:
      return [];
  }
}
