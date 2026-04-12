'use client';

/**
 * SceneCapture — Captures rendered frames from the Three.js canvas on demand
 *
 * This is an invisible component that hooks into the Three.js render context.
 * Add it as a child of <Canvas> in Workshop3DCanvas.tsx:
 *
 *   <Canvas>
 *     <SceneContent />
 *     <SceneCapture />
 *   </Canvas>
 *
 * To capture frames from outside the component:
 *
 *   import { getCaptureFrames } from '@/components/canvas/SceneCapture';
 *
 *   const capture = getCaptureFrames();
 *   if (capture) {
 *     const frames = await capture();
 *     // frames = [{ name: 'front', image: 'data:image/png;base64,...' }, ...]
 *   }
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCanvasStore } from '@/store/canvas-store';

export interface CapturedFrame {
  name: string;
  image: string; // base64 PNG data URL
}

// Module-level capture function that gets set when SceneCapture mounts
let _captureFrames: (() => Promise<CapturedFrame[]>) | null = null;

/**
 * Get the capture function if SceneCapture is mounted.
 * Returns null if the component isn't mounted or the Canvas isn't ready.
 */
export function getCaptureFrames(): (() => Promise<CapturedFrame[]>) | null {
  return _captureFrames;
}

/**
 * View configuration for multi-angle capture
 */
interface ViewConfig {
  name: string;
  getPosition: (centroid: THREE.Vector3) => THREE.Vector3;
}

const CAPTURE_VIEWS: ViewConfig[] = [
  {
    name: 'front',
    getPosition: (centroid) => new THREE.Vector3(centroid.x, centroid.y + 1.5, centroid.z + 6),
  },
  {
    name: 'side',
    getPosition: (centroid) => new THREE.Vector3(centroid.x + 6, centroid.y + 1.5, centroid.z),
  },
  {
    name: 'top',
    getPosition: (centroid) => new THREE.Vector3(centroid.x, centroid.y + 6, centroid.z),
  },
];

/**
 * Compute the centroid (center of mass) of all nodes in the scene
 * Reads nodes from store at call time, not at registration time
 */
function computeCentroid(): THREE.Vector3 {
  const nodes = useCanvasStore.getState().nodes;
  const nodeList = Object.values(nodes);

  if (nodeList.length === 0) {
    return new THREE.Vector3(0, 1.5, 0);
  }

  // Compute bounding box of all nodes
  const bbox = new THREE.Box3();
  for (const node of nodeList) {
    const pos = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
    bbox.expandByPoint(pos);
  }

  // Return center of bounding box
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  return center;
}

export function SceneCapture() {
  const { gl, scene, camera } = useThree();

  // Register the capture function when component mounts
  // Only depends on gl, scene, camera — reads nodes at capture time
  useEffect(() => {
    _captureFrames = async (): Promise<CapturedFrame[]> => {
      const startTime = performance.now();

      // Compute assembly centroid (reads current nodes from store)
      const centroid = computeCentroid();

      // Store original render state
      const originalClearColor = gl.getClearColor(new THREE.Color());
      const originalClearAlpha = gl.getClearAlpha();

      // Capture each view
      const frames: CapturedFrame[] = [];
      for (const viewConfig of CAPTURE_VIEWS) {
        // Create a temporary camera for capture (don't disturb user's view)
        const captureCamera = new THREE.PerspectiveCamera(
          60, // fov
          gl.domElement.width / gl.domElement.height, // aspect
          0.1, // near
          1000 // far
        );

        // Position camera according to view config
        const position = viewConfig.getPosition(centroid);
        captureCamera.position.copy(position);
        captureCamera.lookAt(centroid);
        captureCamera.updateProjectionMatrix();

        // Render the scene from this camera's perspective
        gl.render(scene, captureCamera);

        // Capture the frame as base64 PNG
        const dataUrl = gl.domElement.toDataURL('image/png');

        frames.push({
          name: viewConfig.name,
          image: dataUrl,
        });
      }

      // Restore original render state and re-render from user's camera
      gl.setClearColor(originalClearColor, originalClearAlpha);
      gl.render(scene, camera);

      const elapsed = (performance.now() - startTime).toFixed(1);
      console.log(`[SCENE CAPTURE] Captured ${frames.length} views in ${elapsed}ms`);

      return frames;
    };

    console.log('[SCENE CAPTURE] Capture function registered');

    return () => {
      _captureFrames = null;
      console.log('[SCENE CAPTURE] Capture function unregistered');
    };
  }, [gl, scene, camera]);

  // This component renders nothing — it's purely a hook into the render context
  return null;
}

export default SceneCapture;
