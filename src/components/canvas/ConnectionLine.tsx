'use client';

import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CanvasConnection } from '@/types/canvas';
import { useCanvasStore } from '@/store/canvas-store';

interface ConnectionLineProps {
  connection: CanvasConnection;
}

export function ConnectionLine({ connection }: ConnectionLineProps) {
  const fromNode = useCanvasStore((s) => s.nodes[connection.fromId]);
  const toNode = useCanvasStore((s) => s.nodes[connection.toId]);

  const points = useMemo(() => {
    if (!fromNode || !toNode) return null;
    const from = new THREE.Vector3(fromNode.position.x, fromNode.position.y, fromNode.position.z);
    const to = new THREE.Vector3(toNode.position.x, toNode.position.y, toNode.position.z);
    // Add a slight curve via midpoint offset
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y += 0.3;
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    return curve.getPoints(20);
  }, [fromNode, toNode]);

  if (!points) return null;

  const midpoint = points[Math.floor(points.length / 2)];

  return (
    <>
      <Line
        points={points}
        color={connection.color ?? '#6366f1'}
        lineWidth={2}
        opacity={0.7}
        transparent
      />
      {connection.label && midpoint && (
        <Html position={[midpoint.x, midpoint.y + 0.15, midpoint.z]} center>
          <span
            style={{
              fontSize: '10px',
              color: '#6366f1',
              background: 'rgba(255,255,255,0.9)',
              padding: '2px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            {connection.label}
          </span>
        </Html>
      )}
    </>
  );
}
