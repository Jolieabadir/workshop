'use client';

/**
 * SpatialEngine — Force-directed layout for the 3D canvas
 *
 * Makes spatial relationships physically meaningful:
 * - Connected nodes attract each other (spring force)
 * - Grouped nodes cluster more tightly (stronger spring)
 * - All nodes repel at close range (prevents overlap)
 * - Damping settles nodes into stable positions
 *
 * Runs in useFrame at 60fps, reads from canvas store and writes positions back.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';
import type { Vec3 } from '@/core/types';

// Tunable force constants
const SPATIAL_CONFIG = {
  connectionAttraction: 0.3,    // Spring strength for connected nodes
  groupAttraction: 0.6,         // Stronger spring for group members
  repulsionStrength: 2.0,       // Push force when nodes are too close
  repulsionRadius: 2.5,         // Distance at which repulsion starts
  damping: 0.92,                // Velocity damping per frame (0-1, higher = slower settling)
  maxVelocity: 0.1,             // Cap velocity to prevent wild movement
  restLength: 2.0,              // Ideal distance between connected nodes
  groupRestLength: 1.5,         // Tighter spacing for grouped nodes
  minY: 0.5,                    // Minimum Y position (above ground)
  maxY: 5.0,                    // Maximum Y position
};

interface Velocity {
  x: number;
  y: number;
  z: number;
}

/** Calculate distance between two 3D points */
function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

/** Normalize a vector */
function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function SpatialEngine() {
  // Velocity map - ephemeral state, not persisted to store
  const velocitiesRef = useRef<Map<string, Velocity>>(new Map());

  // Track when we last updated group centroids
  const lastGroupUpdateRef = useRef<number>(0);

  // Get store state and actions
  const nodes = useCanvasStore((s) => s.nodes);
  const connections = useCanvasStore((s) => s.connections);
  const groups = useCanvasStore((s) => s.groups);
  const moveNode = useCanvasStore((s) => s.moveNode);

  // Get grabbed node from hand store - exclude from simulation
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);

  useFrame((_, delta) => {
    const nodeList = Object.values(nodes);
    const connectionList = Object.values(connections);
    const groupList = Object.values(groups);

    if (nodeList.length === 0) return;

    // Cap delta to prevent huge jumps when tab is backgrounded
    const dt = Math.min(delta, 0.05);

    // Initialize velocities for new nodes
    for (const node of nodeList) {
      if (!velocitiesRef.current.has(node.id)) {
        velocitiesRef.current.set(node.id, { x: 0, y: 0, z: 0 });
      }
    }

    // Clean up velocities for deleted nodes
    for (const id of velocitiesRef.current.keys()) {
      if (!nodes[id]) {
        velocitiesRef.current.delete(id);
      }
    }

    // Accumulate forces for each node
    const forces = new Map<string, Vec3>();
    for (const node of nodeList) {
      forces.set(node.id, { x: 0, y: 0, z: 0 });
    }

    // 1. Connection attraction (spring force)
    for (const conn of connectionList) {
      const fromNode = nodes[conn.fromId];
      const toNode = nodes[conn.toId];
      if (!fromNode || !toNode) continue;

      const dist = distance(fromNode.position, toNode.position);
      if (dist === 0) continue;

      // Spring force: F = k * (distance - restLength)
      const displacement = dist - SPATIAL_CONFIG.restLength;
      const forceMagnitude = SPATIAL_CONFIG.connectionAttraction * displacement;

      // Direction from "from" to "to"
      const direction = normalize({
        x: toNode.position.x - fromNode.position.x,
        y: toNode.position.y - fromNode.position.y,
        z: toNode.position.z - fromNode.position.z,
      });

      // Apply force to both nodes (opposite directions)
      const fromForce = forces.get(conn.fromId)!;
      const toForce = forces.get(conn.toId)!;

      fromForce.x += direction.x * forceMagnitude;
      fromForce.y += direction.y * forceMagnitude;
      fromForce.z += direction.z * forceMagnitude;

      toForce.x -= direction.x * forceMagnitude;
      toForce.y -= direction.y * forceMagnitude;
      toForce.z -= direction.z * forceMagnitude;
    }

    // 2. Group attraction (stronger spring for group members)
    for (const group of groupList) {
      const memberNodes = group.nodeIds
        .map((id) => nodes[id])
        .filter((n): n is NonNullable<typeof n> => n !== undefined);

      if (memberNodes.length < 2) continue;

      // Apply pairwise attraction between all group members
      for (let i = 0; i < memberNodes.length; i++) {
        for (let j = i + 1; j < memberNodes.length; j++) {
          const nodeA = memberNodes[i];
          const nodeB = memberNodes[j];

          const dist = distance(nodeA.position, nodeB.position);
          if (dist === 0) continue;

          // Stronger spring for group members with tighter rest length
          const displacement = dist - SPATIAL_CONFIG.groupRestLength;
          const forceMagnitude = SPATIAL_CONFIG.groupAttraction * displacement;

          const direction = normalize({
            x: nodeB.position.x - nodeA.position.x,
            y: nodeB.position.y - nodeA.position.y,
            z: nodeB.position.z - nodeA.position.z,
          });

          const forceA = forces.get(nodeA.id)!;
          const forceB = forces.get(nodeB.id)!;

          forceA.x += direction.x * forceMagnitude;
          forceA.y += direction.y * forceMagnitude;
          forceA.z += direction.z * forceMagnitude;

          forceB.x -= direction.x * forceMagnitude;
          forceB.y -= direction.y * forceMagnitude;
          forceB.z -= direction.z * forceMagnitude;
        }
      }
    }

    // 3. Universal repulsion (prevent overlap)
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const nodeA = nodeList[i];
        const nodeB = nodeList[j];

        const dist = distance(nodeA.position, nodeB.position);

        // Only apply repulsion within radius
        if (dist >= SPATIAL_CONFIG.repulsionRadius || dist === 0) continue;

        // Inverse square repulsion: F = k / d^2
        // Stronger when closer
        const forceMagnitude = SPATIAL_CONFIG.repulsionStrength / (dist * dist);

        // Direction away from each other
        const direction = normalize({
          x: nodeB.position.x - nodeA.position.x,
          y: nodeB.position.y - nodeA.position.y,
          z: nodeB.position.z - nodeA.position.z,
        });

        const forceA = forces.get(nodeA.id)!;
        const forceB = forces.get(nodeB.id)!;

        // Push nodes apart
        forceA.x -= direction.x * forceMagnitude;
        forceA.y -= direction.y * forceMagnitude;
        forceA.z -= direction.z * forceMagnitude;

        forceB.x += direction.x * forceMagnitude;
        forceB.y += direction.y * forceMagnitude;
        forceB.z += direction.z * forceMagnitude;
      }
    }

    // 4. Apply forces to velocities and update positions
    let anyMoved = false;

    for (const node of nodeList) {
      // Skip grabbed node - user has control
      if (node.id === grabbedNodeId) {
        // Reset velocity when grabbed so it doesn't shoot off when released
        velocitiesRef.current.set(node.id, { x: 0, y: 0, z: 0 });
        continue;
      }

      const force = forces.get(node.id)!;
      const velocity = velocitiesRef.current.get(node.id)!;

      // Apply force to velocity (F = ma, assume m = 1)
      velocity.x += force.x * dt;
      velocity.y += force.y * dt;
      velocity.z += force.z * dt;

      // Apply damping
      velocity.x *= SPATIAL_CONFIG.damping;
      velocity.y *= SPATIAL_CONFIG.damping;
      velocity.z *= SPATIAL_CONFIG.damping;

      // Clamp velocity magnitude
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
      if (speed > SPATIAL_CONFIG.maxVelocity) {
        const scale = SPATIAL_CONFIG.maxVelocity / speed;
        velocity.x *= scale;
        velocity.y *= scale;
        velocity.z *= scale;
      }

      // Skip tiny movements to avoid constant store updates
      if (Math.abs(velocity.x) < 0.0001 && Math.abs(velocity.y) < 0.0001 && Math.abs(velocity.z) < 0.0001) {
        continue;
      }

      // Calculate new position
      const newPos: Vec3 = {
        x: node.position.x + velocity.x,
        y: clamp(node.position.y + velocity.y, SPATIAL_CONFIG.minY, SPATIAL_CONFIG.maxY),
        z: node.position.z + velocity.z,
      };

      // Only update if position actually changed meaningfully
      if (
        Math.abs(newPos.x - node.position.x) > 0.0001 ||
        Math.abs(newPos.y - node.position.y) > 0.0001 ||
        Math.abs(newPos.z - node.position.z) > 0.0001
      ) {
        moveNode(node.id, newPos);
        anyMoved = true;
      }
    }

    // 5. Update group centroids periodically (not every frame)
    const now = Date.now();
    if (anyMoved && now - lastGroupUpdateRef.current > 100) {
      lastGroupUpdateRef.current = now;

      // Update group positions to centroid of members
      for (const group of groupList) {
        const memberPositions = group.nodeIds
          .map((id) => nodes[id]?.position)
          .filter((p): p is Vec3 => p !== undefined);

        if (memberPositions.length > 0) {
          const centroid: Vec3 = {
            x: memberPositions.reduce((sum, p) => sum + p.x, 0) / memberPositions.length,
            y: memberPositions.reduce((sum, p) => sum + p.y, 0) / memberPositions.length,
            z: memberPositions.reduce((sum, p) => sum + p.z, 0) / memberPositions.length,
          };

          // Update group position in store if changed significantly
          if (
            Math.abs(centroid.x - group.position.x) > 0.1 ||
            Math.abs(centroid.y - group.position.y) > 0.1 ||
            Math.abs(centroid.z - group.position.z) > 0.1
          ) {
            useCanvasStore.setState((s) => ({
              groups: {
                ...s.groups,
                [group.id]: { ...group, position: centroid },
              },
            }));
          }
        }
      }
    }
  });

  // This component doesn't render anything
  return null;
}
