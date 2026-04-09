'use client';

// =============================================================================
// HAND TRACKING - RIGHT HAND (Object Interaction)
// With calibration - adapts to YOUR hand's range of motion
// This tracker captures the user's RIGHT hand for pinch/grab and resize gestures.
//
// MIRROR NOTE: Webcam is CSS-mirrored (scaleX(-1)) for natural "mirror" display.
// MediaPipe detects handedness based on anatomical features (thumb position), NOT
// screen position. So MediaPipe labels match the user's physical hands:
//   MediaPipe "Right" = user's RIGHT hand (this tracker)
//   MediaPipe "Left"  = user's LEFT hand (LeftHandTracker)
//
// X coordinates are flipped (1.0 - x) so cursor movement matches mirrored display.
// Press 'R' to recalibrate
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

// Calibration settings
const CALIBRATION_DURATION = 18000; // 18 seconds
const MIN_CALIBRATION_SAMPLES = 200;

// Calibration target positions (normalized 0-1)
// Pattern: center → corners → edges → center
const CALIBRATION_TARGETS = [
  { x: 0.5, y: 0.5, label: 'Center' },
  { x: 0.2, y: 0.2, label: 'Top-Left' },
  { x: 0.8, y: 0.2, label: 'Top-Right' },
  { x: 0.8, y: 0.8, label: 'Bottom-Right' },
  { x: 0.2, y: 0.8, label: 'Bottom-Left' },
  { x: 0.5, y: 0.2, label: 'Top' },
  { x: 0.8, y: 0.5, label: 'Right' },
  { x: 0.5, y: 0.8, label: 'Bottom' },
  { x: 0.2, y: 0.5, label: 'Left' },
  { x: 0.5, y: 0.5, label: 'Center' },
];
const TARGET_DURATION = CALIBRATION_DURATION / CALIBRATION_TARGETS.length;

interface HandTrackerProps {
  enabled?: boolean;
}

export function HandTracker({ enabled = true }: HandTrackerProps) {
  const { videoRef, canvasRef, isReady } = useSharedWebcam();
  const calibrationCanvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  // Smoothed landmarks
  const smoothedLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);

  // Calibration state
  const calibrationRef = useRef<{
    isCalibrating: boolean;
    startTime: number;
    minX: number; maxX: number;
    minY: number; maxY: number;
    samples: number;
  } | null>(null);

  const calibratedRangeRef = useRef<{
    minX: number; maxX: number;
    minY: number; maxY: number;
    centerX: number; centerY: number;
  } | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [isNearTarget, setIsNearTarget] = useState(false);

  // Hand store actions
  const setTracking = useHandStore((s) => s.setTracking);
  const setRightHand = useHandStore((s) => s.setRightHand);
  const setRightHandDetected = useHandStore((s) => s.setRightHandDetected);
  const reset = useHandStore((s) => s.reset);

  // Reset calibration (can be triggered by pressing 'R')
  const resetCalibration = useCallback(() => {
    calibratedRangeRef.current = null;
    calibrationRef.current = null;
    setIsCalibrating(false);
    setCalibrationProgress(0);
    setCurrentTargetIndex(0);
    setIsNearTarget(false);
  }, []);

  // Keyboard listener for recalibration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        resetCalibration();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetCalibration]);

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

    // Get index finger tip for cursor position (raw coordinates, no flip)
    const indexTip = smoothed[INDEX_TIP];
    const currentX = indexTip.x;
    const currentY = indexTip.y;

    // Detect gesture
    const gesture = detectGesture(smoothed);

    // Calculate thumb-to-middle distance for resize gesture aperture
    const resizeAperture = landmarkDistance(smoothed, THUMB_TIP, MIDDLE_TIP);

    // Handle calibration
    if (!calibratedRangeRef.current) {
      const now = Date.now();

      // Start calibration if not already running
      if (!calibrationRef.current) {
        calibrationRef.current = {
          isCalibrating: true,
          startTime: now,
          minX: currentX,
          maxX: currentX,
          minY: currentY,
          maxY: currentY,
          samples: 1,
        };
        setIsCalibrating(true);
        setCurrentTargetIndex(0);

        // Update store with raw position during calibration
        setRightHand({
          isDetected: true,
          screenPosition: { x: currentX, y: currentY },
          gesture,
          pinchDistance: resizeAperture,
        });
        return;
      }

      // Update calibration bounds
      const cal = calibrationRef.current;
      cal.minX = Math.min(cal.minX, currentX);
      cal.maxX = Math.max(cal.maxX, currentX);
      cal.minY = Math.min(cal.minY, currentY);
      cal.maxY = Math.max(cal.maxY, currentY);
      cal.samples++;

      // Update progress and current target
      const elapsed = now - cal.startTime;
      const progress = Math.min(100, (elapsed / CALIBRATION_DURATION) * 100);
      setCalibrationProgress(progress);

      // Calculate which target we're on
      const targetIndex = Math.min(
        Math.floor(elapsed / TARGET_DURATION),
        CALIBRATION_TARGETS.length - 1
      );
      setCurrentTargetIndex(targetIndex);

      // Check if user's hand is near the current target (use mirrored X for display alignment)
      const target = CALIBRATION_TARGETS[targetIndex];
      const mirroredX = 1.0 - currentX;
      const distToTarget = Math.sqrt(
        Math.pow(mirroredX - target.x, 2) + Math.pow(currentY - target.y, 2)
      );
      setIsNearTarget(distToTarget < 0.15);

      // Check if calibration is complete
      if (elapsed >= CALIBRATION_DURATION && cal.samples >= MIN_CALIBRATION_SAMPLES) {
        const rangeX = cal.maxX - cal.minX;
        const rangeY = cal.maxY - cal.minY;

        if (rangeX > 0.1 && rangeY > 0.1) {
          calibratedRangeRef.current = {
            minX: cal.minX,
            maxX: cal.maxX,
            minY: cal.minY,
            maxY: cal.maxY,
            centerX: (cal.minX + cal.maxX) / 2,
            centerY: (cal.minY + cal.maxY) / 2,
          };
        } else {
          // Fallback to default range if calibration was too small
          calibratedRangeRef.current = {
            minX: 0.2, maxX: 0.8,
            minY: 0.2, maxY: 0.8,
            centerX: 0.5, centerY: 0.5,
          };
        }

        calibrationRef.current = null;
        setIsCalibrating(false);
        setCalibrationProgress(100);
        setCurrentTargetIndex(0);
        setIsNearTarget(false);
      }

      // Update store with raw position during calibration
      setRightHand({
        isDetected: true,
        screenPosition: { x: currentX, y: currentY },
        gesture,
        pinchDistance: resizeAperture,
      });
      return;
    }

    // Normal operation with calibrated range - normalize position
    const range = calibratedRangeRef.current;
    const rangeX = range.maxX - range.minX;
    const rangeY = range.maxY - range.minY;

    // Normalize to 0-1 based on calibrated range
    const normalizedX = Math.max(0, Math.min(1, (currentX - range.minX) / rangeX));
    const normalizedY = Math.max(0, Math.min(1, (currentY - range.minY) / rangeY));

    // Update hand store with normalized position
    setRightHand({
      isDetected: true,
      screenPosition: { x: normalizedX, y: normalizedY },
      gesture,
      pinchDistance: resizeAperture,
    });
  }, [smoothLandmarks, detectGesture, setRightHand, landmarkDistance]);

  // Draw hand landmarks (pink for right hand)
  const drawHand = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: { x: number; y: number; z: number }[],
    width: number,
    height: number,
    options?: { lineWidth?: number; pointSize?: number; mirror?: boolean }
  ) => {
    const { lineWidth = 2, pointSize = 3, mirror = true } = options || {};

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];

    // Helper to flip X for mirror display
    const getX = (x: number) => mirror ? (1 - x) * width : x * width;

    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 0.9;

    for (const [i, j] of connections) {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(getX(p1.x), p1.y * height);
      ctx.lineTo(getX(p2.x), p2.y * height);
      ctx.stroke();
    }

    // Draw points
    ctx.fillStyle = '#ec4899';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(getX(lm.x), lm.y * height, pointSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight index finger tip
    const indexTip = landmarks[INDEX_TIP];
    ctx.beginPath();
    ctx.arc(getX(indexTip.x), indexTip.y * height, pointSize * 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    ctx.globalAlpha = 1;
  }, []);

  // Process results from MediaPipe - filter for right hand only
  const processResults = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const calibrationCanvas = calibrationCanvasRef.current;
    const calibrationCtx = calibrationCanvas?.getContext('2d');

    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Clear calibration canvas if it exists
    if (calibrationCanvas && calibrationCtx) {
      calibrationCtx.clearRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);
    }

    // Find right hand in results
    if (results.landmarks && results.handedness) {
      for (let i = 0; i < results.landmarks.length; i++) {
        const handedness = results.handedness[i];
        // MediaPipe "Right" = user's physical right hand (based on anatomy, not screen position)
        const isRightHand = handedness?.[0]?.categoryName === 'Right';

        if (isRightHand) {
          const landmarks = results.landmarks[i];
          processHand(landmarks);

          // Draw hand visualization on preview canvas
          drawHand(ctx, landmarks, canvas.width, canvas.height, { mirror: true });

          // Also draw on calibration canvas if calibrating
          if (calibrationCanvas && calibrationCtx && isCalibrating) {
            drawHand(
              calibrationCtx,
              landmarks,
              calibrationCanvas.width,
              calibrationCanvas.height,
              { lineWidth: 4, pointSize: 8, mirror: true }
            );
          }
          return; // Found right hand, stop searching
        }
      }
    }

    // No right hand detected
    setRightHandDetected(false);
    smoothedLandmarksRef.current = null;
  }, [canvasRef, processHand, drawHand, setRightHandDetected, isCalibrating]);

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

  // Render recalibration hint when calibrated but not calibrating
  if (!isCalibrating && calibratedRangeRef.current) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '102px',
          right: '24px',
          fontSize: '6px',
          color: 'rgba(255,255,255,0.4)',
          zIndex: 21,
        }}
      >
        R to recal
      </div>
    );
  }

  // Render calibration overlay when calibrating
  if (!isCalibrating) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 10, 26, 0.95)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Large calibration area */}
      <div
        style={{
          position: 'relative',
          width: '80vw',
          height: '70vh',
          maxWidth: '1200px',
          maxHeight: '800px',
          border: '2px solid rgba(236, 72, 153, 0.3)',
          borderRadius: '24px',
          background: 'rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Hand skeleton canvas */}
        <canvas
          ref={calibrationCanvasRef}
          width={1200}
          height={800}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        />
        {/* Target indicator */}
        {CALIBRATION_TARGETS[currentTargetIndex] && (
          <div
            style={{
              position: 'absolute',
              left: `${CALIBRATION_TARGETS[currentTargetIndex].x * 100}%`,
              top: `${CALIBRATION_TARGETS[currentTargetIndex].y * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: isNearTarget ? '80px' : '60px',
              height: isNearTarget ? '80px' : '60px',
              borderRadius: '50%',
              border: `4px solid ${isNearTarget ? '#22c55e' : '#ec4899'}`,
              background: isNearTarget ? 'rgba(34, 197, 94, 0.2)' : 'rgba(236, 72, 153, 0.1)',
              transition: 'all 0.3s ease',
              boxShadow: isNearTarget
                ? '0 0 60px rgba(34, 197, 94, 0.6), 0 0 120px rgba(34, 197, 94, 0.3)'
                : '0 0 40px rgba(236, 72, 153, 0.4), 0 0 80px rgba(236, 72, 153, 0.2)',
            }}
          >
            {/* Pulsing inner dot */}
            <div
              style={{
                position: 'absolute',
                inset: '20px',
                borderRadius: '50%',
                background: isNearTarget ? '#22c55e' : '#ec4899',
              }}
            />
          </div>
        )}

        {/* Position label near target */}
        {CALIBRATION_TARGETS[currentTargetIndex] && (
          <div
            style={{
              position: 'absolute',
              left: `${CALIBRATION_TARGETS[currentTargetIndex].x * 100}%`,
              top: `${CALIBRATION_TARGETS[currentTargetIndex].y * 100}%`,
              transform: 'translate(-50%, 60px)',
              color: isNearTarget ? '#22c55e' : '#ec4899',
              fontSize: '18px',
              fontWeight: 600,
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            {CALIBRATION_TARGETS[currentTargetIndex].label}
          </div>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          color: '#fff',
          fontSize: '28px',
          fontWeight: 700,
          letterSpacing: '2px',
        }}
      >
        CALIBRATING RIGHT HAND
      </div>

      {/* Instructions */}
      <div
        style={{
          position: 'absolute',
          top: '90px',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '16px',
        }}
      >
        Move your right hand to follow the target
      </div>

      {/* Feedback */}
      <div
        style={{
          marginTop: '30px',
          color: isNearTarget ? '#22c55e' : '#ec4899',
          fontSize: '24px',
          fontWeight: 600,
          height: '36px',
        }}
      >
        {isNearTarget ? '✓ Good! Hold it...' : 'Move to the target'}
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: '400px',
          maxWidth: '80vw',
          marginTop: '20px',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '8px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${calibrationProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #ec4899, #22c55e)',
              transition: 'width 0.1s',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '8px',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '14px',
          }}
        >
          <span>Target {currentTargetIndex + 1} of {CALIBRATION_TARGETS.length}</span>
          <span>{Math.round(calibrationProgress)}%</span>
        </div>
      </div>

      {/* Skip hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '30px',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '12px',
        }}
      >
        Press R to restart calibration
      </div>
    </div>
  );
}
