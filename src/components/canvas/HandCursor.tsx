'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useHandStore } from '@/store/hand-store';
import { useCanvasStore } from '@/store/canvas-store';

// Gesture colors for the cursor
const GESTURE_COLORS: Record<string, THREE.Color> = {
  none: new THREE.Color('#ffffff'),
  point: new THREE.Color('#00ff88'),
  pinch: new THREE.Color('#ff6b9d'),
  open_palm: new THREE.Color('#6c63ff'),
  fist: new THREE.Color('#ff9500'),
};

export function HandCursor() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Get camera and scene for raycasting
  const { camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());

  // Use right hand for cursor (interaction hand)
  const rightHand = useHandStore((s) => s.rightHand);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);
  const isTracking = useHandStore((s) => s.isTracking);

  const position = rightHand.position;
  const screenPosition = rightHand.screenPosition;
  const gesture = rightHand.gesture;
  const isDetected = rightHand.isDetected;

  // Smoothed position for lerping
  const smoothedPos = useRef(new THREE.Vector3(0, 2, 2));
  const targetPos = useRef(new THREE.Vector3(0, 2, 2));

  useFrame((_, delta) => {
    if (!meshRef.current || !glowRef.current) return;

    // Update target position
    if (position) {
      targetPos.current.set(position.x, position.y, position.z);
    }

    // Smooth lerp to target
    smoothedPos.current.lerp(targetPos.current, delta * 12);
    meshRef.current.position.copy(smoothedPos.current);
    glowRef.current.position.copy(smoothedPos.current);

    // Update color based on gesture
    const targetColor = GESTURE_COLORS[gesture] || GESTURE_COLORS.none;

    if (materialRef.current) {
      materialRef.current.color.lerp(targetColor, delta * 8);
      materialRef.current.emissive.lerp(targetColor, delta * 8);

      // Pulse intensity when grabbing
      const baseIntensity = grabbedNodeId ? 1.2 : 0.6;
      const pulse = Math.sin(Date.now() * 0.008) * 0.2;
      materialRef.current.emissiveIntensity = baseIntensity + (grabbedNodeId ? pulse : 0);
    }

    if (glowMaterialRef.current) {
      glowMaterialRef.current.color.lerp(targetColor, delta * 8);

      // Pulsing opacity
      const basOpacity = gesture === 'pinch' ? 0.4 : 0.2;
      const pulse = Math.sin(Date.now() * 0.006) * 0.1;
      glowMaterialRef.current.opacity = basOpacity + pulse;
    }

    // Scale based on gesture
    const targetScale = gesture === 'pinch' ? 1.3 : gesture === 'open_palm' ? 1.5 : 1;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 10);

    // Glow scale follows with larger multiplier
    const glowScale = targetScale * 2.5;
    glowRef.current.scale.lerp(new THREE.Vector3(glowScale, glowScale, glowScale), delta * 8);

    // Hide if right hand not detected or no position
    const visible = isTracking && isDetected && position !== null;
    meshRef.current.visible = visible;
    glowRef.current.visible = visible;

    // --- Raycasting for node interaction ---
    if (!isDetected || !screenPosition) return;

    // Convert screen position (0-1) to normalized device coordinates (-1 to 1)
    // Formula: x * 2 - 1 maps [0,1] to [-1,1]
    // Y is inverted because screen Y increases downward, NDC Y increases upward
    const ndc = new THREE.Vector2(
      screenPosition.x * 2 - 1,
      -(screenPosition.y * 2 - 1)
    );

    // Update raycaster from camera
    raycaster.current.setFromCamera(ndc, camera);

    // Intersect all scene objects recursively
    const intersects = raycaster.current.intersectObjects(scene.children, true);

    // Find first object with nodeId in userData
    let hitNodeId: string | null = null;
    for (const hit of intersects) {
      // Check hit object and its ancestors for nodeId
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData?.nodeId) {
          hitNodeId = obj.userData.nodeId;
          break;
        }
        obj = obj.parent;
      }
      if (hitNodeId) break;
    }

    // Get current state
    const handStore = useHandStore.getState();
    const canvasStore = useCanvasStore.getState();
    const currentGrabbedId = handStore.grabbedNodeId;
    const currentHoveredId = handStore.hoveredNodeId;

    // Update hover state
    if (hitNodeId && hitNodeId !== currentHoveredId) {
      canvasStore.pushFocus(hitNodeId);
      handStore.setHoveredNode(hitNodeId);
    } else if (!hitNodeId && currentHoveredId) {
      handStore.setHoveredNode(null);
    }

    // Handle PINCH gesture for grab/move
    if (gesture === 'pinch') {
      if (!currentGrabbedId && hitNodeId) {
        // Start grabbing the hovered node
        console.log('[HandCursor] Grabbing node:', hitNodeId);
        handStore.setGrabbedNode(hitNodeId);
        canvasStore.pushFocus(hitNodeId);
      } else if (currentGrabbedId && position) {
        // Move the grabbed node to cursor position
        canvasStore.moveNode(currentGrabbedId, {
          x: position.x,
          y: Math.max(0.5, position.y), // Keep above ground
          z: position.z,
        });
      }
    } else {
      // Not pinching - release any grabbed node
      if (currentGrabbedId) {
        console.log('[HandCursor] Releasing node:', currentGrabbedId);
        handStore.setGrabbedNode(null);
      }
    }
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
