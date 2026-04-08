'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import { DeepgramClient } from '@/lib/deepgram';
import type { BuilderAction } from '@/types/canvas';

const Workshop3DCanvas = dynamic(
  () => import('@/components/canvas/Workshop3DCanvas').then((m) => m.Workshop3DCanvas),
  { ssr: false }
);

export default function Home() {
  const transcript = useCanvasStore((s) => s.transcript);
  const setTranscript = useCanvasStore((s) => s.setTranscript);
  const isListening = useCanvasStore((s) => s.isListening);
  const setListening = useCanvasStore((s) => s.setListening);
  const addNode = useCanvasStore((s) => s.addNode);
  const addConnection = useCanvasStore((s) => s.addConnection);
  const focusStack = useCanvasStore((s) => s.focusStack);
  const nodes = useCanvasStore((s) => s.nodes);
  const connections = useCanvasStore((s) => s.connections);
  const groups = useCanvasStore((s) => s.groups);
  const executeAction = useCanvasStore((s) => s.executeAction);

  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Deepgram client and transcript state
  const deepgramRef = useRef<DeepgramClient | null>(null);
  const interimTranscriptRef = useRef<string>('');
  const finalTranscriptRef = useRef<string>('');

  // Initialize Deepgram client
  useEffect(() => {
    deepgramRef.current = new DeepgramClient({
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          // Append final transcript
          finalTranscriptRef.current = finalTranscriptRef.current
            ? `${finalTranscriptRef.current} ${text}`
            : text;
          interimTranscriptRef.current = '';
          setTranscript(finalTranscriptRef.current);
        } else {
          // Show interim transcript
          interimTranscriptRef.current = text;
          setTranscript(
            finalTranscriptRef.current
              ? `${finalTranscriptRef.current} ${text}`
              : text
          );
        }
      },
      onStatus: (status, error) => {
        if (status === 'connected') {
          setListening(true);
          setMicError(null);
        } else if (status === 'disconnected') {
          setListening(false);
        } else if (status === 'error') {
          setListening(false);
          setMicError(error || 'Microphone error');
        }
      },
    });

    return () => {
      deepgramRef.current?.stop();
    };
  }, [setTranscript, setListening]);

  // Handle mic toggle
  const handleMicToggle = useCallback(async () => {
    if (!deepgramRef.current) return;

    try {
      setMicError(null);
      if (isListening) {
        deepgramRef.current.stop();
        interimTranscriptRef.current = '';
      } else {
        // Clear transcripts when starting fresh
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        setTranscript('');
        await deepgramRef.current.start();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access microphone';
      setMicError(message);
    }
  }, [isListening, setTranscript]);

  const sendToBuilder = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return;

    setIsProcessing(true);
    setTranscript(text);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          canvasState: { nodes, connections, groups, focusStack },
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const actions: BuilderAction[] = data.actions || [];

      for (const action of actions) {
        executeAction(action);
      }
    } catch (error) {
      console.error('Failed to send to builder:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [nodes, connections, groups, focusStack, executeAction, setTranscript, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendToBuilder(inputValue);
      setInputValue('');
    }
  };

  return (
    <>
      <Workshop3DCanvas />

      {/* HUD Overlay */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '20px',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            background: 'rgba(10,10,26,0.85)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '16px 20px',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            {/* Mic toggle button */}
            <button
              onClick={handleMicToggle}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: 'none',
                background: isListening ? '#ef4444' : '#6366f1',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isListening ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none',
                transition: 'all 0.2s ease',
              }}
              title={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isListening ? (
                // Stop icon
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect width="14" height="14" rx="2" />
                </svg>
              ) : (
                // Mic icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              )}
            </button>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isListening ? '#22c55e' : '#6b7280',
                boxShadow: isListening ? '0 0 8px #22c55e' : 'none',
              }}
            />
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              {micError ? (
                <span style={{ color: '#ef4444' }}>{micError}</span>
              ) : isListening ? (
                'Listening...'
              ) : (
                'Press mic to start'
              )}
            </span>
          </div>
          <div style={{ fontSize: '14px', color: '#e5e7eb', minHeight: '20px' }}>
            {transcript || 'Say something to build on the canvas...'}
          </div>

          {/* Text input for Builder agent */}
          <form onSubmit={handleSubmit} style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type to build..."
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e5e7eb',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={isProcessing || !inputValue.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isProcessing ? '#4b5563' : '#6366f1',
                  color: '#fff',
                  fontSize: '13px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                }}
              >
                {isProcessing ? '...' : 'Send'}
              </button>
            </div>
          </form>

          {/* Debug buttons — replaced by voice + gestures later */}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => addNode('text_card', 'New idea', 'Untitled')} style={btnStyle}>
              + Add card
            </button>
            <button
              onClick={() => {
                const ids = Object.keys(nodes);
                if (ids.length >= 2) addConnection(ids[ids.length - 2], ids[ids.length - 1], 'relates to');
              }}
              style={btnStyle}
            >
              + Connect last two
            </button>
            <button
              onClick={() => {
                const id1 = addNode('text_card', 'IMU — accelerometer and gyroscope', 'IMU Sensor', { x: -2, y: 1.5, z: 0 });
                const id2 = addNode('text_card', 'nRF52840 — BLE 5.0, ARM Cortex-M4', 'MCU', { x: 0, y: 1.5, z: 0 });
                const id3 = addNode('text_card', 'Bluetooth Low Energy communication', 'BLE Module', { x: 2, y: 1.5, z: 0 });
                setTimeout(() => {
                  addConnection(id1, id2, 'data bus');
                  addConnection(id2, id3, 'wireless');
                }, 100);
              }}
              style={btnStyle}
            >
              Demo: Hardware layout
            </button>
          </div>
        </div>
      </div>

      {/* Focus indicator */}
      {focusStack.length > 0 && nodes[focusStack[0]] && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(10,10,26,0.85)',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '12px 16px',
            fontSize: '12px',
            color: '#9ca3af',
            zIndex: 10,
          }}
        >
          <span style={{ color: '#6366f1', fontWeight: 600 }}>Focus:</span>{' '}
          {nodes[focusStack[0]].title || nodes[focusStack[0]].content.slice(0, 30)}
        </div>
      )}
    </>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '6px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#d1d5db',
  cursor: 'pointer',
};
