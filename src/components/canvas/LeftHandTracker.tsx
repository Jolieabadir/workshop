'use client';

// =============================================================================
// HAND TRACKING - LEFT HAND (Camera Navigation)
// This tracker captures the user's LEFT hand for camera orbit/zoom/reset.
//
// MIRROR NOTE: Webcam is CSS-mirrored (scaleX(-1)) for natural "mirror" display.
// MediaPipe detects handedness based on anatomical features (thumb position), NOT
// screen position. So MediaPipe labels match the user's physical hands:
//   MediaPipe "Left"  = user's LEFT hand (this tracker)
//   MediaPipe "Right" = user's RIGHT hand (HandTracker)
//
// Camera orbit X-delta is negated to match the mirrored display direction.
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
const OPEN_PALM_THRESHOLD = 0.12;
const FIST_THRESHOLD = 0.08; // Fingers curled close to palm

// Smoothing factor for EMA (lower = smoother)
const SMOOTHING_ALPHA = 0.25;

// Camera control sensitivity
const ORBIT_SENSITIVITY = 3.0;
const ZOOM_SENSITIVITY = 15.0;

interface LeftHandTrackerProps {
  enabled?: boolean;
}

export function LeftHandTracker({ enabled = true }: LeftHandTrackerProps) {
  const { videoRef, isReady } = useSharedWebcam();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  // Smoothed landmarks
  const smoothedLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);

  // For fist → reset camera, track previous gesture
  const prevGestureRef = useRef<HandGesture>('none');

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hand store actions
  const setLeftHand = useHandStore((s) => s.setLeftHand);
  const setLeftHandDetected = useHandStore((s) => s.setLeftHandDetected);
  const setCameraControl = useHandStore((s) => s.setCameraControl);

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

  // Detect gesture from hand landmarks (includes fist detection for left hand)
  const detectGesture = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): HandGesture => {
    const pinchDist = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);

    if (pinchDist < PINCH_THRESHOLD) {
      return 'pinch';
    }

    // Check for fist (all fingertips close to MCP joints / palm)
    const indexCurled = landmarkDistance(landmarks, INDEX_TIP, INDEX_MCP) < FIST_THRESHOLD;
    const middleCurled = landmarkDistance(landmarks, MIDDLE_TIP, MIDDLE_MCP) < FIST_THRESHOLD;
    const ringCurled = landmarkDistance(landmarks, RING_TIP, RING_MCP) < FIST_THRESHOLD;
    const pinkyCurled = landmarkDistance(landmarks, PINKY_TIP, PINKY_MCP) < FIST_THRESHOLD;

    // Fist requires all fingers curled
    if (indexCurled && middleCurled && ringCurled && pinkyCurled) {
      return 'fist';
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
    const middleCurledY = landmarks[MIDDLE_TIP].y > landmarks[INDEX_TIP].y + 0.05;
    const ringCurledY = landmarks[RING_TIP].y > landmarks[INDEX_TIP].y + 0.05;

    if (indexExtended && middleCurledY && ringCurledY) {
      return 'point';
    }

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

  // Calculate palm center from landmarks
  const getPalmCenter = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): { x: number; y: number } => {
    // Use wrist and MCP joints to estimate palm center
    const palmLandmarks = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
    let sumX = 0, sumY = 0;
    for (const idx of palmLandmarks) {
      sumX += landmarks[idx].x;
      sumY += landmarks[idx].y;
    }
    return {
      x: sumX / palmLandmarks.length,
      y: sumY / palmLandmarks.length,
    };
  }, []);

  // Process detected left hand and map to camera controls
  const processLeftHand = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ) => {
    // Smooth the landmarks
    const smoothed = smoothLandmarks(landmarks, smoothedLandmarksRef.current);
    smoothedLandmarksRef.current = smoothed;

    // Detect gesture
    const gesture = detectGesture(smoothed);

    // Get palm center for position tracking
    const palmCenter = getPalmCenter(smoothed);

    // Update hand store
    setLeftHand({
      isDetected: true,
      screenPosition: palmCenter,
      gesture,
      palmCenter,
    });

    // Map gestures to camera controls
    if (gesture === 'open_palm') {
      // Open palm → camera orbit
      // Map palm position relative to center of frame (0.5, 0.5)
      // Palm left of center (x < 0.5) = rotate camera left (negative azimuth)
      // Palm above center (y < 0.5) = rotate camera up (negative polar)
      const centerX = 0.5;
      const centerY = 0.5;

      // Calculate delta from center, invert X because video is mirrored
      const deltaX = -(palmCenter.x - centerX) * ORBIT_SENSITIVITY;
      const deltaY = (palmCenter.y - centerY) * ORBIT_SENSITIVITY;

      setCameraControl({
        azimuthDelta: deltaX,
        polarDelta: deltaY,
        zoomDelta: 0,
        isActive: true,
      });
    } else if (gesture === 'pinch') {
      // Pinch → zoom
      // Map pinch distance to zoom delta
      // We use the distance between thumb and index
      const pinchDist = landmarkDistance(smoothed, THUMB_TIP, INDEX_TIP);
      // Normalize: closer pinch = zoom in (positive), spread = zoom out (negative)
      // At threshold (0.07) = fully pinched = max zoom in
      // At spread (0.2+) = max zoom out
      const normalizedPinch = Math.max(0, Math.min(1, (0.15 - pinchDist) / 0.15));
      const zoomDelta = (normalizedPinch - 0.5) * ZOOM_SENSITIVITY;

      setCameraControl({
        azimuthDelta: 0,
        polarDelta: 0,
        zoomDelta,
        isActive: true,
      });
    } else if (gesture === 'fist' && prevGestureRef.current !== 'fist') {
      // Fist → reset camera (only trigger once on transition to fist)
      // We'll set a special reset flag by using extreme values that the
      // HandControlledOrbitControls can detect and handle
      // Actually, for simplicity, we just deactivate and let user manually reset
      // Or we could emit a custom event. For now, just deactivate.
      setCameraControl({
        azimuthDelta: 0,
        polarDelta: 0,
        zoomDelta: 0,
        isActive: false,
      });
    } else {
      // No camera control gesture
      setCameraControl({
        azimuthDelta: 0,
        polarDelta: 0,
        zoomDelta: 0,
        isActive: false,
      });
    }

    prevGestureRef.current = gesture;
  }, [smoothLandmarks, detectGesture, getPalmCenter, setLeftHand, setCameraControl, landmarkDistance]);

  // Draw hand landmarks (blue tint for left hand)
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

    // Blue color for left hand (navigation)
    ctx.strokeStyle = '#4a9eff';
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
    ctx.fillStyle = '#4a9eff';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight palm center
    const palmCenter = getPalmCenter(landmarks);
    ctx.beginPath();
    ctx.arc(palmCenter.x * width, palmCenter.y * height, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 1;
  }, [getPalmCenter]);

  // Process results from MediaPipe - filter for left hand only
  const processResults = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Find left hand in results
    if (results.landmarks && results.handedness) {
      for (let i = 0; i < results.landmarks.length; i++) {
        const handedness = results.handedness[i];
        // MediaPipe "Left" = user's physical left hand (based on anatomy, not screen position)
        const isLeftHand = handedness?.[0]?.categoryName === 'Left';

        if (isLeftHand) {
          const landmarks = results.landmarks[i];
          processLeftHand(landmarks);

          // Draw hand visualization
          drawHand(ctx, landmarks, canvas.width, canvas.height);
          return; // Found left hand, stop searching
        }
      }
    }

    // No left hand detected
    setLeftHandDetected(false);
    setCameraControl({ isActive: false });
    smoothedLandmarksRef.current = null;
  }, [processLeftHand, drawHand, setLeftHandDetected, setCameraControl]);

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
          numHands: 2, // Track both hands so we can filter for left
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (mounted) {
          handLandmarkerRef.current = handLandmarker;
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize LeftHandTracker:', err);
        if (mounted) setError('Failed to load left hand tracking');
      }
    };

    init();

    return () => {
      mounted = false;
      handLandmarkerRef.current?.close();
    };
  }, [enabled]);

  // Detection loop - uses shared video element
  useEffect(() => {
    if (!enabled || !isInitialized || !isReady) return;

    let mounted = true;

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
      setLeftHandDetected(false);
      setCameraControl({ isActive: false });
    };
  }, [enabled, isInitialized, isReady, videoRef, processResults, setLeftHandDetected, setCameraControl]);

  // Sync canvas size with video
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const updateSize = () => {
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
      };
      video.addEventListener('loadedmetadata', updateSize);
      updateSize();
      return () => video.removeEventListener('loadedmetadata', updateSize);
    }
  }, [videoRef]);

  if (!enabled) return null;

  // Render visualization overlay (positioned next to right hand tracker)
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '100px',
        left: '200px', // Offset from right hand tracker
        zIndex: 20,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '2px solid rgba(74, 158, 255, 0.4)',
        boxShadow: '0 4px 20px rgba(74, 158, 255, 0.2)',
        background: '#0a0a1a',
      }}
    >
      {/* Label */}
      <div
        style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          fontSize: '8px',
          color: '#4a9eff',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          zIndex: 1,
        }}
      >
        Left (Nav)
      </div>

      {/* Canvas overlay for hand visualization */}
      <canvas
        ref={canvasRef}
        style={{
          width: '160px',
          height: '120px',
          transform: 'scaleX(-1)',
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Status indicator */}
      <div
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: error ? '#ef4444' : isInitialized && isReady ? '#4a9eff' : '#f59e0b',
        }}
      />

      {error && (
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            right: '4px',
            padding: '4px',
            background: 'rgba(239, 68, 68, 0.9)',
            color: '#fff',
            fontSize: '8px',
            textAlign: 'center',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
