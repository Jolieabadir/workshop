'use client';

// =============================================================================
// HAND TRACKING - RIGHT HAND (Object Interaction)
// This tracker captures the user's RIGHT hand for pinch/grab and resize gestures.
//
// MIRROR NOTE: Webcam is CSS-mirrored (scaleX(-1)) for natural "mirror" display.
// MediaPipe detects handedness based on anatomical features (thumb position), NOT
// screen position. So MediaPipe labels match the user's physical hands:
//   MediaPipe "Right" = user's RIGHT hand (this tracker)
//   MediaPipe "Left"  = user's LEFT hand (LeftHandTracker)
//
// X coordinates are flipped (1.0 - x) so cursor movement matches mirrored display.
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { useHandStore } from '@/store/hand-store';
import { useSharedWebcam } from './SharedWebcam';
import type { HandGesture } from '@/core/types';

// MediaPipe hand landmark indices
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const RING_MCP = 13;
const PINKY_MCP = 17;

// Gesture thresholds
const PINCH_THRESHOLD = 0.07;
const FINGER_EXTENDED_THRESHOLD = 0.15; // Distance from tip to MCP for extended finger
const FINGER_CURLED_THRESHOLD = 0.08;   // Distance from tip to palm for curled finger

// Smoothing factor for EMA (lower = smoother)
const SMOOTHING_ALPHA = 0.25;

interface HandTrackerProps {
  enabled?: boolean;
}

export function HandTracker({ enabled = true }: HandTrackerProps) {
  const { videoRef, canvasRef, isReady } = useSharedWebcam();
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  // Smoothed landmarks
  const smoothedLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);

  // Hand store actions
  const setTracking = useHandStore((s) => s.setTracking);
  const setRightHand = useHandStore((s) => s.setRightHand);
  const setRightHandDetected = useHandStore((s) => s.setRightHandDetected);
  const reset = useHandStore((s) => s.reset);

  // Calculate distance between two landmarks
  const landmarkDistance = useCallback((
    landmarks: { x: number; y: number; z: number }[],
    idx1: number,
    idx2: number
  ): number => {
    const l1 = landmarks[idx1];
    const l2 = landmarks[idx2];
    return Math.sqrt(
      Math.pow(l1.x - l2.x, 2) +
      Math.pow(l1.y - l2.y, 2) +
      Math.pow(l1.z - l2.z, 2)
    );
  }, []);

  // Detect gesture from hand landmarks
  // Only three gestures: pinch (grab), resize (scale), none (passive hover)
  const detectGesture = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): HandGesture => {
    const pinchDist = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);

    // Pinch: thumb and index finger touching
    if (pinchDist < PINCH_THRESHOLD) {
      return 'pinch';
    }

    // Resize: thumb, index, and middle extended; ring and pinky curled
    // Check if thumb, index, middle are extended (tips far from wrist)
    const thumbExtended = landmarkDistance(landmarks, THUMB_TIP, WRIST) > FINGER_EXTENDED_THRESHOLD;
    const indexExtended = landmarkDistance(landmarks, INDEX_TIP, INDEX_MCP) > FINGER_EXTENDED_THRESHOLD * 0.6;
    const middleExtended = landmarkDistance(landmarks, MIDDLE_TIP, MIDDLE_MCP) > FINGER_EXTENDED_THRESHOLD * 0.6;

    // Check if ring and pinky are curled (tips close to palm center / MCP joints)
    const ringCurled = landmarkDistance(landmarks, RING_TIP, RING_MCP) < FINGER_CURLED_THRESHOLD;
    const pinkyCurled = landmarkDistance(landmarks, PINKY_TIP, PINKY_MCP) < FINGER_CURLED_THRESHOLD;

    if (thumbExtended && indexExtended && middleExtended && ringCurled && pinkyCurled) {
      return 'resize';
    }

    // Everything else is 'none' — hand is present but not doing a specific gesture
    return 'none';
  }, [landmarkDistance]);

  // Apply EMA smoothing
  const smoothLandmarks = useCallback((
    newLandmarks: { x: number; y: number; z: number }[],
    prevSmoothed: { x: number; y: number; z: number }[] | null
  ): { x: number; y: number; z: number }[] => {
    if (!prevSmoothed) {
      return newLandmarks.map(lm => ({ ...lm }));
    }

    return newLandmarks.map((lm, i) => {
      const prev = prevSmoothed[i];
      return {
        x: SMOOTHING_ALPHA * lm.x + (1 - SMOOTHING_ALPHA) * prev.x,
        y: SMOOTHING_ALPHA * lm.y + (1 - SMOOTHING_ALPHA) * prev.y,
        z: SMOOTHING_ALPHA * lm.z + (1 - SMOOTHING_ALPHA) * prev.z,
      };
    });
  }, []);

  // Process detected hand
  const processHand = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ) => {
    // Smooth the landmarks
    const smoothed = smoothLandmarks(landmarks, smoothedLandmarksRef.current);
    smoothedLandmarksRef.current = smoothed;

    // Get index finger tip for cursor position (raw MediaPipe coordinates)
    const indexTip = smoothed[INDEX_TIP];
    const screenPos = { x: indexTip.x, y: indexTip.y };

    // Detect gesture
    const gesture = detectGesture(smoothed);

    // Calculate thumb-to-middle distance for resize gesture aperture
    // This is used by HandRaycaster to determine scale factor
    const resizeAperture = landmarkDistance(smoothed, THUMB_TIP, MIDDLE_TIP);

    // Update hand store
    setRightHand({
      isDetected: true,
      screenPosition: screenPos,
      gesture,
      pinchDistance: resizeAperture, // Reusing pinchDistance field for resize aperture
    });
  }, [smoothLandmarks, detectGesture, setRightHand, landmarkDistance]);

  // Draw hand landmarks (green for right hand)
  const drawHand = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: { x: number; y: number; z: number }[],
    width: number,
    height: number
  ) => {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;

    for (const [i, j] of connections) {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }

    // Draw points
    ctx.fillStyle = '#00ff88';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight index finger tip
    const indexTip = landmarks[INDEX_TIP];
    ctx.beginPath();
    ctx.arc(indexTip.x * width, indexTip.y * height, 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff6b9d';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 1;
  }, []);

  // Process results from MediaPipe - filter for right hand only
  const processResults = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Find right hand in results
    if (results.landmarks && results.handedness) {
      for (let i = 0; i < results.landmarks.length; i++) {
        const handedness = results.handedness[i];
        // MediaPipe "Right" = user's physical right hand (based on anatomy, not screen position)
        const isRightHand = handedness?.[0]?.categoryName === 'Right';

        if (isRightHand) {
          const landmarks = results.landmarks[i];
          processHand(landmarks);

          // Draw hand visualization
          drawHand(ctx, landmarks, canvas.width, canvas.height);
          return; // Found right hand, stop searching
        }
      }
    }

    // No right hand detected
    setRightHandDetected(false);
    smoothedLandmarksRef.current = null;
  }, [canvasRef, processHand, drawHand, setRightHandDetected]);

  // Initialize MediaPipe
  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2, // Track both hands so we can filter for right
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (mounted) {
          handLandmarkerRef.current = handLandmarker;
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize HandLandmarker:', err);
      }
    };

    init();

    return () => {
      mounted = false;
      handLandmarkerRef.current?.close();
    };
  }, [enabled]);

  // Detection loop - uses shared video element from context
  useEffect(() => {
    if (!enabled || !isInitialized || !isReady) return;

    let mounted = true;
    setTracking(true);

    const detectLoop = () => {
      if (!mounted || !videoRef.current || !handLandmarkerRef.current) return;

      const video = videoRef.current;
      if (video.currentTime !== lastVideoTimeRef.current && video.readyState >= 2) {
        lastVideoTimeRef.current = video.currentTime;
        const results = handLandmarkerRef.current.detectForVideo(video, performance.now());
        processResults(results);
      }

      animationFrameRef.current = requestAnimationFrame(detectLoop);
    };

    detectLoop();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationFrameRef.current);
      reset();
    };
  }, [enabled, isInitialized, isReady, videoRef, setTracking, processResults, reset]);

  // HandTracker no longer renders UI - SharedWebcam handles the video/canvas display
  // This component just handles the MediaPipe detection logic for the right hand
  return null;
}
