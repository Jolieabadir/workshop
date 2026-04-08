// ============================================================
// Workshop — 3D Canvas Object Model
// ============================================================

export type NodeType = 'text_card' | 'diagram' | 'table' | 'code_block' | 'image' | 'placeholder';

/** 3D shape for rendering the node in the scene */
export type NodeShape = 'sphere' | 'cube' | 'hexagon' | 'cylinder' | 'torus';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A single idea-node floating in 3D space */
export interface CanvasNode {
  id: string;
  type: NodeType;
  /** 3D shape: sphere (concepts), cube (components), cylinder (processes), hexagon (categories), torus (questions) */
  shape: NodeShape;
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

/** Hand gesture types for MediaPipe tracking */
export type HandGesture = 'none' | 'point' | 'pinch' | 'open_palm' | 'fist';

/** Hand tracking state */
export interface HandState {
  /** Whether hand tracking is active */
  isTracking: boolean;
  /** Current hand position in 3D space (mapped from screen) */
  position: Vec3 | null;
  /** Screen-space position (normalized 0-1) */
  screenPosition: { x: number; y: number } | null;
  /** Current detected gesture */
  gesture: HandGesture;
  /** ID of node currently being grabbed (during pinch) */
  grabbedNodeId: string | null;
  /** ID of node currently being hovered (during point) */
  hoveredNodeId: string | null;
  /** Pinch distance (thumb to index tip) */
  pinchDistance: number;
}

/** Actions the Builder can perform via tool calls */
export type BuilderAction =
  | { type: 'create_node'; nodeType: NodeType; shape: NodeShape; content: string; title?: string; position?: Vec3 }
  | { type: 'create_connection'; fromId: string; toId: string; label?: string }
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
