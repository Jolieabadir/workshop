// ============================================================
// Workshop — Electronic Component Generators
// ============================================================

// Main generator component
export { ComponentGenerator } from './ComponentGenerator';
export type { ComponentGeneratorProps, ComponentType } from './ComponentGenerator';

// Individual component generators
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

// Shared connector point type
export type { ConnectorPoint } from './Resistor';

// Utility function to get connector points for any component type
import { getResistorConnectorPoints } from './Resistor';
import { getCapacitorConnectorPoints } from './Capacitor';
import { getICConnectorPoints } from './IC';
import { getLEDConnectorPoints } from './LED';
import { getConnectorConnectorPoints } from './Connector';
import type { ConnectorPoint } from './Resistor';
import type { ComponentType } from './ComponentGenerator';

export function getConnectorPointsForComponent(
  componentType: ComponentType,
  params: Record<string, unknown> = {}
): ConnectorPoint[] {
  switch (componentType) {
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
    default:
      return [];
  }
}
