'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useHandStore } from '@/store/hand-store';
import { useCanvasStore } from '@/store/canvas-store';

// Store node mesh references for raycasting
const nodeMeshes = new Map<string, THREE.Object3D>();

export function registerNodeMesh(nodeId: string, mesh: THREE.Object3D | null) {
  if (mesh) {
    nodeMeshes.set(nodeId, mesh);
  } else {
    nodeMeshes.delete(nodeId);
  }
}

export function HandRaycaster() {
  const { camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());

  // Previous position for delta calculation during drag
  const prevDragPosRef = useRef<THREE.Vector3 | null>(null);

  // Hand store state
  const rightHand = useHandStore((s) => s.rightHand);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);
  const setGrabbedNode = useHandStore((s) => s.setGrabbedNode);
  const setHoveredNode = useHandStore((s) => s.setHoveredNode);

  // Canvas store actions
  const nodes = useCanvasStore((s) => s.nodes);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const pushFocus = useCanvasStore((s) => s.pushFocus);
  const setNextPlacementPosition = useCanvasStore((s) => s.setNextPlacementPosition);

  const screenPos = rightHand.screenPosition;
  const gesture = rightHand.gesture;
  const isDetected = rightHand.isDetected;

  useFrame(() => {
    if (!isDetected || !screenPos) {
      // Reset states when hand not detected
      if (grabbedNodeId) {
        setGrabbedNode(null);
      }
      prevDragPosRef.current = null;
      return;
    }

    // Convert screen position (0-1) to normalized device coordinates (-1 to 1)
    // Note: MediaPipe gives us mirrored X, so we flip it
    pointer.current.x = (1 - screenPos.x) * 2 - 1;
    pointer.current.y = -(screenPos.y) * 2 + 1;

    // Update raycaster
    raycaster.current.setFromCamera(pointer.current, camera);

    // Get all node meshes for intersection test
    const meshArray = Array.from(nodeMeshes.values());

    if (meshArray.length === 0) {
      // No nodes to intersect with
      return;
    }

    // Find intersections
    const intersects = raycaster.current.intersectObjects(meshArray, true);

    // Find which node was hit (traverse up to find the registered mesh)
    let hitNodeId: string | null = null;
    let hitPoint: THREE.Vector3 | null = null;

    if (intersects.length > 0) {
      const hit = intersects[0];
      hitPoint = hit.point;

      // Find which node this mesh belongs to
      for (const [nodeId, mesh] of nodeMeshes.entries()) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj === mesh || obj.parent === mesh) {
            hitNodeId = nodeId;
            break;
          }
          obj = obj.parent;
        }
        if (hitNodeId) break;
      }
    }

    // Handle PINCH gesture (grab/drag)
    if (gesture === 'pinch') {
      if (!grabbedNodeId && hitNodeId) {
        // Start grabbing
        console.log('[HAND] Grabbing node:', hitNodeId);
        setGrabbedNode(hitNodeId);
        pushFocus(hitNodeId);
        prevDragPosRef.current = hitPoint;
      } else if (grabbedNodeId && hitPoint) {
        // Continue dragging - move node based on ray position
        const node = nodes[grabbedNodeId];
        if (node && prevDragPosRef.current) {
          // Calculate delta movement
          const delta = hitPoint.clone().sub(prevDragPosRef.current);

          // Apply movement to node position
          const newPos = {
            x: node.position.x + delta.x,
            y: Math.max(0.5, node.position.y + delta.y), // Keep above ground
            z: node.position.z + delta.z,
          };

          moveNode(grabbedNodeId, newPos);
        }
        prevDragPosRef.current = hitPoint;
      } else if (grabbedNodeId && !hitPoint) {
        // Still pinching but no intersection - project ray to a plane at node's Z
        const node = nodes[grabbedNodeId];
        if (node) {
          const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -node.position.z);
          const rayPoint = new THREE.Vector3();
          raycaster.current.ray.intersectPlane(plane, rayPoint);

          if (rayPoint && prevDragPosRef.current) {
            const delta = rayPoint.clone().sub(prevDragPosRef.current);
            const newPos = {
              x: node.position.x + delta.x * 0.5,
              y: Math.max(0.5, node.position.y + delta.y * 0.5),
              z: node.position.z,
            };
            moveNode(grabbedNodeId, newPos);
          }
          prevDragPosRef.current = rayPoint;
        }
      }
    } else {
      // Not pinching - release any grabbed node
      if (grabbedNodeId) {
        setGrabbedNode(null);
        prevDragPosRef.current = null;
      }

      // Update hover state
      if (gesture === 'point' || gesture === 'none') {
        setHoveredNode(hitNodeId);

        // Focus on hover for point gesture
        if (gesture === 'point' && hitNodeId) {
          pushFocus(hitNodeId);
        }
      }
    }

    // Handle OPEN PALM pointing at empty space = set next placement position
    if (gesture === 'open_palm' && !hitNodeId) {
      // Project a point into 3D space for the palm position
      // Use a horizontal plane at y=1.5 (typical node height) for placement
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5);
      const palmPoint = new THREE.Vector3();
      raycaster.current.ray.intersectPlane(groundPlane, palmPoint);

      if (palmPoint) {
        // Set this as the target for next node placement
        setNextPlacementPosition({
          x: palmPoint.x,
          y: 1.5, // Keep nodes at consistent height
          z: palmPoint.z,
        });
      }
    }
  });

  return null; // This component doesn't render anything
}
