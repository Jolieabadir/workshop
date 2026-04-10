'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useHandStore } from '@/store/hand-store';
import { useCanvasStore } from '@/store/canvas-store';
import type { Vec3 } from '@/core/types';

// Gesture colors for the cursor
const GESTURE_COLORS: Record<string, THREE.Color> = {
  none: new THREE.Color('#ffffff'),
  point: new THREE.Color('#00ff88'),
  pinch: new THREE.Color('#ff6b9d'),
  open_palm: new THREE.Color('#6c63ff'),
  fist: new THREE.Color('#ff9500'),
};

// Distance from camera to place cursor/dragged objects
const INTERACTION_DEPTH = 5;

export function HandCursor() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Get camera and scene for raycasting - this works because we're inside Canvas
  const { camera, scene } = useThree();

  // Raycaster for detecting node intersections
  const raycasterRef = useRef(new THREE.Raycaster());

  // Smoothed cursor position for visual smoothness
  const smoothedPos = useRef(new THREE.Vector3(0, 2, 5));

  // Previous grab position for calculating delta when moving groups
  const prevGrabPosRef = useRef<Vec3 | null>(null);

  useFrame((_, delta) => {
    if (!meshRef.current || !glowRef.current) return;

    // Get hand state from store
    const handStore = useHandStore.getState();
    const canvasStore = useCanvasStore.getState();

    const { rightHand, isTracking, grabbedNodeId, hoveredNodeId } = handStore;
    const { screenPosition, gesture, isDetected } = rightHand;

    // Hide cursor if hand not detected
    const visible = isTracking && isDetected && screenPosition !== null;
    meshRef.current.visible = visible;
    glowRef.current.visible = visible;

    if (!visible || !screenPosition) return;

    // === RAYCASTING ===
    // Convert screen position (0-1) to NDC (-1 to 1)
    // X is negated because webcam is mirrored
    const ndc = new THREE.Vector2(
      -(screenPosition.x * 2 - 1),
      -(screenPosition.y * 2 - 1)
    );

    // Set up raycaster from camera through the NDC point
    raycasterRef.current.setFromCamera(ndc, camera);

    // Find all intersections with scene objects
    const intersects = raycasterRef.current.intersectObjects(scene.children, true);

    // Find the first object with nodeId in userData (walk up parent chain)
    let hitNodeId: string | null = null;
    let hitPoint: THREE.Vector3 | null = null;

    for (const intersect of intersects) {
      // Skip the cursor meshes themselves
      if (intersect.object === meshRef.current || intersect.object === glowRef.current) {
        continue;
      }

      // Walk up parent chain looking for nodeId
      let obj: THREE.Object3D | null = intersect.object;
      while (obj) {
        if (obj.userData?.nodeId) {
          hitNodeId = obj.userData.nodeId;
          hitPoint = intersect.point;
          break;
        }
        obj = obj.parent;
      }

      if (hitNodeId) break;
    }

    // === UPDATE HOVER STATE ===
    if (hitNodeId && hitNodeId !== hoveredNodeId) {
      handStore.setHoveredNode(hitNodeId);
      canvasStore.pushFocus(hitNodeId);
    } else if (!hitNodeId && hoveredNodeId) {
      handStore.setHoveredNode(null);
    }

    // === CURSOR POSITION ===
    // Position cursor at hit point, or project along ray at default depth
    let cursorTarget: THREE.Vector3;
    if (hitPoint) {
      cursorTarget = hitPoint.clone();
    } else {
      // No hit - place cursor along ray at INTERACTION_DEPTH from camera
      cursorTarget = camera.position.clone().add(
        raycasterRef.current.ray.direction.clone().multiplyScalar(INTERACTION_DEPTH)
      );
    }

    // Smooth cursor movement
    smoothedPos.current.lerp(cursorTarget, delta * 12);
    meshRef.current.position.copy(smoothedPos.current);
    glowRef.current.position.copy(smoothedPos.current);

    // === GRAB LOGIC ===
    if (gesture === 'pinch') {
      // If pinching and hovering over a node, grab it
      if (!grabbedNodeId && hoveredNodeId) {
        handStore.setGrabbedNode(hoveredNodeId);
        canvasStore.pushFocus(hoveredNodeId);
        // Initialize previous grab position
        const worldPos = camera.position.clone().add(
          raycasterRef.current.ray.direction.clone().multiplyScalar(INTERACTION_DEPTH)
        );
        prevGrabPosRef.current = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
        console.log('[HandCursor] GRABBED:', hoveredNodeId);
      }
      // If already grabbing, move the node (or group)
      else if (grabbedNodeId) {
        // Calculate world position at INTERACTION_DEPTH along ray
        const worldPos = camera.position.clone().add(
          raycasterRef.current.ray.direction.clone().multiplyScalar(INTERACTION_DEPTH)
        );

        // Check if node belongs to a group
        const group = canvasStore.getGroupForNode(grabbedNodeId);
        if (group && prevGrabPosRef.current) {
          // Calculate delta and move entire group
          const delta = {
            x: worldPos.x - prevGrabPosRef.current.x,
            y: worldPos.y - prevGrabPosRef.current.y,
            z: worldPos.z - prevGrabPosRef.current.z,
          };
          canvasStore.moveGroup(group.id, delta);
        } else {
          // Move single node
          canvasStore.moveNode(grabbedNodeId, {
            x: worldPos.x,
            y: Math.max(0.5, worldPos.y), // Keep above ground
            z: worldPos.z,
          });
        }
        prevGrabPosRef.current = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
      }
    } else {
      // Not pinching - release any grabbed node
      if (grabbedNodeId) {
        console.log('[HandCursor] RELEASED:', grabbedNodeId);
        handStore.setGrabbedNode(null);
        prevGrabPosRef.current = null;
      }
    }

    // === CURSOR APPEARANCE ===
    const targetColor = GESTURE_COLORS[gesture] || GESTURE_COLORS.none;

    if (materialRef.current) {
      materialRef.current.color.lerp(targetColor, delta * 10);
      materialRef.current.emissive.lerp(targetColor, delta * 10);
      materialRef.current.emissiveIntensity = grabbedNodeId ? 1.5 : hitNodeId ? 1.0 : 0.6;
    }

    if (glowMaterialRef.current) {
      glowMaterialRef.current.color.lerp(targetColor, delta * 10);
      glowMaterialRef.current.opacity = grabbedNodeId ? 0.5 : hitNodeId ? 0.35 : 0.2;
    }

    // Scale cursor based on state
    const scale = grabbedNodeId ? 1.4 : hitNodeId ? 1.2 : 1.0;
    meshRef.current.scale.setScalar(scale);
    glowRef.current.scale.setScalar(scale * 2.5);
  });

  return (
    <>
      {/* Main cursor sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.08, 24, 24]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.6}
          transparent
          opacity={0.9}
          roughness={0.1}
          metalness={0.3}
        />
      </mesh>

      {/* Glow effect sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color="#ffffff"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
