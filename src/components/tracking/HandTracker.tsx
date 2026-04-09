'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { useHandStore } from '@/store/hand-store';
import type { HandGesture } from '@/core/types';

// MediaPipe hand landmark indices
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const WRIST = 0;

// Gesture thresholds
const PINCH_THRESHOLD = 0.07;
const OPEN_PALM_THRESHOLD = 0.12;

// Smoothing factor for EMA (lower = smoother)
const SMOOTHING_ALPHA = 0.25;

interface HandTrackerProps {
  enabled?: boolean;
}

export function HandTracker({ enabled = true }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  // Smoothed landmarks
  const smoothedLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const detectGesture = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): HandGesture => {
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

    // Get index finger tip for cursor position
    const indexTip = smoothed[INDEX_TIP];
    const screenPos = { x: indexTip.x, y: indexTip.y };

    // Detect gesture
    const gesture = detectGesture(smoothed);

    // Update hand store - only screenPosition and gesture matter for HandCursor
    setRightHand({
      isDetected: true,
      screenPosition: screenPos,
      gesture,
    });
  }, [smoothLandmarks, detectGesture, setRightHand]);

  // Process results from MediaPipe
  const processResults = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Use first detected hand (any hand)
    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      processHand(landmarks);

      // Draw hand visualization
      drawHand(ctx, landmarks, canvas.width, canvas.height);
    } else {
      // No hand detected
      setRightHandDetected(false);
      smoothedLandmarksRef.current = null;
    }
  }, [processHand, setRightHandDetected]);

  // Draw hand landmarks
  const drawHand = (
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
  };

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
          numHands: 1, // Only track one hand
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
        if (mounted) setError('Failed to load hand tracking');
      }
    };

    init();

    return () => {
      mounted = false;
      handLandmarkerRef.current?.close();
    };
  }, [enabled]);

  // Start webcam and detection loop
  useEffect(() => {
    if (!enabled || !isInitialized) return;

    let mounted = true;

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });

        if (!mounted || !videoRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
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
      } catch (err) {
        console.error('Failed to start webcam:', err);
        if (mounted) setError('Camera access denied');
      }
    };

    startWebcam();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationFrameRef.current);
      const video = videoRef.current;
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      reset();
    };
  }, [enabled, isInitialized, setTracking, processResults, reset]);

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
  }, []);

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
        border: '2px solid rgba(255,255,255,0.2)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        background: '#0a0a1a',
      }}
    >
      <video
        ref={videoRef}
        style={{
          width: '160px',
          height: '120px',
          transform: 'scaleX(-1)',
          display: 'block',
        }}
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '160px',
          height: '120px',
          transform: 'scaleX(-1)',
          pointerEvents: 'none',
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
          background: error ? '#ef4444' : isInitialized ? '#22c55e' : '#f59e0b',
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
