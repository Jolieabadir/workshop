// ============================================================
// Workshop — Agent Types
// ============================================================

import type { CanvasNode, NodeType, NodeShape, Vec3, ComponentType } from './canvas';

/** Actions the Builder can perform via tool calls */
export type BuilderAction =
  | { type: 'create_node'; nodeType: NodeType; shape: NodeShape; content: string; title?: string; position?: Vec3; connectedToId?: string }
  | { type: 'create_component'; componentType: ComponentType; params: Record<string, unknown>; title: string; position?: Vec3; rotation?: Vec3 }
  | { type: 'generate_mesh'; prompt: string; title: string; position?: Vec3; style?: 'realistic' | 'cartoon' }
  | { type: 'create_connection'; fromId: string; toId: string; fromPort?: string; toPort?: string; label?: string }
  | { type: 'group_nodes'; nodeIds: string[]; label: string }
  | { type: 'move_node'; nodeId: string; position: Vec3 }
  | { type: 'update_node'; nodeId: string; changes: Partial<CanvasNode> }
  | { type: 'delete_node'; nodeId: string }
  | { type: 'respond_verbally'; message: string };

/** Safety Supervisor audit log entry */
export interface SafetyLogEntry {
  id: string;
  timestamp: number;
  action: BuilderAction;
  utterance: string;
  canvasDiff: {
    nodesAdded: string[];
    nodesRemoved: string[];
    nodesModified: string[];
    connectionsAdded: string[];
    connectionsRemoved: string[];
  };
}
