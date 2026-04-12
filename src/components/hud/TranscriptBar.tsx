// ============================================================
// Workshop — Transcript Bar Component
// Bottom HUD showing voice controls and transcript
// ============================================================

'use client';

import { useState } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';
import { useVisualFeedbackLoop } from '@/hooks/useVisualFeedbackLoop';

interface TranscriptBarProps {
  isListening: boolean;
  isSpeaking: boolean;
  micError: string | null;
  handTrackingEnabled: boolean;
  isProcessing: boolean;
  onMicToggle: () => void;
  onHandTrackingToggle: () => void;
  onSubmit: (text: string) => void;
}

export function TranscriptBar({
  isListening,
  isSpeaking,
  micError,
  handTrackingEnabled,
  isProcessing,
  onMicToggle,
  onHandTrackingToggle,
  onSubmit,
}: TranscriptBarProps) {
  const [inputValue, setInputValue] = useState('');
  const transcript = useCanvasStore((s) => s.transcript);
  const nodes = useCanvasStore((s) => s.nodes);
  const addNode = useCanvasStore((s) => s.addNode);
  const addConnection = useCanvasStore((s) => s.addConnection);

  // Hand tracking state
  const handIsTracking = useHandStore((s) => s.isTracking);
  const leftHand = useHandStore((s) => s.leftHand);
  const rightHand = useHandStore((s) => s.rightHand);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);

  // Visual feedback loop for assembly correction
  const {
    isRunning: isFixingAssembly,
    currentIteration,
    maxIterations,
    lastEvaluation,
    triggerVisualFeedbackLoop,
  } = useVisualFeedbackLoop();

  // Derive Owl verdict display
  const owlVerdict = lastEvaluation?.assemblyVerdict;
  const issueCount = owlVerdict?.issueCount ??
    lastEvaluation?.partEvaluations?.filter((p) => p.issue !== 'none').length ?? 0;

  const handleFixAssembly = async () => {
    if (isFixingAssembly) return;
    const result = await triggerVisualFeedbackLoop();
    if (result.success) {
      console.log(`[FIX ASSEMBLY] Approved after ${result.iterations} iteration(s)`);
    } else {
      console.log(`[FIX ASSEMBLY] Completed ${result.iterations} iteration(s), not fully approved`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSubmit(inputValue);
      setInputValue('');
    }
  };

  return (
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
            onClick={onMicToggle}
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
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect width="14" height="14" rx="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>

          {/* Hand tracking toggle button */}
          <button
            onClick={onHandTrackingToggle}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              background: handTrackingEnabled ? '#22c55e' : '#4b5563',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: handTrackingEnabled ? '0 0 12px rgba(34, 197, 94, 0.5)' : 'none',
              transition: 'all 0.2s ease',
            }}
            title={handTrackingEnabled ? 'Disable hand tracking' : 'Enable hand tracking'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8.5V5c0-.83-.67-1.5-1.5-1.5S15 4.17 15 5v5h-1V3.5c0-.83-.67-1.5-1.5-1.5S11 2.67 11 3.5v6.5h-1V4c0-.83-.67-1.5-1.5-1.5S7 3.17 7 4v7.5H6V8c0-.83-.67-1.5-1.5-1.5S3 7.17 3 8v7c0 4.14 3.36 7.5 7.5 7.5h2c4.14 0 7.5-3.36 7.5-7.5v-6c0-.83-.67-1.5-1.5-1.5S18 7.67 18 8.5z" />
            </svg>
          </button>

          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: isSpeaking ? '#ff6b9d' : isListening ? '#22c55e' : '#6b7280',
              boxShadow: isSpeaking ? '0 0 8px #ff6b9d' : isListening ? '0 0 8px #22c55e' : 'none',
              animation: isSpeaking ? 'pulse 0.5s ease-in-out infinite' : 'none',
            }}
          />

          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            {micError ? (
              <span style={{ color: '#ef4444' }}>{micError}</span>
            ) : isSpeaking ? (
              <span style={{ color: '#ff6b9d' }}>Builder speaking...</span>
            ) : isListening ? (
              'Listening...'
            ) : handTrackingEnabled && handIsTracking ? (
              <span>
                {leftHand.isDetected && (
                  <span style={{ color: '#4a9eff' }}>
                    L:{leftHand.gesture === 'open_palm' ? 'nav' : leftHand.gesture}
                  </span>
                )}
                {leftHand.isDetected && rightHand.isDetected && ' | '}
                {rightHand.isDetected && (
                  <span style={{ color: '#ff6b9d' }}>
                    R:{rightHand.gesture}
                    {grabbedNodeId && ' (grab)'}
                  </span>
                )}
                {!leftHand.isDetected && !rightHand.isDetected && (
                  <span style={{ color: '#6b7280' }}>Searching for hands...</span>
                )}
              </span>
            ) : (
              'Press mic or enable hand tracking'
            )}
          </span>
        </div>

        <div style={{ fontSize: '14px', color: '#e5e7eb', minHeight: '20px' }}>
          {transcript || 'Say something to build on the canvas...'}
        </div>

        {/* Text input */}
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

        {/* Debug buttons */}
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleFixAssembly}
            disabled={isFixingAssembly}
            style={{
              ...btnStyle,
              background: isFixingAssembly ? 'rgba(168, 85, 247, 0.3)' : 'rgba(168, 85, 247, 0.2)',
              borderColor: isFixingAssembly ? 'rgba(168, 85, 247, 0.6)' : 'rgba(168, 85, 247, 0.4)',
              color: isFixingAssembly ? '#c4b5fd' : '#a78bfa',
              cursor: isFixingAssembly ? 'wait' : 'pointer',
            }}
          >
            {isFixingAssembly
              ? `🔧 Fixing... (${currentIteration}/${maxIterations})`
              : '🔧 Fix Assembly'}
          </button>
          {/* Owl verdict display */}
          {lastEvaluation && !isFixingAssembly && (
            <span
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: owlVerdict?.verdict === 'APPROVED'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${owlVerdict?.verdict === 'APPROVED'
                  ? 'rgba(34, 197, 94, 0.4)'
                  : 'rgba(239, 68, 68, 0.4)'}`,
                color: owlVerdict?.verdict === 'APPROVED' ? '#4ade80' : '#f87171',
              }}
            >
              {owlVerdict?.verdict === 'APPROVED'
                ? '🦉 APPROVED ✓'
                : `🦉 NOT APPROVED — ${issueCount} issue${issueCount !== 1 ? 's' : ''}`}
            </span>
          )}
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
