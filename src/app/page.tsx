'use client';

import dynamic from 'next/dynamic';
import { useCanvasStore } from '@/store/canvas-store';

const Workshop3DCanvas = dynamic(
  () => import('@/components/canvas/Workshop3DCanvas').then((m) => m.Workshop3DCanvas),
  { ssr: false }
);

export default function Home() {
  const transcript = useCanvasStore((s) => s.transcript);
  const isListening = useCanvasStore((s) => s.isListening);
  const addNode = useCanvasStore((s) => s.addNode);
  const addConnection = useCanvasStore((s) => s.addConnection);
  const focusStack = useCanvasStore((s) => s.focusStack);
  const nodes = useCanvasStore((s) => s.nodes);

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
              {isListening ? 'Listening...' : 'Press mic to start'}
            </span>
          </div>
          <div style={{ fontSize: '14px', color: '#e5e7eb', minHeight: '20px' }}>
            {transcript || 'Say something to build on the canvas...'}
          </div>

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
