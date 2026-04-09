// ============================================================
// Workshop — Gesture Detection Thresholds
// ============================================================

// MediaPipe hand landmark indices
export const LANDMARK_INDICES = {
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  WRIST: 0,
} as const;

// Gesture detection thresholds
export const PINCH_THRESHOLD = 0.07;
export const OPEN_PALM_THRESHOLD = 0.12;

// Smoothing factor for EMA (lower = smoother)
export const SMOOTHING_ALPHA = 0.25;

// MediaPipe configuration
export const MEDIAPIPE_CONFIG = {
  modelPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  numHands: 1,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
} as const;

// Video capture settings
export const VIDEO_CAPTURE_CONFIG = {
  width: 640,
  height: 480,
  facingMode: 'user',
} as const;
