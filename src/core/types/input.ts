// ============================================================
// Workshop — Input & Hand Tracking Types
// ============================================================

import type { Vec3 } from './canvas';

/**
 * Hand gesture types for MediaPipe tracking.
 * Right hand uses: 'pinch' (grab/drag), 'resize' (scale), 'none' (passive hover)
 * Left hand uses: 'open_palm' (camera orbit), 'fist' (reset camera), 'pinch' (zoom), 'none' (idle)
 */
export type HandGesture = 'none' | 'point' | 'pinch' | 'open_palm' | 'fist' | 'resize';

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
