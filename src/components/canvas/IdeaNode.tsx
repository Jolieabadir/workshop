'use client';

import { Html } from '@react-three/drei';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CanvasNode } from '@/types/canvas';
import { useCanvasStore } from '@/store/canvas-store';

interface IdeaNodeProps {
  node: CanvasNode;
}

export function IdeaNode({ node }: IdeaNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pushFocus = useCanvasStore((s) => s.pushFocus);

  // Gentle floating animation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.position.y += Math.sin(Date.now() * 0.001 + node.position.x) * delta * 0.05;
    }
  });

  const bgColor = node.color ?? 'rgba(255,255,255,0.95)';

  return (
    <mesh
      ref={meshRef}
      position={[node.position.x, node.position.y, node.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        pushFocus(node.id);
      }}
    >
      <Html
        transform
        distanceFactor={6}
        style={{
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            background: bgColor,
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '16px 20px',
            minWidth: '180px',
            maxWidth: '280px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            cursor: 'pointer',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {node.title && (
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#1a1a2e',
                marginBottom: '6px',
                letterSpacing: '-0.01em',
              }}
            >
              {node.title}
            </div>
          )}
          <div
            style={{
              fontSize: '12px',
              color: '#4a4a6a',
              lineHeight: 1.5,
            }}
          >
            {node.content}
          </div>
          {node.badges && node.badges.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {node.badges.map((b) => (
                <span
                  key={b.id}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background:
                      b.type === 'warning' ? '#fff3cd' : b.type === 'error' ? '#f8d7da' : b.type === 'success' ? '#d4edda' : '#d1ecf1',
                    color:
                      b.type === 'warning' ? '#856404' : b.type === 'error' ? '#721c24' : b.type === 'success' ? '#155724' : '#0c5460',
                  }}
                >
                  {b.message}
                </span>
              ))}
            </div>
          )}
        </div>
      </Html>
    </mesh>
  );
}
