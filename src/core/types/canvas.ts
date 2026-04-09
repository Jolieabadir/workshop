// ============================================================
// Workshop — 3D Canvas Object Model
// ============================================================

export type NodeType = 'text_card' | 'diagram' | 'table' | 'code_block' | 'image' | 'placeholder';

/** 3D shape for rendering the node in the scene */
export type NodeShape =
  | 'sphere'       // concepts, abstract ideas
  | 'cube'         // components, concrete things
  | 'hexagon'      // categories, groups
  | 'cylinder'     // processes, flows
  | 'torus'        // questions, unknowns
  | 'cone'         // decisions, direction, funneling
  | 'octahedron'   // constraints, boundaries, rules
  | 'dodecahedron' // complex ideas, multifaceted concepts
  | 'knot'         // dependencies, entanglements, problems
  | 'icosahedron'; // data points, metrics, measurements

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
