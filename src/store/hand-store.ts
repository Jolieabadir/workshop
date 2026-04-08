import { create } from 'zustand';
import type { Vec3, HandGesture, HandState } from '@/types/canvas';

interface HandStore extends HandState {
  setTracking: (isTracking: boolean) => void;
  setPosition: (position: Vec3 | null) => void;
  setScreenPosition: (pos: { x: number; y: number } | null) => void;
  setGesture: (gesture: HandGesture) => void;
  setGrabbedNode: (nodeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  setPinchDistance: (distance: number) => void;
  reset: () => void;
}

const initialState: HandState = {
  isTracking: false,
  position: null,
  screenPosition: null,
  gesture: 'none',
  grabbedNodeId: null,
  hoveredNodeId: null,
  pinchDistance: 1,
};

export const useHandStore = create<HandStore>((set) => ({
  ...initialState,

  setTracking: (isTracking) => set({ isTracking }),

  setPosition: (position) => set({ position }),

  setScreenPosition: (screenPosition) => set({ screenPosition }),

  setGesture: (gesture) => set({ gesture }),

  setGrabbedNode: (grabbedNodeId) => set({ grabbedNodeId }),

  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),

  setPinchDistance: (pinchDistance) => set({ pinchDistance }),

  reset: () => set(initialState),
}));
