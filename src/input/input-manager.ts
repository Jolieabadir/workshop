/**
 * Input Manager — Central Hub for All Input Streams
 *
 * Receives and merges:
 * 1. Voice transcripts from Deepgram (with speech_final flag)
 * 2. Hand positions and gestures from MediaPipe
 * 3. Mouse/click events as fallback
 *
 * Maintains state about:
 * - Currently pointed-at node (via hand ray or mouse hover)
 * - Active gesture
 * - Latest transcript
 *
 * Resolves spatial references:
 * - "this" → pointed node or focus stack top
 * - "that" → previously pointed node or focus stack second
 * - "here" → current pointer position
 * - "there" → remembered position from gesture
 *
 * Exposes unified intents to the Builder agent.
 */

import { useInputStore } from '@/store/input-store';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';
import type {
  Vec3,
  HandGesture,
  IntentType,
  UnifiedIntent,
  InputSource,
  CanvasNode,
} from '@/core/types';

// ============================================================
// Spatial Reference Patterns
// ============================================================

const SPATIAL_PATTERNS = {
  // "this", "it", "the selected one"
  thisRef: /\b(this|it|the selected( one)?|current( one)?)\b/i,
  // "that", "the other one", "that one"
  thatRef: /\b(that( one)?|the other( one)?|previous( one)?)\b/i,
  // "here", "right here", "at this spot"
  hereRef: /\b(here|right here|this (spot|place|location|position))\b/i,
  // "there", "over there", "that spot"
  thereRef: /\b(there|over there|that (spot|place|location|position))\b/i,
};

// ============================================================
// Intent Classification Patterns
// ============================================================

const INTENT_PATTERNS: Array<{ type: IntentType; patterns: RegExp[]; confidence: number }> = [
  {
    type: 'create',
    patterns: [
      /\b(create|add|make|new|put|place)\b/i,
      /\b(idea|node|card|concept|box)\b/i,
    ],
    confidence: 0.8,
  },
  {
    type: 'connect',
    patterns: [
      /\b(connect|link|wire|join|attach|relate)\b/i,
      /\b(to|with|and)\b.*\b(to|with|and)\b/i,
    ],
    confidence: 0.85,
  },
  {
    type: 'move',
    patterns: [
      /\b(move|drag|shift|relocate|put|place)\b.*\b(to|over|here|there)\b/i,
      /\b(move|drag)\b/i,
    ],
    confidence: 0.8,
  },
  {
    type: 'delete',
    patterns: [
      /\b(delete|remove|trash|get rid of|destroy|kill)\b/i,
    ],
    confidence: 0.9,
  },
  {
    type: 'select',
    patterns: [
      /\b(select|focus|pick|choose|that one|this one)\b/i,
    ],
    confidence: 0.7,
  },
  {
    type: 'group',
    patterns: [
      /\b(group|cluster|bundle|organize|categorize)\b/i,
    ],
    confidence: 0.85,
  },
  {
    type: 'update',
    patterns: [
      /\b(update|change|edit|modify|rename|set)\b/i,
    ],
    confidence: 0.75,
  },
  {
    type: 'navigate',
    patterns: [
      /\b(zoom|pan|rotate|look at|show me|go to)\b/i,
    ],
    confidence: 0.7,
  },
];

// ============================================================
// Input Manager Class
// ============================================================

class InputManager {
  private lastPointerPosition: Vec3 | null = null;
  private gestureStartPosition: Vec3 | null = null;
  private isGestureActive = false;

  /**
   * Process a voice transcript and create a unified intent
   */
  processVoiceInput(transcript: string, isFinal: boolean): UnifiedIntent | null {
    if (!transcript.trim()) return null;

    const inputStore = useInputStore.getState();
    const canvasStore = useCanvasStore.getState();
    const handStore = useHandStore.getState();

    // Update transcript in store
    inputStore.setCurrentTranscript(transcript, isFinal);

    // Only create intents for final transcripts
    if (!isFinal) return null;

    // Resolve spatial references
    const resolvedReferences = this.resolveSpatialReferences(
      transcript,
      inputStore.pointedNodeId,
      canvasStore.focusStack,
      canvasStore.nodes,
      inputStore.pointedPosition,
      this.gestureStartPosition
    );

    // Classify intent
    const intentType = this.classifyIntent(transcript, inputStore.activeGesture);
    const confidence = this.calculateConfidence(transcript, intentType);

    // Determine target node
    const targetNodeId = resolvedReferences.thisNode || inputStore.pointedNodeId;
    const secondaryNodeId = resolvedReferences.thatNode;

    // For move intents, also capture position
    const position = resolvedReferences.therePosition || inputStore.pointedPosition;

    // Create the unified intent
    const intent = inputStore.addIntent({
      type: intentType,
      transcript,
      isFinal: true,
      targetNodeId: targetNodeId || undefined,
      secondaryNodeId: secondaryNodeId || undefined,
      position: position || undefined,
      gesture: inputStore.activeGesture !== 'none' ? inputStore.activeGesture : undefined,
      source: 'voice',
      confidence,
      resolvedReferences,
    });

    return intent;
  }

  /**
   * Process hand tracking input
   */
  processHandInput(
    gesture: HandGesture,
    position: Vec3 | null,
    hoveredNodeId: string | null
  ): void {
    const inputStore = useInputStore.getState();

    // Update pointing state
    inputStore.setPointedNode(hoveredNodeId);
    inputStore.setPointedPosition(position);
    inputStore.setActiveGesture(gesture);

    // Track gesture start for "there" resolution
    if (gesture === 'pinch' && !this.isGestureActive) {
      this.isGestureActive = true;
      this.gestureStartPosition = position;
    } else if (gesture !== 'pinch' && this.isGestureActive) {
      this.isGestureActive = false;
      // Save end position for "there" reference
      this.lastPointerPosition = position;
    }

    // Handle pure gesture intents (no voice)
    if (gesture === 'pinch' && hoveredNodeId) {
      // Grabbing a node — don't create intent yet, wait for release
    } else if (gesture === 'open_palm') {
      // Palm gesture — could be used for commands
      inputStore.addIntent({
        type: 'gesture_only',
        isFinal: true,
        gesture: 'open_palm',
        position: position || undefined,
        source: 'hand',
        confidence: 0.6,
        resolvedReferences: {},
      });
    }
  }

  /**
   * Process mouse input (fallback)
   */
  processMouseInput(
    screenPos: { x: number; y: number },
    worldPos: Vec3 | null,
    hoveredNodeId: string | null,
    isClick: boolean
  ): void {
    const inputStore = useInputStore.getState();

    inputStore.setMousePosition(screenPos);
    inputStore.setPointedPosition(worldPos);
    inputStore.setPointedNode(hoveredNodeId);

    if (isClick && hoveredNodeId) {
      // Click on a node — select it
      inputStore.addIntent({
        type: 'select',
        isFinal: true,
        targetNodeId: hoveredNodeId,
        position: worldPos || undefined,
        source: 'mouse',
        confidence: 0.9,
        resolvedReferences: {},
      });
    }
  }

  /**
   * Resolve spatial references in transcript
   */
  private resolveSpatialReferences(
    transcript: string,
    pointedNodeId: string | null,
    focusStack: string[],
    nodes: Record<string, CanvasNode>,
    currentPointerPos: Vec3 | null,
    gestureStartPos: Vec3 | null
  ): UnifiedIntent['resolvedReferences'] {
    const refs: UnifiedIntent['resolvedReferences'] = {};

    // Resolve "this"
    if (SPATIAL_PATTERNS.thisRef.test(transcript)) {
      refs.thisNode = pointedNodeId || focusStack[0] || undefined;
    }

    // Resolve "that"
    if (SPATIAL_PATTERNS.thatRef.test(transcript)) {
      // "that" = previously focused node or second in focus stack
      refs.thatNode = focusStack[1] || focusStack[0] || undefined;
    }

    // Resolve "here"
    if (SPATIAL_PATTERNS.hereRef.test(transcript)) {
      refs.herePosition = currentPointerPos || undefined;
    }

    // Resolve "there"
    if (SPATIAL_PATTERNS.thereRef.test(transcript)) {
      // "there" = where a gesture ended, or current pointer
      refs.therePosition = this.lastPointerPosition || currentPointerPos || undefined;
    }

    return refs;
  }

  /**
   * Classify intent type from transcript and gesture
   */
  private classifyIntent(transcript: string, gesture: HandGesture): IntentType {
    // Check each pattern
    for (const { type, patterns, confidence } of INTENT_PATTERNS) {
      const matches = patterns.some((p) => p.test(transcript));
      if (matches) {
        return type;
      }
    }

    // If gesture but no clear voice intent
    if (gesture === 'pinch') {
      return 'move';
    }
    if (gesture === 'point') {
      return 'select';
    }

    // Default to voice_only if we have transcript but no clear intent
    if (transcript.trim()) {
      return 'voice_only';
    }

    return 'unknown';
  }

  /**
   * Calculate confidence score for an intent
   */
  private calculateConfidence(transcript: string, intentType: IntentType): number {
    // Find matching pattern confidence
    for (const { type, patterns, confidence } of INTENT_PATTERNS) {
      if (type === intentType) {
        const matchCount = patterns.filter((p) => p.test(transcript)).length;
        return Math.min(1, confidence + matchCount * 0.05);
      }
    }

    // Default confidence for unmatched intents
    if (intentType === 'voice_only') return 0.5;
    if (intentType === 'gesture_only') return 0.6;
    return 0.3;
  }

  /**
   * Get the next pending intent for the Builder to process
   */
  getNextIntent(): UnifiedIntent | null {
    return useInputStore.getState().consumeNextIntent();
  }

  /**
   * Peek at the next intent without consuming it
   */
  peekNextIntent(): UnifiedIntent | null {
    return useInputStore.getState().peekNextIntent();
  }

  /**
   * Format an intent for the Builder agent prompt
   */
  formatIntentForBuilder(intent: UnifiedIntent): string {
    const parts: string[] = [];

    // Main transcript
    if (intent.transcript) {
      parts.push(`User said: "${intent.transcript}"`);
    }

    // Spatial context
    const contextParts: string[] = [];

    if (intent.targetNodeId) {
      const node = useCanvasStore.getState().nodes[intent.targetNodeId];
      if (node) {
        contextParts.push(`pointing at node "${node.title || node.id}" (ID: ${intent.targetNodeId})`);
      }
    }

    if (intent.secondaryNodeId) {
      const node = useCanvasStore.getState().nodes[intent.secondaryNodeId];
      if (node) {
        contextParts.push(`secondary reference: "${node.title || node.id}" (ID: ${intent.secondaryNodeId})`);
      }
    }

    if (intent.position) {
      contextParts.push(
        `target position: (${intent.position.x.toFixed(1)}, ${intent.position.y.toFixed(1)}, ${intent.position.z.toFixed(1)})`
      );
    }

    if (intent.gesture && intent.gesture !== 'none') {
      contextParts.push(`active gesture: ${intent.gesture}`);
    }

    if (contextParts.length > 0) {
      parts.push(`Context: ${contextParts.join(', ')}`);
    }

    // Resolved references
    const refParts: string[] = [];
    if (intent.resolvedReferences.thisNode) {
      refParts.push(`"this" → node ${intent.resolvedReferences.thisNode}`);
    }
    if (intent.resolvedReferences.thatNode) {
      refParts.push(`"that" → node ${intent.resolvedReferences.thatNode}`);
    }
    if (refParts.length > 0) {
      parts.push(`Resolved: ${refParts.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Get current input state summary
   */
  getStateSummary(): string {
    const input = useInputStore.getState();
    const hand = useHandStore.getState();

    const parts: string[] = [];

    if (input.pointedNodeId) {
      parts.push(`Pointing: ${input.pointedNodeId}`);
    }
    if (input.activeGesture !== 'none') {
      parts.push(`Gesture: ${input.activeGesture}`);
    }
    if (hand.isTracking) {
      parts.push('Hand tracking active');
    }
    if (input.currentTranscript) {
      parts.push(`Transcript: "${input.currentTranscript.slice(0, 30)}..."`);
    }

    return parts.join(' | ') || 'No active input';
  }
}

// Singleton instance
export const inputManager = new InputManager();

// Export convenience functions
export const processVoiceInput = (transcript: string, isFinal: boolean) =>
  inputManager.processVoiceInput(transcript, isFinal);

export const processHandInput = (
  gesture: HandGesture,
  position: Vec3 | null,
  hoveredNodeId: string | null
) => inputManager.processHandInput(gesture, position, hoveredNodeId);

export const processMouseInput = (
  screenPos: { x: number; y: number },
  worldPos: Vec3 | null,
  hoveredNodeId: string | null,
  isClick: boolean
) => inputManager.processMouseInput(screenPos, worldPos, hoveredNodeId, isClick);

export const getNextIntent = () => inputManager.getNextIntent();
export const peekNextIntent = () => inputManager.peekNextIntent();
export const formatIntentForBuilder = (intent: UnifiedIntent) =>
  inputManager.formatIntentForBuilder(intent);
export const getInputStateSummary = () => inputManager.getStateSummary();
