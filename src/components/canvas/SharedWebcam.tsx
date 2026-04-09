'use client';

import { createContext, useContext, useRef, useEffect, useState, useCallback, ReactNode } from 'react';

interface SharedWebcamContextValue {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isReady: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

const SharedWebcamContext = createContext<SharedWebcamContextValue | null>(null);

export function useSharedWebcam() {
  const context = useContext(SharedWebcamContext);
  if (!context) {
    throw new Error('useSharedWebcam must be used within SharedWebcamProvider');
  }
  return context;
}

interface SharedWebcamProviderProps {
  children: ReactNode;
  enabled: boolean;
}

export function SharedWebcamProvider({ children, enabled }: SharedWebcamProviderProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (streamRef.current) return; // Already started

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsReady(true);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to start webcam:', err);
      setError('Camera access denied');
      setIsReady(false);
    }
  }, []);

  // Stop function that doesn't set state - for cleanup use
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopStream();
    setIsReady(false);
  }, [stopStream]);

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    let mounted = true;

    if (enabled) {
      // Wrap in async IIFE to avoid synchronous setState warnings
      (async () => {
        if (mounted) {
          await start();
        }
      })();
    }

    return () => {
      mounted = false;
      stopStream(); // Use stopStream in cleanup to avoid setState after unmount
    };
  }, [enabled, start, stopStream]);

  // Handle disabled state separately - defer state update to avoid lint warning
  useEffect(() => {
    if (!enabled) {
      // Defer to next tick to avoid synchronous setState warning
      const timer = setTimeout(() => {
        stop();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [enabled, stop]);

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
  }, [isReady]);

  const value: SharedWebcamContextValue = {
    videoRef,
    canvasRef,
    isReady,
    error,
    start,
    stop,
  };

  return (
    <SharedWebcamContext.Provider value={value}>
      {/* Video element shared by all trackers - visible for display */}
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
          display: enabled ? 'block' : 'none',
        }}
      >
        {/* Label for right hand tracker */}
        <div
          style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            fontSize: '8px',
            color: '#00ff88',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            zIndex: 1,
          }}
        >
          Right (Interact)
        </div>

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
        {/* Canvas overlay for right hand visualization - drawn by HandTracker */}
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
            background: error ? '#ef4444' : isReady ? '#22c55e' : '#f59e0b',
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
      {children}
    </SharedWebcamContext.Provider>
  );
}
