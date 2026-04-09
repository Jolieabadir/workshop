'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useHandStore } from '@/store/hand-store';
import { useCanvasStore } from '@/store/canvas-store';

// Scale constraints for resize gesture
const MIN_SCALE = 0.3;
const MAX_SCALE = 3.0;

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
  const { camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());

  // Previous position for delta calculation during drag
  const prevDragPosRef = useRef<THREE.Vector3 | null>(null);

  // Resize gesture state
  const resizeAnchorDistanceRef = useRef<number | null>(null);
  const resizeTargetNodeIdRef = useRef<string | null>(null);
  const resizeInitialScaleRef = useRef<number>(1);

  // Hand store state
  const rightHand = useHandStore((s) => s.rightHand);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);
  const setGrabbedNode = useHandStore((s) => s.setGrabbedNode);
  const setHoveredNode = useHandStore((s) => s.setHoveredNode);

  // Canvas store actions
  const nodes = useCanvasStore((s) => s.nodes);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const pushFocus = useCanvasStore((s) => s.pushFocus);
  const focusStack = useCanvasStore((s) => s.focusStack);

  const screenPos = rightHand.screenPosition;
  const gesture = rightHand.gesture;
  const isDetected = rightHand.isDetected;

  // Get thumb-to-middle distance for resize gesture (passed via pinchDistance field)
  const pinchDistance = rightHand.pinchDistance;

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

    // Handle gestures
    if (gesture === 'pinch') {
      // PINCH: grab and drag nodes
      // Clear resize state when switching to pinch
      resizeAnchorDistanceRef.current = null;
      resizeTargetNodeIdRef.current = null;

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
          const delta = hitPoint.clone().sub(prevDragPosRef.current);
          const newPos = {
            x: node.position.x + delta.x,
            y: Math.max(0.5, node.position.y + delta.y),
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
    } else if (gesture === 'resize') {
      // RESIZE: scale node based on finger aperture
      // Release any grabbed node when switching to resize
      if (grabbedNodeId) {
        setGrabbedNode(null);
        prevDragPosRef.current = null;
      }

      // Determine target node: hovered node or top of focus stack
      const targetNodeId = hitNodeId || focusStack[0];

      if (targetNodeId && pinchDistance > 0) {
        const node = nodes[targetNodeId];
        if (node) {
          // Initialize resize anchor on first frame of resize gesture
          if (resizeAnchorDistanceRef.current === null || resizeTargetNodeIdRef.current !== targetNodeId) {
            resizeAnchorDistanceRef.current = pinchDistance;
            resizeTargetNodeIdRef.current = targetNodeId;
            resizeInitialScaleRef.current = node.scale?.x ?? 1;
            pushFocus(targetNodeId);
          }

          // Calculate scale multiplier based on aperture change
          const scaleMultiplier = pinchDistance / resizeAnchorDistanceRef.current;
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, resizeInitialScaleRef.current * scaleMultiplier));

          // Apply uniform scale to node
          updateNode(targetNodeId, {
            scale: { x: newScale, y: newScale, z: newScale },
          });
        }
      }

      // Update hover state during resize
      setHoveredNode(hitNodeId);
    } else {
      // NONE: passive hover - just raycast and update hovered node
      // Clear all active states
      if (grabbedNodeId) {
        setGrabbedNode(null);
        prevDragPosRef.current = null;
      }
      resizeAnchorDistanceRef.current = null;
      resizeTargetNodeIdRef.current = null;

      // Update hover state
      setHoveredNode(hitNodeId);
    }
  });

  return null; // This component doesn't render anything
}
