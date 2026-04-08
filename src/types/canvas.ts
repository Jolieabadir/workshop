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

/** Which hand (MediaPipe handedness) */
export type Handedness = 'Left' | 'Right';

/** State for a single hand */
export interface SingleHandState {
  /** Whether this hand is currently detected */
  isDetected: boolean;
  /** Current position in 3D space (mapped from screen) */
  position: Vec3 | null;
  /** Screen-space position (normalized 0-1) */
  screenPosition: { x: number; y: number } | null;
  /** Current detected gesture */
  gesture: HandGesture;
  /** Pinch distance (thumb to index tip) */
  pinchDistance: number;
  /** Palm center position (normalized 0-1) for navigation */
  palmCenter: { x: number; y: number } | null;
}

/** Two-hand tracking state */
export interface TwoHandState {
  /** Whether hand tracking system is active */
  isTracking: boolean;
  /** Left hand state (navigation: camera orbit/pan/zoom) */
  leftHand: SingleHandState;
  /** Right hand state (interaction: cursor, grab, move nodes) */
  rightHand: SingleHandState;
  /** ID of node currently being grabbed by right hand */
  grabbedNodeId: string | null;
  /** ID of node currently being hovered by right hand */
  hoveredNodeId: string | null;
  /** Camera control deltas from left hand (applied to OrbitControls) */
  cameraControl: {
    /** Azimuthal angle delta (left-right rotation) */
    azimuthDelta: number;
    /** Polar angle delta (up-down rotation) */
    polarDelta: number;
    /** Zoom delta (forward-back movement) */
    zoomDelta: number;
    /** Whether left hand is actively controlling camera */
    isActive: boolean;
  };
}

/** Legacy single-hand state (for backwards compatibility) */
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

// ============================================================
// Input Manager Types
// ============================================================

/** Input source types */
export type InputSource = 'voice' | 'hand' | 'mouse';

/** Unified intent types that the Builder can act on */
export type IntentType =
  | 'create'           // Create a new node
  | 'connect'          // Connect two nodes
  | 'move'             // Move a node to a position
  | 'delete'           // Delete a node
  | 'select'           // Select/focus a node
  | 'group'            // Group nodes together
  | 'update'           // Update node content
  | 'navigate'         // Camera/view navigation
  | 'gesture_only'     // Pure gesture without voice
  | 'voice_only'       // Voice command without spatial context
  | 'unknown';         // Unrecognized intent

/** A unified input intent combining voice + gesture + spatial context */
export interface UnifiedIntent {
  id: string;
  timestamp: number;
  type: IntentType;

  /** The raw voice transcript (if any) */
  transcript?: string;

  /** Whether this is a final (speech_final) or interim transcript */
  isFinal: boolean;

  /** Node currently being pointed at (via hand or mouse) */
  targetNodeId?: string;

  /** Secondary node for connections ("connect this to that") */
  secondaryNodeId?: string;

  /** Target position in 3D space (where hand/mouse is pointing) */
  position?: Vec3;

  /** Active gesture when intent was formed */
  gesture?: HandGesture;

  /** Which input source triggered this intent */
  source: InputSource;

  /** Confidence score (0-1) for intent classification */
  confidence: number;

  /** Resolved spatial references from transcript */
  resolvedReferences: {
    /** "this" resolved to node ID */
    thisNode?: string;
    /** "that" resolved to node ID */
    thatNode?: string;
    /** "here" resolved to position */
    herePosition?: Vec3;
    /** "there" resolved to position */
    therePosition?: Vec3;
  };
}

/** Input state maintained by the Input Manager */
export interface InputState {
  /** Currently pointed-at node (via hand ray or mouse hover) */
  pointedNodeId: string | null;

  /** Current 3D position being pointed at */
  pointedPosition: Vec3 | null;

  /** Active gesture */
  activeGesture: HandGesture;

  /** Latest transcript (interim or final) */
  currentTranscript: string;

  /** Whether we're waiting for speech to finalize */
  isAwaitingSpeechFinal: boolean;

  /** Last final transcript (for reference resolution) */
  lastFinalTranscript: string;

  /** Timestamp of last input activity */
  lastActivityAt: number;

  /** Queue of pending intents to be processed */
  pendingIntents: UnifiedIntent[];

  /** History of recent intents for context */
  intentHistory: UnifiedIntent[];

  /** Mouse position (screen coords, fallback input) */
  mousePosition: { x: number; y: number } | null;

  /** Whether mouse is primary input (no hand tracking) */
  mouseAsPrimary: boolean;
}
