/**
 * Input Store — Unified Input State
 *
 * Maintains the current state of all input streams:
 * - Voice transcripts
 * - Hand gestures and positions
 * - Mouse events (fallback)
 *
 * The Input Manager reads from and writes to this store.
 */

import { create } from 'zustand';
import type { Vec3, HandGesture, InputState, UnifiedIntent } from '@/core/types';

const MAX_INTENT_HISTORY = 20;
const MAX_PENDING_INTENTS = 10;

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface InputStore extends InputState {
  // Pointing state
  setPointedNode: (nodeId: string | null) => void;
  setPointedPosition: (position: Vec3 | null) => void;

  // Gesture state
  setActiveGesture: (gesture: HandGesture) => void;

  // Voice state
  setCurrentTranscript: (transcript: string, isFinal: boolean) => void;
  clearTranscript: () => void;

  // Mouse state
  setMousePosition: (pos: { x: number; y: number } | null) => void;
  setMouseAsPrimary: (isPrimary: boolean) => void;

  // Intent management
  addIntent: (intent: Omit<UnifiedIntent, 'id' | 'timestamp'>) => UnifiedIntent;
  consumeNextIntent: () => UnifiedIntent | null;
  peekNextIntent: () => UnifiedIntent | null;
  clearPendingIntents: () => void;

  // Activity tracking
  touchActivity: () => void;

  // Reset
  reset: () => void;
}

const initialState: InputState = {
  pointedNodeId: null,
  pointedPosition: null,
  activeGesture: 'none',
  currentTranscript: '',
  isAwaitingSpeechFinal: false,
  lastFinalTranscript: '',
  lastActivityAt: 0,
  pendingIntents: [],
  intentHistory: [],
  mousePosition: null,
  mouseAsPrimary: true,
};

export const useInputStore = create<InputStore>((set, get) => ({
  ...initialState,

  setPointedNode: (nodeId) => {
    set({ pointedNodeId: nodeId, lastActivityAt: Date.now() });
  },

  setPointedPosition: (position) => {
    set({ pointedPosition: position, lastActivityAt: Date.now() });
  },

  setActiveGesture: (gesture) => {
    set({ activeGesture: gesture, lastActivityAt: Date.now() });
  },

  setCurrentTranscript: (transcript, isFinal) => {
    set((s) => ({
      currentTranscript: transcript,
      isAwaitingSpeechFinal: !isFinal,
      lastFinalTranscript: isFinal ? transcript : s.lastFinalTranscript,
      lastActivityAt: Date.now(),
    }));
  },

  clearTranscript: () => {
    set({
      currentTranscript: '',
      isAwaitingSpeechFinal: false,
    });
  },

  setMousePosition: (pos) => {
    set({ mousePosition: pos, lastActivityAt: Date.now() });
  },

  setMouseAsPrimary: (isPrimary) => {
    set({ mouseAsPrimary: isPrimary });
  },

  addIntent: (intentData) => {
    const intent: UnifiedIntent = {
      ...intentData,
      id: uid(),
      timestamp: Date.now(),
    };

    set((s) => ({
      pendingIntents: [...s.pendingIntents, intent].slice(-MAX_PENDING_INTENTS),
      intentHistory: [intent, ...s.intentHistory].slice(0, MAX_INTENT_HISTORY),
      lastActivityAt: Date.now(),
    }));

    return intent;
  },

  consumeNextIntent: () => {
    const state = get();
    if (state.pendingIntents.length === 0) return null;

    const [next, ...rest] = state.pendingIntents;
    set({ pendingIntents: rest });
    return next;
  },

  peekNextIntent: () => {
    const state = get();
    return state.pendingIntents[0] || null;
  },

  clearPendingIntents: () => {
    set({ pendingIntents: [] });
  },

  touchActivity: () => {
    set({ lastActivityAt: Date.now() });
  },

  reset: () => {
    set(initialState);
  },
}));
