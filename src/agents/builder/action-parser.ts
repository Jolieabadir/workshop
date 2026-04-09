// ============================================================
// Workshop — Builder Action Parser
// ============================================================

import type { BuilderAction, CanvasState, NodeType, NodeShape, Vec3, IntentType, HandGesture } from '@/core/types';

/** Structured intent from Input Manager */
export interface IntentData {
  type: IntentType;
  targetNodeId?: string;
  secondaryNodeId?: string;
  position?: Vec3;
  gesture?: HandGesture;
  resolvedReferences: {
    thisNode?: string;
    thatNode?: string;
    herePosition?: Vec3;
    therePosition?: Vec3;
  };
}

/** Format canvas state as text for the LLM */
export function formatCanvasStateForLLM(state: CanvasState): string {
  const nodes = Object.values(state.nodes);
  const connections = Object.values(state.connections);
  const groups = Object.values(state.groups);

  let output = '## Current Canvas State\n\n';

  if (nodes.length === 0) {
    output += 'The canvas is empty.\n';
  } else {
    output += '### Nodes:\n';
    for (const node of nodes) {
      output += `- ID: "${node.id}" | Type: ${node.type} | Shape: ${node.shape || 'sphere'} | Title: "${node.title || '(none)'}" | Content: "${node.content.slice(0, 100)}"\n`;
      output += `  Position: (${node.position.x.toFixed(1)}, ${node.position.y.toFixed(1)}, ${node.position.z.toFixed(1)})\n`;
    }
  }

  if (connections.length > 0) {
    output += '\n### Connections:\n';
    for (const conn of connections) {
      output += `- "${conn.fromId}" -> "${conn.toId}"${conn.label ? ` [${conn.label}]` : ''}\n`;
    }
  }

  if (groups.length > 0) {
    output += '\n### Groups:\n';
    for (const group of groups) {
      output += `- "${group.label}": [${group.nodeIds.join(', ')}]\n`;
    }
  }

  if (state.focusStack.length > 0) {
    output += `\n### Focus Stack (most recent first):\n`;
    output += state.focusStack.slice(0, 5).map((id) => `"${id}"`).join(', ') + '\n';
    output += `(Use the first ID when user says "this" or "that")\n`;
  }

  return output;
}

/** Format intent context for the Builder prompt */
export function formatIntentContext(intent: IntentData, state: CanvasState): string {
  const parts: string[] = [];

  parts.push(`## Spatial Context (from Input Manager)`);
  parts.push(`Intent type: ${intent.type}`);

  if (intent.targetNodeId) {
    const node = state.nodes[intent.targetNodeId];
    if (node) {
      parts.push(`User is pointing at: "${node.title || node.content.slice(0, 30)}" (ID: ${intent.targetNodeId})`);
    } else {
      parts.push(`Target node ID: ${intent.targetNodeId}`);
    }
  }

  if (intent.secondaryNodeId) {
    const node = state.nodes[intent.secondaryNodeId];
    if (node) {
      parts.push(`Secondary reference: "${node.title || node.content.slice(0, 30)}" (ID: ${intent.secondaryNodeId})`);
    }
  }

  if (intent.position) {
    parts.push(`Target position: (${intent.position.x.toFixed(1)}, ${intent.position.y.toFixed(1)}, ${intent.position.z.toFixed(1)})`);
  }

  if (intent.gesture && intent.gesture !== 'none') {
    parts.push(`Active gesture: ${intent.gesture}`);
  }

  // Resolved references
  const refs = intent.resolvedReferences;
  if (refs.thisNode || refs.thatNode) {
    const refParts: string[] = [];
    if (refs.thisNode) {
      const node = state.nodes[refs.thisNode];
      refParts.push(`"this" → ${node ? `"${node.title || node.id}"` : refs.thisNode}`);
    }
    if (refs.thatNode) {
      const node = state.nodes[refs.thatNode];
      refParts.push(`"that" → ${node ? `"${node.title || node.id}"` : refs.thatNode}`);
    }
    parts.push(`Resolved references: ${refParts.join(', ')}`);
  }

  if (refs.herePosition) {
    parts.push(`"here" → (${refs.herePosition.x.toFixed(1)}, ${refs.herePosition.y.toFixed(1)}, ${refs.herePosition.z.toFixed(1)})`);
  }

  if (refs.therePosition) {
    parts.push(`"there" → (${refs.therePosition.x.toFixed(1)}, ${refs.therePosition.y.toFixed(1)}, ${refs.therePosition.z.toFixed(1)})`);
  }

  return parts.join('\n');
}

/** Parse a tool call from Claude into a BuilderAction */
export function parseToolCallToAction(toolName: string, toolInput: Record<string, unknown>): BuilderAction | null {
  switch (toolName) {
    case 'create_node':
      return {
        type: 'create_node',
        nodeType: (toolInput.nodeType as NodeType) || 'text_card',
        shape: (toolInput.shape as NodeShape) || 'sphere',
        content: toolInput.content as string,
        title: toolInput.title as string | undefined,
        position: toolInput.position as Vec3 | undefined,
      };

    case 'create_connection':
      return {
        type: 'create_connection',
        fromId: toolInput.fromId as string,
        toId: toolInput.toId as string,
        label: toolInput.label as string | undefined,
      };

    case 'group_nodes':
      return {
        type: 'group_nodes',
        nodeIds: toolInput.nodeIds as string[],
        label: toolInput.label as string,
      };

    case 'move_node':
      return {
        type: 'move_node',
        nodeId: toolInput.nodeId as string,
        position: toolInput.position as Vec3,
      };

    case 'update_node':
      return {
        type: 'update_node',
        nodeId: toolInput.nodeId as string,
        changes: toolInput.changes as Partial<{ content: string; title: string; color: string }>,
      };

    case 'delete_node':
      return {
        type: 'delete_node',
        nodeId: toolInput.nodeId as string,
      };

    case 'respond_verbally':
      return {
        type: 'respond_verbally',
        message: toolInput.message as string,
      };

    default:
      console.warn(`Unknown tool: ${toolName}`);
      return null;
  }
}
