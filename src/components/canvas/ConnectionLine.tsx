'use client';

import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CanvasConnection } from '@/core/types';
import { useCanvasStore } from '@/store/canvas-store';

// Connection tension configuration
const CONNECTION_CONFIG = {
  idealDistance: 2.0,       // Equilibrium distance (matches SpatialEngine restLength)
  maxCurveOffset: 0.5,      // Maximum bezier curve offset when relaxed
  minCurveOffset: 0.05,     // Minimum curve offset when taut
  tensionThreshold: 4.0,    // Distance at which line is fully taut
};

interface ConnectionLineProps {
  connection: CanvasConnection;
}

export function ConnectionLine({ connection }: ConnectionLineProps) {
  const fromNode = useCanvasStore((s) => s.nodes[connection.fromId]);
  const toNode = useCanvasStore((s) => s.nodes[connection.toId]);

  // Calculate curve points with tension-aware bezier offset
  const { points, tension } = useMemo(() => {
    if (!fromNode || !toNode) return { points: null, tension: 0 };

    const from = new THREE.Vector3(fromNode.position.x, fromNode.position.y, fromNode.position.z);
    const to = new THREE.Vector3(toNode.position.x, toNode.position.y, toNode.position.z);

    // Calculate distance and tension
    const dist = from.distanceTo(to);

    // Tension: 0 when at ideal distance, 1 when at or beyond threshold
    const rawTension = Math.max(0, (dist - CONNECTION_CONFIG.idealDistance) /
      (CONNECTION_CONFIG.tensionThreshold - CONNECTION_CONFIG.idealDistance));
    const tensionValue = Math.min(1, rawTension);

    // Curve offset inversely proportional to tension
    // Close nodes = more curve (relaxed), far nodes = less curve (taut)
    const curveOffset = THREE.MathUtils.lerp(
      CONNECTION_CONFIG.maxCurveOffset,
      CONNECTION_CONFIG.minCurveOffset,
      tensionValue
    );

    // Calculate midpoint with curve offset
    const mid = from.clone().add(to).multiplyScalar(0.5);

    // Offset perpendicular to the line (upward by default, scaled by connection distance)
    // Shorter connections get proportionally larger curves for visual clarity
    const relativeOffset = curveOffset * Math.max(1, 3 / Math.max(dist, 0.5));
    mid.y += relativeOffset;

    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    return {
      points: curve.getPoints(20),
      tension: tensionValue,
    };
  }, [fromNode, toNode]);

  if (!points) return null;

  const midpoint = points[Math.floor(points.length / 2)];

  // Line width varies with tension (thinner when taut, thicker when relaxed)
  const lineWidth = THREE.MathUtils.lerp(2.5, 1.5, tension);

  // Opacity also varies slightly (more opaque when taut to show strain)
  const opacity = THREE.MathUtils.lerp(0.6, 0.85, tension);

  // Color can shift slightly based on tension (more saturated when stretched)
  const baseColor = connection.color ?? '#6366f1';

  return (
    <>
      <Line
        points={points}
        color={baseColor}
        lineWidth={lineWidth}
        opacity={opacity}
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
