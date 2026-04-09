// ============================================================
// Workshop — Gesture Detection
// Extracts gesture classification logic for reuse
// ============================================================

import type { HandGesture } from '@/core/types';
import {
  LANDMARK_INDICES,
  PINCH_THRESHOLD,
  OPEN_PALM_THRESHOLD,
} from '@/core/config/gesture-thresholds';

const { THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP, WRIST } = LANDMARK_INDICES;

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Calculate distance between two landmarks */
export function landmarkDistance(
  landmarks: Landmark[],
  idx1: number,
  idx2: number
): number {
  const l1 = landmarks[idx1];
  const l2 = landmarks[idx2];
  return Math.sqrt(
    Math.pow(l1.x - l2.x, 2) +
    Math.pow(l1.y - l2.y, 2) +
    Math.pow(l1.z - l2.z, 2)
  );
}

/** Detect gesture from hand landmarks */
export function detectGesture(landmarks: Landmark[]): HandGesture {
  const pinchDist = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);

  if (pinchDist < PINCH_THRESHOLD) {
    return 'pinch';
  }

  // Check for open palm (fingers spread)
  const thumbIndex = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);
  const indexMiddle = landmarkDistance(landmarks, INDEX_TIP, MIDDLE_TIP);
  const middleRing = landmarkDistance(landmarks, MIDDLE_TIP, RING_TIP);
  const ringPinky = landmarkDistance(landmarks, RING_TIP, PINKY_TIP);

  const avgFingerSpread = (thumbIndex + indexMiddle + middleRing + ringPinky) / 4;
  if (avgFingerSpread > OPEN_PALM_THRESHOLD) {
    return 'open_palm';
  }

  // Check for pointing (index extended, others curled)
  const indexExtended = landmarks[INDEX_TIP].y < landmarks[WRIST].y;
  const middleCurled = landmarks[MIDDLE_TIP].y > landmarks[INDEX_TIP].y + 0.05;
  const ringCurled = landmarks[RING_TIP].y > landmarks[INDEX_TIP].y + 0.05;

  if (indexExtended && middleCurled && ringCurled) {
    return 'point';
  }

  return 'none';
}

/** Apply EMA smoothing to landmarks */
export function smoothLandmarks(
  newLandmarks: Landmark[],
  prevSmoothed: Landmark[] | null,
  alpha: number = 0.25
): Landmark[] {
  if (!prevSmoothed) {
    return newLandmarks.map(lm => ({ ...lm }));
  }

  return newLandmarks.map((lm, i) => {
    const prev = prevSmoothed[i];
    return {
      x: alpha * lm.x + (1 - alpha) * prev.x,
      y: alpha * lm.y + (1 - alpha) * prev.y,
      z: alpha * lm.z + (1 - alpha) * prev.z,
    };
  });
}

/** Get pinch distance between thumb and index */
export function getPinchDistance(landmarks: Landmark[]): number {
  return landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);
}

/** Get screen position from index finger tip */
export function getScreenPosition(landmarks: Landmark[]): { x: number; y: number } {
  const indexTip = landmarks[INDEX_TIP];
  return { x: indexTip.x, y: indexTip.y };
}
