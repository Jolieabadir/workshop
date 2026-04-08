/**
 * Safety Supervisor — Action Logger
 *
 * Automatically logs every Builder action to a structured audit trail.
 * Pure function implementation — no LLM calls.
 */

import type { BuilderAction, CanvasState, SafetyLogEntry } from '@/types/canvas';
import { useSafetyStore } from '@/store/safety-store';

/**
 * Compute the diff between two canvas states
 */
function computeCanvasDiff(
  before: CanvasState,
  after: CanvasState
): SafetyLogEntry['canvasDiff'] {
  const beforeNodeIds = new Set(Object.keys(before.nodes));
  const afterNodeIds = new Set(Object.keys(after.nodes));
  const beforeConnIds = new Set(Object.keys(before.connections));
  const afterConnIds = new Set(Object.keys(after.connections));

  // Nodes added
  const nodesAdded = [...afterNodeIds].filter((id) => !beforeNodeIds.has(id));

  // Nodes removed
  const nodesRemoved = [...beforeNodeIds].filter((id) => !afterNodeIds.has(id));

  // Nodes modified (present in both, but content/position changed)
  const nodesModified: string[] = [];
  for (const id of beforeNodeIds) {
    if (afterNodeIds.has(id)) {
      const beforeNode = before.nodes[id];
      const afterNode = after.nodes[id];
      if (
        beforeNode.content !== afterNode.content ||
        beforeNode.title !== afterNode.title ||
        beforeNode.position.x !== afterNode.position.x ||
        beforeNode.position.y !== afterNode.position.y ||
        beforeNode.position.z !== afterNode.position.z ||
        beforeNode.color !== afterNode.color
      ) {
        nodesModified.push(id);
      }
    }
  }

  // Connections added
  const connectionsAdded = [...afterConnIds].filter((id) => !beforeConnIds.has(id));

  // Connections removed
  const connectionsRemoved = [...beforeConnIds].filter((id) => !afterConnIds.has(id));

  return {
    nodesAdded,
    nodesRemoved,
    nodesModified,
    connectionsAdded,
    connectionsRemoved,
  };
}

/**
 * Get a human-readable summary of an action
 */
export function getActionSummary(action: BuilderAction): string {
  switch (action.type) {
    case 'create_node':
      return `Created "${action.title || action.content.slice(0, 20)}"`;
    case 'create_connection':
      return `Connected ${action.fromId.slice(0, 4)}→${action.toId.slice(0, 4)}${action.label ? ` (${action.label})` : ''}`;
    case 'group_nodes':
      return `Grouped ${action.nodeIds.length} nodes as "${action.label}"`;
    case 'move_node':
      return `Moved node ${action.nodeId.slice(0, 4)}`;
    case 'update_node':
      return `Updated node ${action.nodeId.slice(0, 4)}`;
    case 'delete_node':
      return `Deleted node ${action.nodeId.slice(0, 4)}`;
    case 'respond_verbally':
      return `Said: "${action.message}"`;
    default:
      return 'Unknown action';
  }
}

/**
 * Get an icon/emoji for an action type
 */
export function getActionIcon(action: BuilderAction): string {
  switch (action.type) {
    case 'create_node':
      return '✦';
    case 'create_connection':
      return '↔';
    case 'group_nodes':
      return '◫';
    case 'move_node':
      return '↗';
    case 'update_node':
      return '✎';
    case 'delete_node':
      return '✕';
    case 'respond_verbally':
      return '💬';
    default:
      return '?';
  }
}

/**
 * Log a Builder action to the Safety Supervisor's audit trail
 */
export function logBuilderAction(
  action: BuilderAction,
  utterance: string,
  canvasBefore: CanvasState,
  canvasAfter: CanvasState
): void {
  const canvasDiff = computeCanvasDiff(canvasBefore, canvasAfter);

  useSafetyStore.getState().addEntry({
    timestamp: Date.now(),
    action,
    utterance,
    canvasDiff,
  });
}

/**
 * Log multiple Builder actions in sequence
 */
export function logBuilderActions(
  actions: BuilderAction[],
  utterance: string,
  canvasBefore: CanvasState,
  canvasAfter: CanvasState
): void {
  // For multiple actions, log each one but only compute diff once
  const canvasDiff = computeCanvasDiff(canvasBefore, canvasAfter);

  for (const action of actions) {
    // Skip verbal responses for the main diff log
    if (action.type === 'respond_verbally') continue;

    useSafetyStore.getState().addEntry({
      timestamp: Date.now(),
      action,
      utterance,
      canvasDiff,
    });
  }
}

/**
 * Format timestamp for display
 */
export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
