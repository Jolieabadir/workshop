'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';
import { useSafetyStore } from '@/store/safety-store';
import { useInputStore } from '@/store/input-store';
import { useOwlAnalysis } from '@/hooks/useOwlAnalysis';
import { DeepgramClient } from '@/lib/deepgram';
import { getTTSPlayer } from '@/lib/tts-player';
import { processHandInput } from '@/lib/input-manager';
import { logBuilderActions, getActionSummary, getActionIcon, formatLogTime } from '@/lib/agents/safety-log';
import type { BuilderAction, CanvasState, UnifiedIntent } from '@/types/canvas';

const Workshop3DCanvas = dynamic(
  () => import('@/components/canvas/Workshop3DCanvas').then((m) => m.Workshop3DCanvas),
  { ssr: false }
);

const HandTracker = dynamic(
  () => import('@/components/canvas/HandTracker').then((m) => m.HandTracker),
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
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [logPanelOpen, setLogPanelOpen] = useState(false);

  // Safety log
  const safetyLog = useSafetyStore((s) => s.log);

  // Input Manager state
  const pointedNodeId = useInputStore((s) => s.pointedNodeId);
  const activeGesture = useInputStore((s) => s.activeGesture);
  const pendingIntents = useInputStore((s) => s.pendingIntents);

  // Owl background analysis - fires automatically after canvas changes
  useOwlAnalysis();

  // TTS player ref
  const ttsPlayerRef = useRef<ReturnType<typeof getTTSPlayer> | null>(null);

  // Initialize TTS player
  useEffect(() => {
    ttsPlayerRef.current = getTTSPlayer({
      voice: 'aura-asteria-en',
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: (err) => {
        console.error('TTS error:', err);
        setIsSpeaking(false);
      },
    });
  }, []);

  // Hand tracking state (two-hand)
  const handIsTracking = useHandStore((s) => s.isTracking);
  const leftHand = useHandStore((s) => s.leftHand);
  const rightHand = useHandStore((s) => s.rightHand);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);
  const hoveredNodeId = useHandStore((s) => s.hoveredNodeId);
  const cameraControl = useHandStore((s) => s.cameraControl);

  // Legacy aliases for compatibility
  const handGesture = rightHand.gesture;
  const handPosition = rightHand.position;

  // Feed hand tracking into Input Manager
  useEffect(() => {
    if (handIsTracking) {
      processHandInput(handGesture, handPosition, hoveredNodeId);
    }
  }, [handIsTracking, handGesture, handPosition, hoveredNodeId]);

  // Deepgram client and transcript state
  const deepgramRef = useRef<DeepgramClient | null>(null);
  const interimTranscriptRef = useRef<string>('');
  const finalTranscriptRef = useRef<string>('');
  const sendToBuilderRef = useRef<(text: string, intent: UnifiedIntent | null) => void>(() => {});

  // Initialize Deepgram client
  useEffect(() => {
    deepgramRef.current = new DeepgramClient({
      onTranscript: (text, isFinal, speechFinal) => {
        if (isFinal) {
          // Append finalized segment to accumulated transcript
          finalTranscriptRef.current = finalTranscriptRef.current
            ? `${finalTranscriptRef.current} ${text}`
            : text;
          interimTranscriptRef.current = '';
          setTranscript(finalTranscriptRef.current);
        } else {
          // Show interim transcript (real-time feedback)
          interimTranscriptRef.current = text;
          setTranscript(
            finalTranscriptRef.current
              ? `${finalTranscriptRef.current} ${text}`
              : text
          );
        }

        // speech_final = user paused speaking (utterance complete)
        // Direct pipeline: Deepgram speech_final -> POST /api/agent -> execute actions
        if (speechFinal && finalTranscriptRef.current.trim()) {
          const utterance = finalTranscriptRef.current.trim();
          console.log('[PIPELINE] 1. SPEECH_FINAL received:', utterance);

          // Clear immediately to prevent double-sends
          finalTranscriptRef.current = '';

          // Direct call to Builder - no middleman
          sendToBuilderRef.current(utterance, null);
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

  const sendToBuilder = useCallback(async (text: string, _intent: UnifiedIntent | null = null) => {
    if (!text.trim()) return;

    // Prevent concurrent requests
    if (isProcessing) {
      console.log('[Builder] Skipping - already processing');
      return;
    }

    console.log('[PIPELINE] 2. Sending to /api/agent:', text);
    setIsProcessing(true);
    setTranscript(text);

    // Get FRESH canvas state at call time (not stale closure)
    const store = useCanvasStore.getState();
    const canvasBefore: CanvasState = {
      nodes: store.nodes,
      connections: store.connections,
      groups: store.groups,
      focusStack: store.focusStack,
    };

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          canvasState: canvasBefore,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Builder] API error:', response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const actions: BuilderAction[] = data.actions || [];
      console.log('[PIPELINE] 3. Received actions from Builder:', actions.length, actions.map(a => a.type));
      console.log('[PIPELINE] ALL ACTIONS:', JSON.stringify(actions.map(a => a.type)));
      console.log('[PIPELINE] TTS ACTIONS:', actions.filter(a => a.type === 'respond_verbally'));

      // Execute each action and track what was done
      let hadTTS = false;
      const canvasActions: string[] = [];

      for (const action of actions) {
        console.log('[PIPELINE] 4. Executing action:', action.type, action);
        store.executeAction(action);

        // Handle TTS for verbal responses - NUCLEAR FIX: bypass tts-player entirely
        if (action.type === 'respond_verbally' && action.message) {
          console.log('[PIPELINE] 5. DIRECT TTS:', action.message);
          const u = new SpeechSynthesisUtterance(action.message);
          u.rate = 1.0;
          u.pitch = 1.0;
          window.speechSynthesis.speak(u);
          hadTTS = true;
        } else if (action.type === 'create_node') {
          canvasActions.push(`created ${action.title || 'node'}`);
        } else if (action.type === 'create_connection') {
          canvasActions.push('connected nodes');
        } else if (action.type === 'move_node') {
          canvasActions.push('moved node');
        } else if (action.type === 'delete_node') {
          canvasActions.push('deleted node');
        } else if (action.type === 'update_node') {
          canvasActions.push('updated node');
        } else if (action.type === 'group_nodes') {
          canvasActions.push('grouped nodes');
        }
      }

      // FALLBACK: If Builder didn't call respond_verbally but did canvas actions, auto-generate TTS
      if (!hadTTS && canvasActions.length > 0) {
        const fallbackMessage = canvasActions.join(' and ');
        console.log('[PIPELINE] 5. FALLBACK TTS (Builder forgot respond_verbally):', fallbackMessage);
        const u = new SpeechSynthesisUtterance(fallbackMessage);
        u.rate = 1.0;
        u.pitch = 1.0;
        window.speechSynthesis.speak(u);
      }

      // Log actions to Safety Supervisor
      if (actions.length > 0) {
        const canvasAfter = useCanvasStore.getState();
        logBuilderActions(actions, text, canvasBefore, canvasAfter);
      }
    } catch (error) {
      console.error('[Builder] Failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, setTranscript]);

  // Keep sendToBuilder ref up to date (avoids stale closure in Deepgram callback)
  useEffect(() => {
    sendToBuilderRef.current = sendToBuilder;
  }, [sendToBuilder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendToBuilder(inputValue, null);
      setInputValue('');
    }
  };

  return (
    <>
      <Workshop3DCanvas />

      {/* Hand Tracker (webcam + MediaPipe) */}
      {handTrackingEnabled && <HandTracker enabled={handTrackingEnabled} />}

      {/* Safety Log Panel — Top Left */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={() => setLogPanelOpen(!logPanelOpen)}
          style={{
            background: 'rgba(10,10,26,0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: logPanelOpen ? '12px 12px 0 0' : '12px',
            padding: '8px 14px',
            color: '#ef4444',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: logPanelOpen ? '280px' : 'auto',
          }}
        >
          <span style={{ fontSize: '14px' }}>🛡</span>
          Safety Log
          <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
            {logPanelOpen ? '▲' : '▼'}
          </span>
          {safetyLog.length > 0 && !logPanelOpen && (
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                borderRadius: '10px',
                padding: '2px 6px',
                fontSize: '10px',
                marginLeft: '4px',
              }}
            >
              {safetyLog.length}
            </span>
          )}
        </button>

        {logPanelOpen && (
          <div
            style={{
              background: 'rgba(10,10,26,0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderTop: 'none',
              borderRadius: '0 0 12px 12px',
              width: '280px',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {safetyLog.length === 0 ? (
              <div
                style={{
                  padding: '16px',
                  color: '#6b7280',
                  fontSize: '11px',
                  textAlign: 'center',
                }}
              >
                No actions logged yet
              </div>
            ) : (
              <div style={{ padding: '8px' }}>
                {safetyLog.slice(0, 15).map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      padding: '8px 10px',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px' }}>{getActionIcon(entry.action)}</span>
                      <span style={{ color: '#e5e7eb', fontWeight: 500 }}>
                        {getActionSummary(entry.action)}
                      </span>
                      <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: '10px' }}>
                        {formatLogTime(entry.timestamp)}
                      </span>
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '10px', paddingLeft: '18px' }}>
                      &ldquo;{entry.utterance.slice(0, 40)}{entry.utterance.length > 40 ? '...' : ''}&rdquo;
                    </div>
                    {(entry.canvasDiff.nodesAdded.length > 0 ||
                      entry.canvasDiff.nodesRemoved.length > 0 ||
                      entry.canvasDiff.connectionsAdded.length > 0) && (
                      <div style={{ color: '#6b7280', fontSize: '9px', paddingLeft: '18px', marginTop: '2px' }}>
                        {entry.canvasDiff.nodesAdded.length > 0 && (
                          <span style={{ color: '#22c55e' }}>+{entry.canvasDiff.nodesAdded.length} node </span>
                        )}
                        {entry.canvasDiff.nodesRemoved.length > 0 && (
                          <span style={{ color: '#ef4444' }}>-{entry.canvasDiff.nodesRemoved.length} node </span>
                        )}
                        {entry.canvasDiff.connectionsAdded.length > 0 && (
                          <span style={{ color: '#6366f1' }}>+{entry.canvasDiff.connectionsAdded.length} conn</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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

            {/* Hand tracking toggle button */}
            <button
              onClick={() => setHandTrackingEnabled(!handTrackingEnabled)}
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
              {/* Hand icon */}
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
