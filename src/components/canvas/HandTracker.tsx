'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { useHandStore } from '@/store/hand-store';
import { useCanvasStore } from '@/store/canvas-store';
import type { Vec3, HandGesture } from '@/types/canvas';

// MediaPipe hand landmark indices
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const WRIST = 0;

// Gesture thresholds
const PINCH_THRESHOLD = 0.08; // Normalized distance for pinch detection
const OPEN_PALM_THRESHOLD = 0.15; // Min distance between fingers for open palm
const GRAB_DISTANCE_3D = 1.5; // Max distance to grab a node in 3D space

interface HandTrackerProps {
  enabled?: boolean;
}

export function HandTracker({ enabled = true }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hand store actions
  const setTracking = useHandStore((s) => s.setTracking);
  const setPosition = useHandStore((s) => s.setPosition);
  const setScreenPosition = useHandStore((s) => s.setScreenPosition);
  const setGesture = useHandStore((s) => s.setGesture);
  const setGrabbedNode = useHandStore((s) => s.setGrabbedNode);
  const setHoveredNode = useHandStore((s) => s.setHoveredNode);
  const setPinchDistance = useHandStore((s) => s.setPinchDistance);
  const reset = useHandStore((s) => s.reset);

  const gesture = useHandStore((s) => s.gesture);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);

  // Canvas store for node interaction
  const nodes = useCanvasStore((s) => s.nodes);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const pushFocus = useCanvasStore((s) => s.pushFocus);

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
  ): { gesture: HandGesture; pinchDist: number } => {
    const pinchDist = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);

    // Check pinch (thumb + index close together)
    if (pinchDist < PINCH_THRESHOLD) {
      return { gesture: 'pinch', pinchDist };
    }

    // Check open palm (all fingers spread)
    const thumbIndex = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);
    const indexMiddle = landmarkDistance(landmarks, INDEX_TIP, MIDDLE_TIP);
    const middleRing = landmarkDistance(landmarks, MIDDLE_TIP, RING_TIP);
    const ringPinky = landmarkDistance(landmarks, RING_TIP, PINKY_TIP);

    const avgFingerSpread = (thumbIndex + indexMiddle + middleRing + ringPinky) / 4;
    if (avgFingerSpread > OPEN_PALM_THRESHOLD) {
      return { gesture: 'open_palm', pinchDist };
    }

    // Check point (index extended, others curled)
    const indexExtended = landmarks[INDEX_TIP].y < landmarks[WRIST].y;
    const middleCurled = landmarks[MIDDLE_TIP].y > landmarks[INDEX_TIP].y + 0.05;
    const ringCurled = landmarks[RING_TIP].y > landmarks[INDEX_TIP].y + 0.05;

    if (indexExtended && middleCurled && ringCurled) {
      return { gesture: 'point', pinchDist };
    }

    // Check fist (all fingers curled)
    const allCurled =
      landmarks[INDEX_TIP].y > landmarks[WRIST].y - 0.1 &&
      landmarks[MIDDLE_TIP].y > landmarks[WRIST].y - 0.1 &&
      landmarks[RING_TIP].y > landmarks[WRIST].y - 0.1 &&
      landmarks[PINKY_TIP].y > landmarks[WRIST].y - 0.1;

    if (allCurled) {
      return { gesture: 'fist', pinchDist };
    }

    return { gesture: 'none', pinchDist };
  }, [landmarkDistance]);

  // Map screen position to 3D world position
  const screenTo3D = useCallback((screenX: number, screenY: number): Vec3 => {
    // Map normalized screen coords to 3D space
    // screenX/Y are 0-1, map to reasonable 3D range
    // Note: x is mirrored for natural interaction
    return {
      x: (1 - screenX) * 10 - 5, // Mirror and map to -5 to 5
      y: (1 - screenY) * 4 + 0.5, // Map to 0.5 to 4.5
      z: 2, // Fixed z for now, could use hand depth
    };
  }, []);

  // Find nearest node to a 3D position
  const findNearestNode = useCallback((pos: Vec3): string | null => {
    let nearestId: string | null = null;
    let nearestDist = Infinity;

    for (const node of Object.values(nodes)) {
      const dist = Math.sqrt(
        Math.pow(node.position.x - pos.x, 2) +
        Math.pow(node.position.y - pos.y, 2) +
        Math.pow(node.position.z - pos.z, 2)
      );
      if (dist < nearestDist && dist < GRAB_DISTANCE_3D) {
        nearestDist = dist;
        nearestId = node.id;
      }
    }

    return nearestId;
  }, [nodes]);

  // Process hand landmarks and update state
  const processResults = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];

      // Get index finger tip position (primary cursor)
      const indexTip = landmarks[INDEX_TIP];
      const screenPos = { x: indexTip.x, y: indexTip.y };
      const pos3D = screenTo3D(indexTip.x, indexTip.y);

      setScreenPosition(screenPos);
      setPosition(pos3D);

      // Detect gesture
      const { gesture: detectedGesture, pinchDist } = detectGesture(landmarks);
      setGesture(detectedGesture);
      setPinchDistance(pinchDist);

      // Handle gesture interactions
      const nearestNode = findNearestNode(pos3D);

      if (detectedGesture === 'pinch') {
        if (!grabbedNodeId && nearestNode) {
          // Start grabbing
          setGrabbedNode(nearestNode);
          pushFocus(nearestNode);
        } else if (grabbedNodeId) {
          // Continue dragging
          moveNode(grabbedNodeId, pos3D);
        }
      } else {
        // Release grab
        if (grabbedNodeId) {
          setGrabbedNode(null);
        }
      }

      if (detectedGesture === 'point') {
        setHoveredNode(nearestNode);
      } else if (detectedGesture !== 'pinch') {
        setHoveredNode(null);
      }

      // Draw hand landmarks on canvas overlay
      drawHandLandmarks(ctx, landmarks, canvas.width, canvas.height, detectedGesture);
    } else {
      // No hand detected
      setScreenPosition(null);
      setPosition(null);
      setGesture('none');
      setHoveredNode(null);
      if (grabbedNodeId) {
        setGrabbedNode(null);
      }
    }
  }, [
    screenTo3D, detectGesture, findNearestNode,
    setScreenPosition, setPosition, setGesture, setPinchDistance,
    setGrabbedNode, setHoveredNode, grabbedNodeId, moveNode, pushFocus
  ]);

  // Draw hand landmarks with gesture visualization
  const drawHandLandmarks = (
    ctx: CanvasRenderingContext2D,
    landmarks: { x: number; y: number; z: number }[],
    width: number,
    height: number,
    currentGesture: HandGesture
  ) => {
    // Gesture colors
    const gestureColors: Record<HandGesture, string> = {
      none: '#ffffff',
      point: '#00ff88',
      pinch: '#ff6b9d',
      open_palm: '#6c63ff',
      fist: '#ff9500',
    };

    const color = gestureColors[currentGesture];

    // Draw connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17], // Palm
    ];

    ctx.strokeStyle = color;
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

    // Draw landmarks
    ctx.fillStyle = color;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, i === INDEX_TIP ? 6 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight index finger tip (cursor)
    const indexTip = landmarks[INDEX_TIP];
    ctx.beginPath();
    ctx.arc(indexTip.x * width, indexTip.y * height, 10, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw gesture label
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(currentGesture.toUpperCase(), 8, 20);

    ctx.globalAlpha = 1;
  };

  // Initialize MediaPipe HandLandmarker
  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    const initializeHandLandmarker = async () => {
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
          numHands: 1,
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
        if (mounted) {
          setError('Failed to load hand tracking model');
        }
      }
    };

    initializeHandLandmarker();

    return () => {
      mounted = false;
      handLandmarkerRef.current?.close();
    };
  }, [enabled]);

  // Start webcam and tracking loop
  useEffect(() => {
    if (!enabled || !isInitialized) return;

    let mounted = true;

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
        });

        if (!mounted || !videoRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setTracking(true);

        // Start detection loop
        const detectLoop = () => {
          if (!mounted || !videoRef.current || !handLandmarkerRef.current) return;

          const video = videoRef.current;
          const currentTime = video.currentTime;

          if (currentTime !== lastVideoTimeRef.current && video.readyState >= 2) {
            lastVideoTimeRef.current = currentTime;
            const results = handLandmarkerRef.current.detectForVideo(video, performance.now());
            processResults(results);
          }

          animationFrameRef.current = requestAnimationFrame(detectLoop);
        };

        detectLoop();
      } catch (err) {
        console.error('Failed to start webcam:', err);
        if (mounted) {
          setError('Camera access denied');
        }
      }
    };

    startWebcam();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationFrameRef.current);

      const video = videoRef.current;
      if (video?.srcObject) {
        const tracks = (video.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }

      reset();
    };
  }, [enabled, isInitialized, setTracking, processResults, reset]);

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
      {/* Webcam video (hidden, used for processing) */}
      <video
        ref={videoRef}
        style={{
          width: '160px',
          height: '120px',
          transform: 'scaleX(-1)', // Mirror for natural interaction
          display: 'block',
        }}
        playsInline
        muted
      />

      {/* Canvas overlay for hand landmarks */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '160px',
          height: '120px',
          transform: 'scaleX(-1)', // Mirror to match video
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
          boxShadow: `0 0 6px ${error ? '#ef4444' : isInitialized ? '#22c55e' : '#f59e0b'}`,
        }}
      />

      {/* Gesture indicator */}
      {gesture !== 'none' && (
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {gesture}
        </div>
      )}

      {/* Error message */}
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
