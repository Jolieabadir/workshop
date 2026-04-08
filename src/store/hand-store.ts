import { create } from 'zustand';
import type { Vec3, HandGesture, TwoHandState, SingleHandState } from '@/types/canvas';

const initialSingleHand: SingleHandState = {
  isDetected: false,
  position: null,
  screenPosition: null,
  gesture: 'none',
  pinchDistance: 1,
  palmCenter: null,
};

interface HandStore extends TwoHandState {
  // Left hand actions (navigation)
  setLeftHand: (state: Partial<SingleHandState>) => void;
  setLeftHandDetected: (detected: boolean) => void;

  // Right hand actions (interaction)
  setRightHand: (state: Partial<SingleHandState>) => void;
  setRightHandDetected: (detected: boolean) => void;

  // Interaction state
  setGrabbedNode: (nodeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;

  // Camera control from left hand
  setCameraControl: (control: Partial<TwoHandState['cameraControl']>) => void;

  // Global tracking state
  setTracking: (isTracking: boolean) => void;

  // Reset all state
  reset: () => void;

  // Legacy compatibility getters
  readonly gesture: HandGesture;
  readonly position: Vec3 | null;
  readonly screenPosition: { x: number; y: number } | null;
  readonly pinchDistance: number;
}

const initialState: TwoHandState = {
  isTracking: false,
  leftHand: { ...initialSingleHand },
  rightHand: { ...initialSingleHand },
  grabbedNodeId: null,
  hoveredNodeId: null,
  cameraControl: {
    azimuthDelta: 0,
    polarDelta: 0,
    zoomDelta: 0,
    isActive: false,
  },
};

export const useHandStore = create<HandStore>((set, get) => ({
  ...initialState,

  // Left hand actions
  setLeftHand: (state) =>
    set((s) => ({
      leftHand: { ...s.leftHand, ...state },
    })),

  setLeftHandDetected: (detected) =>
    set((s) => ({
      leftHand: detected ? { ...s.leftHand, isDetected: true } : { ...initialSingleHand },
    })),

  // Right hand actions
  setRightHand: (state) =>
    set((s) => ({
      rightHand: { ...s.rightHand, ...state },
    })),

  setRightHandDetected: (detected) =>
    set((s) => ({
      rightHand: detected ? { ...s.rightHand, isDetected: true } : { ...initialSingleHand },
    })),

  // Interaction state
  setGrabbedNode: (grabbedNodeId) => set({ grabbedNodeId }),
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),

  // Camera control
  setCameraControl: (control) =>
    set((s) => ({
      cameraControl: { ...s.cameraControl, ...control },
    })),

  // Global tracking
  setTracking: (isTracking) => set({ isTracking }),

  // Reset
  reset: () => set(initialState),

  // Legacy compatibility - return right hand state for single-hand code
  get gesture() {
    return get().rightHand.gesture;
  },
  get position() {
    return get().rightHand.position;
  },
  get screenPosition() {
    return get().rightHand.screenPosition;
  },
  get pinchDistance() {
    return get().rightHand.pinchDistance;
  },
}));
