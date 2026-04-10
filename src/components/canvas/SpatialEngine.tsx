'use client';

/**
 * SpatialEngine — Basic collision avoidance for nodes
 *
 * Simple behavior: nodes don't overlap. That's it.
 * - Loop through all pairs of nodes each frame
 * - If two nodes are closer than MIN_DISTANCE, push them apart gently
 * - Skip nodes being grabbed by the user
 * - Only write to store when nodes actually need to move
 *
 * No springs, no attraction, no velocity, no momentum.
 * This is the foundation we build on later.
 */

import { useFrame } from '@react-three/fiber';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';

// Collision parameters
const MIN_DISTANCE = 2.0;      // Nodes must be at least this far apart
const PUSH_STRENGTH = 0.02;   // Gentle push per frame (not instant snap)

export function SpatialEngine() {
  useFrame(() => {
    const nodes = useCanvasStore.getState().nodes;
    const moveNode = useCanvasStore.getState().moveNode;
    const grabbedNodeId = useHandStore.getState().grabbedNodeId;

    const nodeList = Object.values(nodes);
    if (nodeList.length < 2) return;

    // Track which nodes need to move and by how much
    const adjustments = new Map<string, { x: number; y: number; z: number }>();

    // Check all pairs of nodes for overlap
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const nodeA = nodeList[i];
        const nodeB = nodeList[j];

        // Calculate distance between nodes
        const dx = nodeB.position.x - nodeA.position.x;
        const dy = nodeB.position.y - nodeA.position.y;
        const dz = nodeB.position.z - nodeA.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Skip if not overlapping or at same position
        if (dist >= MIN_DISTANCE || dist < 0.001) continue;

        // Calculate overlap and push direction
        const overlap = MIN_DISTANCE - dist;
        const pushX = (dx / dist) * overlap * PUSH_STRENGTH;
        const pushY = (dy / dist) * overlap * PUSH_STRENGTH;
        const pushZ = (dz / dist) * overlap * PUSH_STRENGTH;

        // Accumulate adjustments for each node (skip if grabbed)
        if (nodeA.id !== grabbedNodeId) {
          const adjA = adjustments.get(nodeA.id) || { x: 0, y: 0, z: 0 };
          adjA.x -= pushX;
          adjA.y -= pushY;
          adjA.z -= pushZ;
          adjustments.set(nodeA.id, adjA);
        }

        if (nodeB.id !== grabbedNodeId) {
          const adjB = adjustments.get(nodeB.id) || { x: 0, y: 0, z: 0 };
          adjB.x += pushX;
          adjB.y += pushY;
          adjB.z += pushZ;
          adjustments.set(nodeB.id, adjB);
        }
      }
    }

    // Apply repulsion adjustments to nodes that need to move
    for (const [nodeId, adj] of adjustments) {
      // Skip tiny movements
      if (Math.abs(adj.x) < 0.0001 && Math.abs(adj.y) < 0.0001 && Math.abs(adj.z) < 0.0001) {
        continue;
      }

      const node = nodes[nodeId];
      if (!node) continue;

      moveNode(nodeId, {
        x: node.position.x + adj.x,
        y: Math.max(0.5, node.position.y + adj.y), // Keep above ground
        z: node.position.z + adj.z,
      });
    }

    // ATTRACTION: Pull connected nodes toward each other
    const connections = Object.values(useCanvasStore.getState().connections);

    for (const conn of connections) {
      const nodeA = nodes[conn.fromId];
      const nodeB = nodes[conn.toId];
      if (!nodeA || !nodeB) continue;

      // Skip if either node is grabbed
      if (nodeA.id === grabbedNodeId || nodeB.id === grabbedNodeId) continue;

      const dx = nodeB.position.x - nodeA.position.x;
      const dy = nodeB.position.y - nodeA.position.y;
      const dz = nodeB.position.z - nodeA.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Use tighter distance and stronger attraction for component connections
      const isComponentConnection = nodeA.component && nodeB.component;
      const idealDist = isComponentConnection ? 2.0 : 3.0;
      const strength = isComponentConnection ? 0.02 : 0.01;

      // Only attract if nodes are further than ideal distance
      if (dist > idealDist && dist > 0.001) {
        const excess = dist - idealDist;
        const pullX = (dx / dist) * excess * strength;
        const pullY = (dy / dist) * excess * strength;
        const pullZ = (dz / dist) * excess * strength;

        // Pull both nodes toward each other
        moveNode(nodeA.id, {
          x: nodeA.position.x + pullX,
          y: Math.max(0.5, nodeA.position.y + pullY),
          z: nodeA.position.z + pullZ,
        });
        moveNode(nodeB.id, {
          x: nodeB.position.x - pullX,
          y: Math.max(0.5, nodeB.position.y - pullY),
          z: nodeB.position.z - pullZ,
        });
      }
    }
  });

  // Invisible component - no render
  return null;
}
