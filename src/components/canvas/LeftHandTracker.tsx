'use client';

// =============================================================================
// HAND TRACKING - LEFT HAND (Camera Navigation)
// With calibration - adapts to YOUR hand's range of motion
//   - Open hand: orbit camera (joystick style, calibrated to your range)
//   - Pinch: zoom out
//   - L-shape: zoom in
// Press 'C' to recalibrate
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
const PINCH_THRESHOLD = 0.08;
const L_SHAPE_THUMB_SPREAD = 0.04;
const L_SHAPE_CURL_RATIO = 0.85;

// Smoothing factor for EMA
const SMOOTHING_ALPHA = 0.25;

// Camera control sensitivity
const ZOOM_SENSITIVITY = 6.0;

// Calibration settings
const CALIBRATION_DURATION = 18000; // 18 seconds
const MIN_CALIBRATION_SAMPLES = 200;

// Calibration target positions (normalized 0-1, will be shown on canvas)
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

interface LeftHandTrackerProps {
  enabled?: boolean;
}

export function LeftHandTracker({ enabled = true }: LeftHandTrackerProps) {
  const { videoRef, isReady } = useSharedWebcam();
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const [error, setError] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [isNearTarget, setIsNearTarget] = useState(false);

  // Hand store actions
  const setLeftHand = useHandStore((s) => s.setLeftHand);
  const setLeftHandDetected = useHandStore((s) => s.setLeftHandDetected);
  const setCameraControl = useHandStore((s) => s.setCameraControl);

  // Reset calibration (can be triggered by pressing 'C')
  const resetCalibration = useCallback(() => {
    calibratedRangeRef.current = null;
    calibrationRef.current = null;
    setIsCalibrating(false);
    setIsCalibrated(false);
    setCalibrationProgress(0);
    setCurrentTargetIndex(0);
    setIsNearTarget(false);
  }, []);

  // Keyboard listener for recalibration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
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

  // Gesture detection
  const detectGesture = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): HandGesture => {
    const pinchDist = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);
    if (pinchDist < PINCH_THRESHOLD) {
      return 'pinch';
    }

    const thumbTip = landmarks[THUMB_TIP];
    const indexMcp = landmarks[INDEX_MCP];
    const thumbSpread = Math.abs(thumbTip.x - indexMcp.x);
    const thumbOut = thumbSpread > L_SHAPE_THUMB_SPREAD;

    const indexDist = landmarkDistance(landmarks, INDEX_TIP, INDEX_MCP);
    const middleDist = landmarkDistance(landmarks, MIDDLE_TIP, MIDDLE_MCP);
    const ringDist = landmarkDistance(landmarks, RING_TIP, RING_MCP);
    const pinkyDist = landmarkDistance(landmarks, PINKY_TIP, PINKY_MCP);

    const indexExtended = indexDist > 0.06;
    const middleRelCurled = middleDist < indexDist * L_SHAPE_CURL_RATIO;
    const ringRelCurled = ringDist < indexDist * L_SHAPE_CURL_RATIO;
    const pinkyRelCurled = pinkyDist < indexDist * L_SHAPE_CURL_RATIO;

    if (thumbOut && indexExtended && middleRelCurled && ringRelCurled && pinkyRelCurled) {
      return 'open_palm';
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

  // Calculate palm center
  const getPalmCenter = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): { x: number; y: number } => {
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

  // Process detected left hand
  const processLeftHand = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ) => {
    const smoothed = smoothLandmarks(landmarks, smoothedLandmarksRef.current);
    smoothedLandmarksRef.current = smoothed;

    const gesture = detectGesture(smoothed);
    const palmCenter = getPalmCenter(smoothed);
    const finger = smoothed[INDEX_TIP];
    const currentX = 1.0 - finger.x; // flip for mirror
    const currentY = finger.y;

    setLeftHand({
      isDetected: true,
      screenPosition: palmCenter,
      gesture,
      palmCenter,
    });

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

      // Check if user's hand is near the current target
      const target = CALIBRATION_TARGETS[targetIndex];
      const distToTarget = Math.sqrt(
        Math.pow(currentX - target.x, 2) + Math.pow(currentY - target.y, 2)
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
          calibratedRangeRef.current = {
            minX: 0.2, maxX: 0.8,
            minY: 0.2, maxY: 0.8,
            centerX: 0.5, centerY: 0.5,
          };
        }

        calibrationRef.current = null;
        setIsCalibrating(false);
        setIsCalibrated(true);
        setCalibrationProgress(100);
        setCurrentTargetIndex(0);
        setIsNearTarget(false);
      }

      // During calibration, don't control camera
      setCameraControl({ isActive: false });
      return;
    }

    // Normal operation with calibrated range
    if (gesture === 'pinch') {
      const zoomDelta = -ZOOM_SENSITIVITY;

      setCameraControl({
        azimuthDelta: 0,
        polarDelta: 0,
        zoomDelta,
        isActive: true,
      });
    } else if (gesture === 'open_palm') {
      const yFactor = 1.0 + (0.5 - palmCenter.y);
      const zoomDelta = ZOOM_SENSITIVITY * Math.max(0.3, yFactor);

      setCameraControl({
        azimuthDelta: 0,
        polarDelta: 0,
        zoomDelta,
        isActive: true,
      });
    } else {
      // OPEN HAND → orbit using calibrated range
      const range = calibratedRangeRef.current;
      const halfRangeX = (range.maxX - range.minX) / 2;
      const halfRangeY = (range.maxY - range.minY) / 2;

      // Normalize to -1 to 1 based on calibrated range
      const normalizedX = (currentX - range.centerX) / halfRangeX;
      const normalizedY = (currentY - range.centerY) / halfRangeY;

      // Clamp to -1 to 1
      const clampedX = Math.max(-1, Math.min(1, normalizedX));
      const clampedY = Math.max(-1, Math.min(1, normalizedY));

      // Dead zone (15% of calibrated range)
      const deadZone = 0.15;
      const activeX = Math.abs(clampedX) > deadZone ? clampedX : 0;
      const activeY = Math.abs(clampedY) > deadZone ? clampedY : 0;

      setCameraControl({
        azimuthDelta: activeX * 3.0,
        polarDelta: activeY * 2.5,
        zoomDelta: 0,
        isActive: true,
      });
    }
  }, [smoothLandmarks, detectGesture, getPalmCenter, setLeftHand, setCameraControl]);

  // Draw hand landmarks
  const drawHand = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: { x: number; y: number; z: number }[],
    width: number,
    height: number,
    options?: { lineWidth?: number; pointSize?: number; mirror?: boolean }
  ) => {
    const { lineWidth = 2, pointSize = 3, mirror = false } = options || {};

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];

    const getX = (x: number) => mirror ? (1 - x) * width : x * width;

    ctx.strokeStyle = '#3b82f6';
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

    ctx.fillStyle = '#3b82f6';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(getX(lm.x), lm.y * height, pointSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight index fingertip
    const indexTip = landmarks[INDEX_TIP];
    ctx.beginPath();
    ctx.arc(getX(indexTip.x), indexTip.y * height, pointSize * 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = lineWidth * 1.5;
    ctx.stroke();

    ctx.globalAlpha = 1;
  }, []);

  // Process MediaPipe results
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

    if (results.landmarks && results.handedness) {
      for (let i = 0; i < results.landmarks.length; i++) {
        const handedness = results.handedness[i];
        const isLeftHand = handedness?.[0]?.categoryName === 'Left';

        if (isLeftHand) {
          const landmarks = results.landmarks[i];
          processLeftHand(landmarks);

          // Draw on small preview canvas (mirror: true for natural display)
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
          return;
        }
      }
    }

    setLeftHandDetected(false);
    smoothedLandmarksRef.current = null;
    setCameraControl({ isActive: false });
  }, [processLeftHand, drawHand, setLeftHandDetected, setCameraControl, isCalibrating]);

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
          numHands: 2,
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

  // Detection loop
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

  // Sync canvas size
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

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '100px',
        left: '20px',
        zIndex: 20,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '2px solid rgba(59, 130, 246, 0.4)',
        boxShadow: '0 4px 20px rgba(59, 130, 246, 0.2)',
        background: '#000',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          fontSize: '8px',
          color: '#3b82f6',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          zIndex: 1,
        }}
      >
        Left (Nav)
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: '160px',
          height: '120px',
          display: 'block',
          background: '#000',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: error ? '#ef4444' : isInitialized && isReady ? '#3b82f6' : '#f59e0b',
        }}
      />

      {/* Full-screen calibration overlay */}
      {isCalibrating && (
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
              border: '2px solid rgba(74, 158, 255, 0.3)',
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
                  border: `4px solid ${isNearTarget ? '#22c55e' : '#3b82f6'}`,
                  background: isNearTarget ? 'rgba(34, 197, 94, 0.2)' : 'rgba(74, 158, 255, 0.1)',
                  transition: 'all 0.3s ease',
                  boxShadow: isNearTarget
                    ? '0 0 60px rgba(34, 197, 94, 0.6), 0 0 120px rgba(34, 197, 94, 0.3)'
                    : '0 0 40px rgba(74, 158, 255, 0.4), 0 0 80px rgba(74, 158, 255, 0.2)',
                }}
              >
                {/* Pulsing inner dot */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '20px',
                    borderRadius: '50%',
                    background: isNearTarget ? '#22c55e' : '#3b82f6',
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
                  color: isNearTarget ? '#22c55e' : '#3b82f6',
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
            CALIBRATING LEFT HAND
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
            Move your left hand to follow the target
          </div>

          {/* Feedback */}
          <div
            style={{
              marginTop: '30px',
              color: isNearTarget ? '#22c55e' : '#3b82f6',
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
                  background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
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
            Press C to restart calibration
          </div>
        </div>
      )}

      {/* Recalibrate hint */}
      {!isCalibrating && isCalibrated && (
        <div
          style={{
            position: 'absolute',
            bottom: '2px',
            right: '4px',
            fontSize: '6px',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          C to recal
        </div>
      )}

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
