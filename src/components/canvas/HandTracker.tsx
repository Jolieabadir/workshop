'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { useHandStore } from '@/store/hand-store';
import { useCanvasStore } from '@/store/canvas-store';
import type { Vec3, HandGesture, Handedness } from '@/types/canvas';

// MediaPipe hand landmark indices
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9; // Palm center landmark
const PINKY_MCP = 17;

// Gesture thresholds
const PINCH_THRESHOLD = 0.08;
const OPEN_PALM_THRESHOLD = 0.15;
const GRAB_DISTANCE_3D = 1.5;

// Camera control sensitivity
const CAMERA_AZIMUTH_SENSITIVITY = 2.0;
const CAMERA_POLAR_SENSITIVITY = 1.5;
const CAMERA_ZOOM_SENSITIVITY = 3.0;
const CAMERA_DEADZONE = 0.1; // Center deadzone where no movement occurs

// Smoothing factor for EMA (exponential moving average)
// position = alpha * newPos + (1-alpha) * lastPos
// Lower alpha = smoother but more latency, higher = responsive but jittery
const SMOOTHING_ALPHA = 0.15;

// Maximum allowed landmark jump between frames (in normalized screen space)
// Jumps larger than this are likely detection resets, not real movement
const MAX_LANDMARK_JUMP = 0.15;

interface HandTrackerProps {
  enabled?: boolean;
}

export function HandTracker({ enabled = true }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  // Track previous palm positions for delta calculation
  const prevLeftPalmRef = useRef<{ x: number; y: number; z: number } | null>(null);

  // Track previous pinch distance for zoom delta calculation
  const prevLeftPinchRef = useRef<number | null>(null);

  // Smoothed landmarks for each hand (EMA smoothing to kill jitter)
  const smoothedLeftLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const smoothedRightLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);

  // Previous raw landmarks for velocity check (detect jumps from detection resets)
  const prevRawLeftLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const prevRawRightLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hand store actions
  const setTracking = useHandStore((s) => s.setTracking);
  const setLeftHand = useHandStore((s) => s.setLeftHand);
  const setLeftHandDetected = useHandStore((s) => s.setLeftHandDetected);
  const setRightHand = useHandStore((s) => s.setRightHand);
  const setRightHandDetected = useHandStore((s) => s.setRightHandDetected);
  const setGrabbedNode = useHandStore((s) => s.setGrabbedNode);
  const setHoveredNode = useHandStore((s) => s.setHoveredNode);
  const setCameraControl = useHandStore((s) => s.setCameraControl);
  const reset = useHandStore((s) => s.reset);

  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);
  const leftHandGesture = useHandStore((s) => s.leftHand.gesture);
  const rightHandGesture = useHandStore((s) => s.rightHand.gesture);

  // Canvas store for node interaction
  const nodes = useCanvasStore((s) => s.nodes);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const pushFocus = useCanvasStore((s) => s.pushFocus);

  // Check if landmarks jumped too much (detection reset)
  // Returns true if any landmark moved more than MAX_LANDMARK_JUMP in x or y
  const hasLandmarkJump = useCallback((
    newLandmarks: { x: number; y: number; z: number }[],
    prevLandmarks: { x: number; y: number; z: number }[] | null
  ): boolean => {
    if (!prevLandmarks) return false; // First frame, no jump

    for (let i = 0; i < newLandmarks.length && i < prevLandmarks.length; i++) {
      const dx = Math.abs(newLandmarks[i].x - prevLandmarks[i].x);
      const dy = Math.abs(newLandmarks[i].y - prevLandmarks[i].y);
      if (dx > MAX_LANDMARK_JUMP || dy > MAX_LANDMARK_JUMP) {
        return true;
      }
    }
    return false;
  }, []);

  // Apply EMA smoothing to landmarks: smoothed = alpha * new + (1-alpha) * prev
  const smoothLandmarks = useCallback((
    newLandmarks: { x: number; y: number; z: number }[],
    prevSmoothed: { x: number; y: number; z: number }[] | null,
    alpha: number = SMOOTHING_ALPHA
  ): { x: number; y: number; z: number }[] => {
    if (!prevSmoothed) {
      // First frame - no previous data, use raw
      return newLandmarks.map(lm => ({ ...lm }));
    }

    // Apply EMA to each landmark
    return newLandmarks.map((lm, i) => {
      const prev = prevSmoothed[i];
      return {
        x: alpha * lm.x + (1 - alpha) * prev.x,
        y: alpha * lm.y + (1 - alpha) * prev.y,
        z: alpha * lm.z + (1 - alpha) * prev.z,
      };
    });
  }, []);

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

    if (pinchDist < PINCH_THRESHOLD) {
      return { gesture: 'pinch', pinchDist };
    }

    const thumbIndex = landmarkDistance(landmarks, THUMB_TIP, INDEX_TIP);
    const indexMiddle = landmarkDistance(landmarks, INDEX_TIP, MIDDLE_TIP);
    const middleRing = landmarkDistance(landmarks, MIDDLE_TIP, RING_TIP);
    const ringPinky = landmarkDistance(landmarks, RING_TIP, PINKY_TIP);

    const avgFingerSpread = (thumbIndex + indexMiddle + middleRing + ringPinky) / 4;
    if (avgFingerSpread > OPEN_PALM_THRESHOLD) {
      return { gesture: 'open_palm', pinchDist };
    }

    const indexExtended = landmarks[INDEX_TIP].y < landmarks[WRIST].y;
    const middleCurled = landmarks[MIDDLE_TIP].y > landmarks[INDEX_TIP].y + 0.05;
    const ringCurled = landmarks[RING_TIP].y > landmarks[INDEX_TIP].y + 0.05;

    if (indexExtended && middleCurled && ringCurled) {
      return { gesture: 'point', pinchDist };
    }

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

  // Calculate palm center from landmarks (use MIDDLE_MCP as primary reference)
  const getPalmCenter = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): { x: number; y: number; z: number } => {
    // Landmark 9 (MIDDLE_MCP) is the center of the palm
    return { ...landmarks[MIDDLE_MCP] };
  }, []);

  // Map screen position to 3D world position (smaller ranges to reduce jumps)
  const screenTo3D = useCallback((screenX: number, screenY: number): Vec3 => {
    return {
      x: (1 - screenX) * 8 - 4,
      y: (1 - screenY) * 3 + 0.5,
      z: 1.5,
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

  // Process LEFT HAND for camera navigation
  const processLeftHand = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ) => {
    const palmCenter = getPalmCenter(landmarks);
    const { gesture, pinchDist } = detectGesture(landmarks);
    const screenPos = { x: palmCenter.x, y: palmCenter.y };

    setLeftHand({
      isDetected: true,
      screenPosition: screenPos,
      palmCenter: screenPos,
      gesture,
      pinchDistance: pinchDist,
    });

    // OPEN PALM = Camera orbit control (azimuth + polar)
    if (gesture === 'open_palm') {
      // Calculate delta from center (0.5, 0.5)
      const centerX = 0.5;
      const centerY = 0.5;
      const deltaX = palmCenter.x - centerX;
      const deltaY = palmCenter.y - centerY;

      // Store palm position for reference
      prevLeftPalmRef.current = { ...palmCenter };
      prevLeftPinchRef.current = null; // Reset pinch tracking

      // Apply deadzone
      const azimuthDelta = Math.abs(deltaX) > CAMERA_DEADZONE
        ? deltaX * CAMERA_AZIMUTH_SENSITIVITY
        : 0;
      const polarDelta = Math.abs(deltaY) > CAMERA_DEADZONE
        ? -deltaY * CAMERA_POLAR_SENSITIVITY // Invert Y for natural feel
        : 0;

      setCameraControl({
        azimuthDelta,
        polarDelta,
        zoomDelta: 0,
        isActive: true,
      });
    }
    // PINCH = Camera zoom control
    else if (gesture === 'pinch') {
      let zoomDelta = 0;

      if (prevLeftPinchRef.current !== null) {
        // Calculate zoom from pinch distance change
        // Opening fingers (increasing distance) = zoom out
        // Closing fingers (decreasing distance) = zoom in
        const pinchDelta = pinchDist - prevLeftPinchRef.current;
        if (Math.abs(pinchDelta) > 0.005) {
          zoomDelta = -pinchDelta * CAMERA_ZOOM_SENSITIVITY * 10;
        }
      }
      prevLeftPinchRef.current = pinchDist;
      prevLeftPalmRef.current = null; // Reset palm tracking

      setCameraControl({
        azimuthDelta: 0,
        polarDelta: 0,
        zoomDelta,
        isActive: zoomDelta !== 0,
      });
    }
    // Other gestures - stop camera control
    else {
      prevLeftPalmRef.current = null;
      prevLeftPinchRef.current = null;
      setCameraControl({
        azimuthDelta: 0,
        polarDelta: 0,
        zoomDelta: 0,
        isActive: false,
      });
    }
  }, [getPalmCenter, detectGesture, setLeftHand, setCameraControl]);

  // Process RIGHT HAND for node interaction
  const processRightHand = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ) => {
    const indexTip = landmarks[INDEX_TIP];
    const screenPos = { x: indexTip.x, y: indexTip.y };
    const pos3D = screenTo3D(indexTip.x, indexTip.y);
    const { gesture, pinchDist } = detectGesture(landmarks);

    setRightHand({
      isDetected: true,
      screenPosition: screenPos,
      position: pos3D,
      gesture,
      pinchDistance: pinchDist,
    });

    // Handle node interactions
    const nearestNode = findNearestNode(pos3D);

    if (gesture === 'pinch') {
      if (!grabbedNodeId && nearestNode) {
        setGrabbedNode(nearestNode);
        pushFocus(nearestNode);
      } else if (grabbedNodeId) {
        moveNode(grabbedNodeId, pos3D);
      }
    } else {
      if (grabbedNodeId) {
        setGrabbedNode(null);
      }
    }

    if (gesture === 'point') {
      setHoveredNode(nearestNode);
    } else if (gesture !== 'pinch') {
      setHoveredNode(null);
    }
  }, [screenTo3D, detectGesture, findNearestNode, setRightHand, setGrabbedNode, setHoveredNode, grabbedNodeId, moveNode, pushFocus]);

  // Process hand landmarks and update state
  const processResults = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Track which hands were detected this frame
    let leftDetected = false;
    let rightDetected = false;

    if (results.landmarks && results.landmarks.length > 0 && results.handednesses) {
      for (let i = 0; i < results.landmarks.length; i++) {
        const rawLandmarks = results.landmarks[i];
        const handedness = results.handednesses[i]?.[0];

        if (!handedness) continue;

        // MediaPipe returns "Left" or "Right" from the camera's perspective
        // Since we mirror the video, we swap them for the user's perspective
        const isLeftHand = handedness.categoryName === 'Right'; // Swapped due to mirror
        const isRightHand = handedness.categoryName === 'Left';

        if (isLeftHand) {
          leftDetected = true;
          // Velocity check: skip frame if landmarks jumped too much (detection reset)
          if (hasLandmarkJump(rawLandmarks, prevRawLeftLandmarksRef.current)) {
            // Store raw landmarks but don't update state this frame
            prevRawLeftLandmarksRef.current = rawLandmarks.map(lm => ({ ...lm }));
            continue;
          }
          prevRawLeftLandmarksRef.current = rawLandmarks.map(lm => ({ ...lm }));
          // Apply EMA smoothing to reduce jitter
          const smoothed = smoothLandmarks(rawLandmarks, smoothedLeftLandmarksRef.current);
          smoothedLeftLandmarksRef.current = smoothed;
          processLeftHand(smoothed);
          drawHandLandmarks(ctx, smoothed, canvas.width, canvas.height, leftHandGesture, 'Left');
        } else if (isRightHand) {
          rightDetected = true;
          // Velocity check: skip frame if landmarks jumped too much (detection reset)
          if (hasLandmarkJump(rawLandmarks, prevRawRightLandmarksRef.current)) {
            // Store raw landmarks but don't update state this frame
            prevRawRightLandmarksRef.current = rawLandmarks.map(lm => ({ ...lm }));
            continue;
          }
          prevRawRightLandmarksRef.current = rawLandmarks.map(lm => ({ ...lm }));
          // Apply EMA smoothing to reduce jitter
          const smoothed = smoothLandmarks(rawLandmarks, smoothedRightLandmarksRef.current);
          smoothedRightLandmarksRef.current = smoothed;
          processRightHand(smoothed);
          drawHandLandmarks(ctx, smoothed, canvas.width, canvas.height, rightHandGesture, 'Right');
        }
      }
    }

    // Update detection state for hands not seen this frame
    if (!leftDetected) {
      setLeftHandDetected(false);
      setCameraControl({ isActive: false, azimuthDelta: 0, polarDelta: 0, zoomDelta: 0 });
      prevLeftPalmRef.current = null;
      smoothedLeftLandmarksRef.current = null; // Reset smoothing state
      prevRawLeftLandmarksRef.current = null; // Reset velocity check state
    }
    if (!rightDetected) {
      setRightHandDetected(false);
      if (grabbedNodeId) {
        setGrabbedNode(null);
      }
      setHoveredNode(null);
      smoothedRightLandmarksRef.current = null; // Reset smoothing state
      prevRawRightLandmarksRef.current = null; // Reset velocity check state
    }
  }, [processLeftHand, processRightHand, smoothLandmarks, hasLandmarkJump, leftHandGesture, rightHandGesture, setLeftHandDetected, setRightHandDetected, setCameraControl, grabbedNodeId, setGrabbedNode, setHoveredNode]);

  // Draw hand landmarks with gesture visualization
  const drawHandLandmarks = (
    ctx: CanvasRenderingContext2D,
    landmarks: { x: number; y: number; z: number }[],
    width: number,
    height: number,
    currentGesture: HandGesture,
    hand: 'Left' | 'Right'
  ) => {
    const gestureColors: Record<HandGesture, string> = {
      none: '#ffffff',
      point: '#00ff88',
      pinch: '#ff6b9d',
      open_palm: '#6c63ff',
      fist: '#ff9500',
    };

    // Different base colors for left (blue tint) vs right (red tint)
    const handTint = hand === 'Left' ? '#4a9eff' : '#ff6b9d';
    const color = currentGesture !== 'none' ? gestureColors[currentGesture] : handTint;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
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

    ctx.fillStyle = color;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const radius = i === INDEX_TIP && hand === 'Right' ? 6 : 3;
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw palm center indicator for left hand (using landmark 9 - MIDDLE_MCP)
    if (hand === 'Left') {
      const palmCenter = landmarks[MIDDLE_MCP];

      ctx.beginPath();
      ctx.arc(palmCenter.x * width, palmCenter.y * height, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Right hand - highlight index tip
    if (hand === 'Right') {
      const indexTip = landmarks[INDEX_TIP];
      ctx.beginPath();
      ctx.arc(indexTip.x * width, indexTip.y * height, 10, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw hand label
    const labelX = hand === 'Left' ? 8 : width - 40;
    ctx.fillStyle = handTint;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(hand === 'Left' ? 'L' : 'R', labelX, 14);

    ctx.globalAlpha = 1;
  };

  // Initialize MediaPipe HandLandmarker with aggressive re-detection settings
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
          numHands: 2, // Track both hands
          // Aggressive re-detection for orientation issues
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.3, // Lower to re-detect more aggressively
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

  const leftDetected = useHandStore.getState().leftHand.isDetected;
  const rightDetected = useHandStore.getState().rightHand.isDetected;

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
          boxShadow: `0 0 6px ${error ? '#ef4444' : isInitialized ? '#22c55e' : '#f59e0b'}`,
        }}
      />

      {/* Hand indicators */}
      <div
        style={{
          position: 'absolute',
          bottom: '4px',
          left: '4px',
          display: 'flex',
          gap: '4px',
        }}
      >
        {/* Left hand indicator */}
        <div
          style={{
            padding: '2px 6px',
            borderRadius: '4px',
            background: leftDetected ? 'rgba(74, 158, 255, 0.8)' : 'rgba(0,0,0,0.5)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 600,
          }}
        >
          L
        </div>
        {/* Right hand indicator */}
        <div
          style={{
            padding: '2px 6px',
            borderRadius: '4px',
            background: rightDetected ? 'rgba(255, 107, 157, 0.8)' : 'rgba(0,0,0,0.5)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 600,
          }}
        >
          R
        </div>
      </div>

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
