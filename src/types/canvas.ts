// ============================================================
// Workshop — 3D Canvas Object Model
// ============================================================

export type NodeType = 'text_card' | 'diagram' | 'table' | 'code_block' | 'image' | 'placeholder';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A single idea-node floating in 3D space */
export interface CanvasNode {
  id: string;
  type: NodeType;
  content: string;
  title?: string;
  position: Vec3;
  scale?: Vec3;
  color?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  /** Warnings or info badges added by the mechanic crew */
  badges?: Badge[];
}

export interface Badge {
  id: string;
  type: 'warning' | 'info' | 'error' | 'success';
  message: string;
  source: 'owl' | 'cat' | 'safety';
}

/** A connection between two nodes */
export interface CanvasConnection {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  color?: string;
}

/** A spatial group of nodes */
export interface CanvasGroup {
  id: string;
  label: string;
  nodeIds: string[];
  position: Vec3;
  color?: string;
}

/** The full canvas state */
export interface CanvasState {
  nodes: Record<string, CanvasNode>;
  connections: Record<string, CanvasConnection>;
  groups: Record<string, CanvasGroup>;
  /** Ordered list of recently touched node IDs (most recent first) */
  focusStack: string[];
}

/** Actions the Builder can perform via tool calls */
export type BuilderAction =
  | { type: 'create_node'; nodeType: NodeType; content: string; title?: string; position?: Vec3 }
  | { type: 'create_connection'; fromId: string; toId: string; label?: string }
  | { type: 'group_nodes'; nodeIds: string[]; label: string }
  | { type: 'move_node'; nodeId: string; position: Vec3 }
  | { type: 'update_node'; nodeId: string; changes: Partial<CanvasNode> }
  | { type: 'delete_node'; nodeId: string }
  | { type: 'respond_verbally'; message: string };
