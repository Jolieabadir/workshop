// ============================================================
// Workshop — Scene & Canvas Defaults
// ============================================================

import type { Vec3 } from '../types/canvas';

// Node spacing
export const MIN_NODE_SPACING = 2.5;

// Position generation
export const POSITION_SPREAD_INITIAL = 6;
export const POSITION_SPREAD_INCREMENT = 2;
export const POSITION_Y_OFFSET = 1.5;
export const MAX_PLACEMENT_ATTEMPTS = 50;

// Builder avatar defaults
export const BUILDER_INITIAL_POSITION: Vec3 = { x: 0, y: 2, z: 2 };

// Focus stack
export const MAX_FOCUS_STACK_SIZE = 20;

// Camera defaults (for OrbitControls)
export const CAMERA_DEFAULTS = {
  position: { x: 0, y: 3, z: 8 } as Vec3,
  target: { x: 0, y: 1, z: 0 } as Vec3,
  fov: 60,
  near: 0.1,
  far: 1000,
} as const;

// Node position ranges (for Builder prompt reference)
export const POSITION_RANGES = {
  x: { min: -5, max: 5 },
  y: { min: 0, max: 4 },
  z: { min: -5, max: 5 },
} as const;
