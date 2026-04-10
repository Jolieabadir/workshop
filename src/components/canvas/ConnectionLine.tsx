'use client';

import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CanvasConnection, CanvasNode, Vec3 } from '@/core/types';
import { useCanvasStore } from '@/store/canvas-store';

// Component scale factor (must match ComponentGenerator.tsx)
const COMPONENT_SCALE = 10;

/**
 * Get the world position for a connection endpoint.
 * If the node has a component with connectorPoints and a matching port is specified,
 * returns the connector's world position (node position + scaled connector offset).
 * Otherwise returns the node center.
 */
function getEndpointPosition(node: CanvasNode, portId?: string): Vec3 {
  // Check if node has component connector points and a port is specified
  if (portId && node.component?.connectorPoints) {
    const connector = node.component.connectorPoints.find(cp => cp.id === portId);
    if (connector) {
      // Connector position is relative to node origin in local coords
      // Must multiply by COMPONENT_SCALE to match the visual rendering
      return {
        x: node.position.x + connector.position.x * COMPONENT_SCALE,
        y: node.position.y + connector.position.y * COMPONENT_SCALE,
        z: node.position.z + connector.position.z * COMPONENT_SCALE,
      };
    }
  }
  // Fall back to node center
  return node.position;
}

// Connection tension configuration for regular brainstorming nodes
const CONNECTION_CONFIG = {
  idealDistance: 2.0,       // Equilibrium distance (matches SpatialEngine restLength)
  maxCurveOffset: 0.5,      // Maximum bezier curve offset when relaxed
  minCurveOffset: 0.05,     // Minimum curve offset when taut
  tensionThreshold: 4.0,    // Distance at which line is fully taut
};

// Wire configuration for electronic component connections
const WIRE_CONFIG = {
  color: '#888888',         // Neutral wire gray
  lineWidth: 1.0,           // Thin wire
  curveOffset: 0.1,         // Tighter bezier curve for more direct wires
};

interface ConnectionLineProps {
  connection: CanvasConnection;
}

export function ConnectionLine({ connection }: ConnectionLineProps) {
  const fromNode = useCanvasStore((s) => s.nodes[connection.fromId]);
  const toNode = useCanvasStore((s) => s.nodes[connection.toId]);

  // Determine if this is a wire connection (both nodes are electronic components)
  const isWireConnection = fromNode?.component && toNode?.component;

  // Calculate curve points with tension-aware bezier offset
  const { points, tension } = useMemo(() => {
    if (!fromNode || !toNode) return { points: null, tension: 0 };

    // Get endpoint positions (connector points if specified, otherwise node centers)
    const fromPos = getEndpointPosition(fromNode, connection.fromPort);
    const toPos = getEndpointPosition(toNode, connection.toPort);

    const from = new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z);
    const to = new THREE.Vector3(toPos.x, toPos.y, toPos.z);

    // Calculate distance and tension
    const dist = from.distanceTo(to);

    // For wire connections, use tighter curves
    if (isWireConnection) {
      const mid = from.clone().add(to).multiplyScalar(0.5);
      mid.y += WIRE_CONFIG.curveOffset;
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      return {
        points: curve.getPoints(20),
        tension: 1, // Wires are always "taut"
      };
    }

    // Regular brainstorming connections with tension-aware curves
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
  }, [fromNode, toNode, isWireConnection, connection.fromPort, connection.toPort]);

  if (!points) return null;

  const midpoint = points[Math.floor(points.length / 2)];

  // Wire connections: thin gray lines, no labels in middle
  if (isWireConnection) {
    return (
      <Line
        points={points}
        color={connection.color ?? WIRE_CONFIG.color}
        lineWidth={WIRE_CONFIG.lineWidth}
        opacity={0.9}
        transparent
      />
    );
  }

  // Regular brainstorming connections: tension-aware styling with labels
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
