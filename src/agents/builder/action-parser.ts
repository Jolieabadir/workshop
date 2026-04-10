// ============================================================
// Workshop — Builder Action Parser
// ============================================================

import type { BuilderAction, CanvasState, NodeType, NodeShape, Vec3, IntentType, HandGesture, ComponentType } from '@/core/types';

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

/** Spatial context from hand tracking for the Builder agent */
export interface SpatialContext {
  // Right hand (interaction: pinch to grab/drag, resize to scale)
  rightHand: {
    gesture: HandGesture;
    position: Vec3 | null;
    isDetected: boolean;
  };
  // Left hand (navigation: open_palm to orbit camera)
  leftHand: {
    gesture: HandGesture;
    position: Vec3 | null;
    isDetected: boolean;
  };
  // Node interaction state
  hoveredNodeId: string | null;
  grabbedNodeId: string | null;
  pointedNodeId: string | null;
  // Resolved references from voice + gesture fusion
  resolvedReferences: {
    thisNode?: string;
    thatNode?: string;
    herePosition?: Vec3;
    therePosition?: Vec3;
  };
  // Is camera navigation active (left hand open palm)
  isCameraNavigating: boolean;
  // Deprecated - kept for backwards compatibility
  nextPlacementPosition?: Vec3 | null;
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

/** Format spatial context for the Builder prompt */
export function formatSpatialContext(spatial: SpatialContext, state: CanvasState): string {
  const lines: string[] = ['## Spatial Context'];

  // Right hand state (interaction hand)
  if (spatial.rightHand.isDetected) {
    let rightDesc = `Right hand gesture: ${spatial.rightHand.gesture}`;
    if (spatial.hoveredNodeId) {
      const node = state.nodes[spatial.hoveredNodeId];
      if (node) {
        rightDesc += `\nRight hand hovering over: "${node.title || node.content.slice(0, 30)}" (ID: ${spatial.hoveredNodeId})`;
      }
    }
    if (spatial.rightHand.position) {
      const p = spatial.rightHand.position;
      rightDesc += `\nRight hand position: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
    }
    lines.push(rightDesc);
  } else {
    lines.push('Right hand: not detected');
  }

  // Left hand state (navigation hand)
  if (spatial.leftHand.isDetected) {
    const navNote = spatial.isCameraNavigating ? ' (navigating camera)' : '';
    lines.push(`Left hand gesture: ${spatial.leftHand.gesture}${navNote}`);
  } else {
    lines.push('Left hand: not detected');
  }

  // Grabbed node
  if (spatial.grabbedNodeId) {
    const node = state.nodes[spatial.grabbedNodeId];
    if (node) {
      lines.push(`Grabbed node: "${node.title || node.content.slice(0, 30)}" (ID: ${spatial.grabbedNodeId})`);
    } else {
      lines.push(`Grabbed node: ${spatial.grabbedNodeId}`);
    }
  } else {
    lines.push('Grabbed node: none');
  }

  // Resolved references
  const refs = spatial.resolvedReferences;
  const refLines: string[] = [];
  if (refs.thisNode) {
    const node = state.nodes[refs.thisNode];
    refLines.push(`  "this" → "${node?.title || node?.content.slice(0, 30) || refs.thisNode}" (ID: ${refs.thisNode})`);
  }
  if (refs.thatNode) {
    const node = state.nodes[refs.thatNode];
    refLines.push(`  "that" → "${node?.title || node?.content.slice(0, 30) || refs.thatNode}" (ID: ${refs.thatNode})`);
  }
  if (refs.herePosition) {
    const p = refs.herePosition;
    refLines.push(`  "here" → position (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
  if (refs.therePosition) {
    const p = refs.therePosition;
    refLines.push(`  "there" → position (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
  }

  if (refLines.length > 0) {
    lines.push('Resolved references:');
    lines.push(...refLines);
  } else {
    lines.push('Resolved references: none');
  }

  return lines.join('\n');
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
      // Fallback: convert create_node calls to housing components
      return {
        type: 'create_component',
        componentType: 'housing' as ComponentType,
        params: { width: 30, height: 20, depth: 15, wallThickness: 2, openFace: 'none' },
        title: (toolInput.title as string) || (toolInput.content as string) || 'Untitled',
        position: toolInput.position as Vec3 | undefined,
      };

    case 'create_component':
      return {
        type: 'create_component',
        componentType: toolInput.componentType as ComponentType,
        params: (toolInput.params as Record<string, unknown>) || {},
        title: toolInput.title as string,
        position: toolInput.position as Vec3 | undefined,
        rotation: toolInput.rotation as Vec3 | undefined,
      };

    case 'create_connection':
      return {
        type: 'create_connection',
        fromId: toolInput.fromId as string,
        toId: toolInput.toId as string,
        fromPort: toolInput.fromPort as string | undefined,
        toPort: toolInput.toPort as string | undefined,
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
