/**
 * Geometry Analyzer — Exact 3D Spatial Metrics from Three.js Scene Graph
 *
 * Computes precise measurements from loaded meshes:
 * - World-space bounding boxes, centers, dimensions
 * - Gap distances and directions between connected parts
 * - Scale ratios and vertical ordering
 * - Assembly-level metrics
 *
 * These metrics are passed to Owl and Mechanic for precise corrections
 * instead of relying on image-based estimates.
 */

import * as THREE from 'three';
import type { CanvasNode, CanvasConnection, Vec3 } from '@/core/types';

// ============================================================
// Types
// ============================================================

export interface PartMetrics {
  nodeId: string;
  title: string;
  center: Vec3;
  size: Vec3;
  volume: number;
  worldBbox: {
    min: Vec3;
    max: Vec3;
  };
  worldPosition: Vec3;
  worldRotation: Vec3; // Euler angles in degrees
  worldScale: Vec3;
  meshFound: boolean;
}

export interface ConnectionMetrics {
  connectionId: string;
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
  gap: {
    distance: number;
    direction: Vec3; // Normalized direction from "from" to "to"
  };
  overlapping: boolean;
  overlapAmount: number; // How much they overlap (negative = gap)
  snapPosition: Vec3; // Where "to" should move to close the gap
  nearestFaces: {
    fromFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
    toFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
  };
}

export interface AssemblyMetrics {
  centroid: Vec3;
  totalSize: Vec3;
  totalBbox: {
    min: Vec3;
    max: Vec3;
  };
  partCount: number;
  scaleRatios: Record<string, number>; // nodeId -> volume ratio relative to largest
  verticalOrder: string[]; // nodeIds from bottom to top by center.y
  largestPartId: string;
  smallestPartId: string;
}

export interface GeometryAnalysis {
  parts: PartMetrics[];
  connections: ConnectionMetrics[];
  assembly: AssemblyMetrics;
  timestamp: number;
}

/** Auto-connection result for snapping parts together */
export interface AutoConnection {
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
  snapPosition: Vec3;
  gapVector: Vec3;
  gapDistance: number;
  facePair: {
    fromFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
    toFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
  };
  connectionType: 'vertical' | 'horizontal' | 'radial';
  role: 'anchor' | 'top' | 'bottom' | 'side';
}

// ============================================================
// Module-level Scene Reference
// ============================================================

let _threeScene: THREE.Scene | null = null;

/**
 * Register the Three.js scene for geometry analysis.
 * Called from Workshop3DCanvas when scene is ready.
 */
export function registerScene(scene: THREE.Scene): void {
  _threeScene = scene;
  console.log('[GEOMETRY] Scene registered for analysis');
}

/**
 * Unregister the scene (cleanup on unmount).
 */
export function unregisterScene(): void {
  _threeScene = null;
  console.log('[GEOMETRY] Scene unregistered');
}

/**
 * Get the registered scene.
 */
export function getScene(): THREE.Scene | null {
  return _threeScene;
}

// ============================================================
// Core Analysis Functions
// ============================================================

/**
 * Find the Three.js Object3D for a canvas node by searching the scene.
 * Nodes are identified by userData.nodeId set in IdeaNode.tsx.
 */
function findMeshForNode(scene: THREE.Scene, nodeId: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;

  scene.traverse((object) => {
    if (object.userData?.nodeId === nodeId) {
      found = object;
    }
  });

  return found;
}

/**
 * Compute bounding box metrics for a Three.js object.
 */
function computeBoundingBoxMetrics(object: THREE.Object3D): {
  center: Vec3;
  size: Vec3;
  min: Vec3;
  max: Vec3;
} {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  box.getCenter(center);
  box.getSize(size);

  return {
    center: { x: center.x, y: center.y, z: center.z },
    size: { x: size.x, y: size.y, z: size.z },
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

/**
 * Get world-space transform of an object.
 */
function getWorldTransform(object: THREE.Object3D): {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
} {
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  object.getWorldPosition(worldPos);
  object.getWorldQuaternion(worldQuat);
  object.getWorldScale(worldScale);

  // Convert quaternion to Euler angles in degrees
  const euler = new THREE.Euler().setFromQuaternion(worldQuat);

  return {
    position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
    rotation: {
      x: THREE.MathUtils.radToDeg(euler.x),
      y: THREE.MathUtils.radToDeg(euler.y),
      z: THREE.MathUtils.radToDeg(euler.z),
    },
    scale: { x: worldScale.x, y: worldScale.y, z: worldScale.z },
  };
}

/**
 * Determine which face of a bounding box is nearest to a point.
 */
function getNearestFace(
  bbox: { min: Vec3; max: Vec3 },
  center: Vec3,
  point: Vec3
): 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' {
  const distances = {
    top: Math.abs(point.y - bbox.max.y),
    bottom: Math.abs(point.y - bbox.min.y),
    left: Math.abs(point.x - bbox.min.x),
    right: Math.abs(point.x - bbox.max.x),
    front: Math.abs(point.z - bbox.max.z),
    back: Math.abs(point.z - bbox.min.z),
  };

  let nearest: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' = 'top';
  let minDist = Infinity;

  for (const [face, dist] of Object.entries(distances)) {
    if (dist < minDist) {
      minDist = dist;
      nearest = face as typeof nearest;
    }
  }

  return nearest;
}

/**
 * Compute the gap/overlap between two bounding boxes.
 */
function computeGapMetrics(
  boxA: { min: Vec3; max: Vec3; center: Vec3 },
  boxB: { min: Vec3; max: Vec3; center: Vec3 }
): {
  distance: number;
  direction: Vec3;
  overlapping: boolean;
  overlapAmount: number;
  snapPosition: Vec3;
  nearestFaces: { fromFace: string; toFace: string };
} {
  // Compute overlap/gap on each axis
  const overlapX = Math.min(boxA.max.x, boxB.max.x) - Math.max(boxA.min.x, boxB.min.x);
  const overlapY = Math.min(boxA.max.y, boxB.max.y) - Math.max(boxA.min.y, boxB.min.y);
  const overlapZ = Math.min(boxA.max.z, boxB.max.z) - Math.max(boxA.min.z, boxB.min.z);

  const overlapping = overlapX > 0 && overlapY > 0 && overlapZ > 0;

  // Direction from A center to B center
  const dx = boxB.center.x - boxA.center.x;
  const dy = boxB.center.y - boxA.center.y;
  const dz = boxB.center.z - boxA.center.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const direction: Vec3 = dist > 0.001
    ? { x: dx / dist, y: dy / dist, z: dz / dist }
    : { x: 0, y: 1, z: 0 };

  // Compute actual gap distance (minimum distance between surfaces)
  let gapDistance = 0;
  if (!overlapping) {
    // Find the axis with the smallest negative overlap (largest gap)
    const gaps = [
      overlapX < 0 ? -overlapX : 0,
      overlapY < 0 ? -overlapY : 0,
      overlapZ < 0 ? -overlapZ : 0,
    ];
    gapDistance = Math.max(...gaps);
  }

  // Compute overlap amount (how much they interpenetrate)
  const overlapAmount = overlapping ? Math.min(overlapX, overlapY, overlapZ) : -gapDistance;

  // Compute snap position: where B should be to just touch A
  // Move B along the direction vector by the gap distance
  const snapPosition: Vec3 = {
    x: boxB.center.x - direction.x * gapDistance,
    y: boxB.center.y - direction.y * gapDistance,
    z: boxB.center.z - direction.z * gapDistance,
  };

  // Determine nearest faces
  const fromFace = getNearestFace(boxA, boxA.center, boxB.center);
  const toFace = getNearestFace(boxB, boxB.center, boxA.center);

  return {
    distance: gapDistance,
    direction,
    overlapping,
    overlapAmount,
    snapPosition,
    nearestFaces: { fromFace, toFace },
  };
}

// ============================================================
// Main Analysis Function
// ============================================================

/**
 * Analyze the geometry of all nodes in the scene.
 */
export function analyzeGeometry(
  nodes: Record<string, CanvasNode>,
  connections: Record<string, CanvasConnection>
): GeometryAnalysis | null {
  const scene = _threeScene;
  if (!scene) {
    console.warn('[GEOMETRY] Scene not registered, cannot analyze');
    return null;
  }

  const nodeList = Object.values(nodes);
  const connList = Object.values(connections);

  if (nodeList.length === 0) {
    return {
      parts: [],
      connections: [],
      assembly: {
        centroid: { x: 0, y: 0, z: 0 },
        totalSize: { x: 0, y: 0, z: 0 },
        totalBbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
        partCount: 0,
        scaleRatios: {},
        verticalOrder: [],
        largestPartId: '',
        smallestPartId: '',
      },
      timestamp: Date.now(),
    };
  }

  // Analyze each part
  const parts: PartMetrics[] = [];
  const partBboxes: Map<string, { min: Vec3; max: Vec3; center: Vec3; size: Vec3 }> = new Map();

  for (const node of nodeList) {
    const mesh = findMeshForNode(scene, node.id);

    if (mesh) {
      const bboxMetrics = computeBoundingBoxMetrics(mesh);
      const transform = getWorldTransform(mesh);
      const volume = bboxMetrics.size.x * bboxMetrics.size.y * bboxMetrics.size.z;

      parts.push({
        nodeId: node.id,
        title: node.title || node.content.slice(0, 30),
        center: bboxMetrics.center,
        size: bboxMetrics.size,
        volume,
        worldBbox: { min: bboxMetrics.min, max: bboxMetrics.max },
        worldPosition: transform.position,
        worldRotation: transform.rotation,
        worldScale: transform.scale,
        meshFound: true,
      });

      partBboxes.set(node.id, {
        min: bboxMetrics.min,
        max: bboxMetrics.max,
        center: bboxMetrics.center,
        size: bboxMetrics.size,
      });
    } else {
      // Mesh not found (still loading or not a 3D node)
      // Use node position as fallback
      parts.push({
        nodeId: node.id,
        title: node.title || node.content.slice(0, 30),
        center: node.position,
        size: { x: 1, y: 1, z: 1 },
        volume: 1,
        worldBbox: {
          min: { x: node.position.x - 0.5, y: node.position.y - 0.5, z: node.position.z - 0.5 },
          max: { x: node.position.x + 0.5, y: node.position.y + 0.5, z: node.position.z + 0.5 },
        },
        worldPosition: node.position,
        worldRotation: { x: 0, y: 0, z: 0 },
        worldScale: { x: 1, y: 1, z: 1 },
        meshFound: false,
      });

      partBboxes.set(node.id, {
        min: { x: node.position.x - 0.5, y: node.position.y - 0.5, z: node.position.z - 0.5 },
        max: { x: node.position.x + 0.5, y: node.position.y + 0.5, z: node.position.z + 0.5 },
        center: node.position,
        size: { x: 1, y: 1, z: 1 },
      });
    }
  }

  // Analyze connections
  const connectionMetrics: ConnectionMetrics[] = [];

  for (const conn of connList) {
    const boxA = partBboxes.get(conn.fromId);
    const boxB = partBboxes.get(conn.toId);

    if (boxA && boxB) {
      const nodeA = nodes[conn.fromId];
      const nodeB = nodes[conn.toId];
      const gapMetrics = computeGapMetrics(boxA, boxB);

      connectionMetrics.push({
        connectionId: conn.id,
        fromId: conn.fromId,
        toId: conn.toId,
        fromTitle: nodeA?.title || conn.fromId,
        toTitle: nodeB?.title || conn.toId,
        gap: {
          distance: Math.round(gapMetrics.distance * 1000) / 1000,
          direction: {
            x: Math.round(gapMetrics.direction.x * 100) / 100,
            y: Math.round(gapMetrics.direction.y * 100) / 100,
            z: Math.round(gapMetrics.direction.z * 100) / 100,
          },
        },
        overlapping: gapMetrics.overlapping,
        overlapAmount: Math.round(gapMetrics.overlapAmount * 1000) / 1000,
        snapPosition: {
          x: Math.round(gapMetrics.snapPosition.x * 1000) / 1000,
          y: Math.round(gapMetrics.snapPosition.y * 1000) / 1000,
          z: Math.round(gapMetrics.snapPosition.z * 1000) / 1000,
        },
        nearestFaces: gapMetrics.nearestFaces as ConnectionMetrics['nearestFaces'],
      });
    }
  }

  // Compute assembly metrics
  const totalBbox = new THREE.Box3();
  for (const part of parts) {
    totalBbox.expandByPoint(new THREE.Vector3(part.worldBbox.min.x, part.worldBbox.min.y, part.worldBbox.min.z));
    totalBbox.expandByPoint(new THREE.Vector3(part.worldBbox.max.x, part.worldBbox.max.y, part.worldBbox.max.z));
  }

  const totalCenter = new THREE.Vector3();
  const totalSize = new THREE.Vector3();
  totalBbox.getCenter(totalCenter);
  totalBbox.getSize(totalSize);

  // Scale ratios relative to largest part
  const maxVolume = Math.max(...parts.map((p) => p.volume), 0.001);
  const minVolume = Math.min(...parts.map((p) => p.volume), maxVolume);
  const scaleRatios: Record<string, number> = {};

  let largestPartId = '';
  let smallestPartId = '';

  for (const part of parts) {
    scaleRatios[part.nodeId] = Math.round((part.volume / maxVolume) * 1000) / 1000;
    if (part.volume === maxVolume) largestPartId = part.nodeId;
    if (part.volume === minVolume) smallestPartId = part.nodeId;
  }

  // Vertical ordering (bottom to top)
  const verticalOrder = [...parts]
    .sort((a, b) => a.center.y - b.center.y)
    .map((p) => p.nodeId);

  return {
    parts,
    connections: connectionMetrics,
    assembly: {
      centroid: { x: totalCenter.x, y: totalCenter.y, z: totalCenter.z },
      totalSize: { x: totalSize.x, y: totalSize.y, z: totalSize.z },
      totalBbox: {
        min: { x: totalBbox.min.x, y: totalBbox.min.y, z: totalBbox.min.z },
        max: { x: totalBbox.max.x, y: totalBbox.max.y, z: totalBbox.max.z },
      },
      partCount: parts.length,
      scaleRatios,
      verticalOrder,
      largestPartId,
      smallestPartId,
    },
    timestamp: Date.now(),
  };
}

/**
 * Format geometry analysis for LLM prompt.
 */
export function formatGeometryForPrompt(analysis: GeometryAnalysis): string {
  const lines: string[] = [
    '## Exact 3D Geometry Measurements (from Three.js scene graph)',
    '',
    'These are PRECISE measurements — use them for corrections instead of guessing from images.',
    '',
  ];

  // Parts
  lines.push('### Parts:');
  for (const part of analysis.parts) {
    lines.push(`- **${part.title}** (${part.nodeId})`);
    lines.push(`  Position: (${part.center.x.toFixed(2)}, ${part.center.y.toFixed(2)}, ${part.center.z.toFixed(2)})`);
    lines.push(`  Size: ${part.size.x.toFixed(2)} × ${part.size.y.toFixed(2)} × ${part.size.z.toFixed(2)}`);
    lines.push(`  Rotation: (${part.worldRotation.x.toFixed(1)}°, ${part.worldRotation.y.toFixed(1)}°, ${part.worldRotation.z.toFixed(1)}°)`);
    if (!part.meshFound) {
      lines.push(`  ⚠️ Mesh not loaded yet — measurements are estimates`);
    }
  }
  lines.push('');

  // Connections and gaps
  if (analysis.connections.length > 0) {
    lines.push('### Connection Gaps:');
    for (const conn of analysis.connections) {
      lines.push(`- **${conn.fromTitle}** ↔ **${conn.toTitle}**`);
      if (conn.overlapping) {
        lines.push(`  ✓ Overlapping (interpenetration: ${Math.abs(conn.overlapAmount).toFixed(3)} units)`);
      } else if (conn.gap.distance < 0.01) {
        lines.push(`  ✓ Touching (gap: ${conn.gap.distance.toFixed(3)} units)`);
      } else {
        lines.push(`  ✗ GAP: ${conn.gap.distance.toFixed(3)} units`);
        lines.push(`    Direction: (${conn.gap.direction.x}, ${conn.gap.direction.y}, ${conn.gap.direction.z})`);
        lines.push(`    To close gap, move ${conn.toTitle} to: (${conn.snapPosition.x.toFixed(2)}, ${conn.snapPosition.y.toFixed(2)}, ${conn.snapPosition.z.toFixed(2)})`);
      }
    }
    lines.push('');
  }

  // Assembly summary
  lines.push('### Assembly Summary:');
  lines.push(`- Centroid: (${analysis.assembly.centroid.x.toFixed(2)}, ${analysis.assembly.centroid.y.toFixed(2)}, ${analysis.assembly.centroid.z.toFixed(2)})`);
  lines.push(`- Total size: ${analysis.assembly.totalSize.x.toFixed(2)} × ${analysis.assembly.totalSize.y.toFixed(2)} × ${analysis.assembly.totalSize.z.toFixed(2)}`);
  lines.push(`- Vertical order (bottom to top): ${analysis.assembly.verticalOrder.join(' → ')}`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// Auto-Connection System
// ============================================================

/** Opposing face pairs for connection detection */
const OPPOSING_FACES: Record<string, string> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
  front: 'back',
  back: 'front',
};

/** Part role hints based on common naming patterns */
const ROLE_PATTERNS = {
  anchor: /fuselage|body|main|hull|chassis|frame|base|core/i,
  top: /nose|cone|tip|cap|top|head|cockpit|canopy/i,
  bottom: /engine|nozzle|thruster|exhaust|motor|booster|bell/i,
  side: /fin|wing|rudder|stabilizer|aileron|flap|tail/i,
};

/**
 * Infer the role of a part based on its name and geometry.
 */
function inferPartRole(
  title: string,
  volume: number,
  maxVolume: number,
  aspectRatio: { heightToWidth: number; heightToDepth: number }
): 'anchor' | 'top' | 'bottom' | 'side' | 'unknown' {
  const normalizedTitle = title.toLowerCase();

  // Check name patterns first
  if (ROLE_PATTERNS.anchor.test(normalizedTitle)) return 'anchor';
  if (ROLE_PATTERNS.top.test(normalizedTitle)) return 'top';
  if (ROLE_PATTERNS.bottom.test(normalizedTitle)) return 'bottom';
  if (ROLE_PATTERNS.side.test(normalizedTitle)) return 'side';

  // Infer from geometry
  const volumeRatio = volume / maxVolume;

  // Largest part is likely the anchor/fuselage
  if (volumeRatio > 0.5) return 'anchor';

  // Tall and thin = likely top or bottom attachment
  if (aspectRatio.heightToWidth > 1.5 && volumeRatio < 0.3) {
    return 'top'; // Could be nose cone or engine
  }

  // Flat/wide = likely side attachment (fins)
  if (aspectRatio.heightToWidth < 0.5 && aspectRatio.heightToDepth < 0.5) {
    return 'side';
  }

  return 'unknown';
}

/**
 * Get the center point of a specific face of a bounding box.
 */
function getFaceCenter(
  bbox: { min: Vec3; max: Vec3 },
  face: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'
): Vec3 {
  const center = {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
    z: (bbox.min.z + bbox.max.z) / 2,
  };

  switch (face) {
    case 'top':
      return { x: center.x, y: bbox.max.y, z: center.z };
    case 'bottom':
      return { x: center.x, y: bbox.min.y, z: center.z };
    case 'left':
      return { x: bbox.min.x, y: center.y, z: center.z };
    case 'right':
      return { x: bbox.max.x, y: center.y, z: center.z };
    case 'front':
      return { x: center.x, y: center.y, z: bbox.max.z };
    case 'back':
      return { x: center.x, y: center.y, z: bbox.min.z };
  }
}

/**
 * Compute the distance between two face centers.
 */
function facePairDistance(
  bboxA: { min: Vec3; max: Vec3 },
  faceA: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back',
  bboxB: { min: Vec3; max: Vec3 },
  faceB: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'
): { distance: number; gapVector: Vec3 } {
  const centerA = getFaceCenter(bboxA, faceA);
  const centerB = getFaceCenter(bboxB, faceB);

  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const dz = centerB.z - centerA.z;

  return {
    distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
    gapVector: { x: dx, y: dy, z: dz },
  };
}

/**
 * Find the best opposing face pair between two bounding boxes.
 */
function findBestFacePair(
  bboxA: { min: Vec3; max: Vec3 },
  bboxB: { min: Vec3; max: Vec3 }
): {
  fromFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
  toFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
  distance: number;
  gapVector: Vec3;
} {
  const faces: Array<'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'> = [
    'top', 'bottom', 'left', 'right', 'front', 'back',
  ];

  let bestPair = {
    fromFace: 'top' as const,
    toFace: 'bottom' as const,
    distance: Infinity,
    gapVector: { x: 0, y: 0, z: 0 },
  };

  // Check all opposing face pairs
  for (const faceA of faces) {
    const opposingFace = OPPOSING_FACES[faceA] as typeof faceA;
    const { distance, gapVector } = facePairDistance(bboxA, faceA, bboxB, opposingFace);

    if (distance < bestPair.distance) {
      bestPair = {
        fromFace: faceA,
        toFace: opposingFace,
        distance,
        gapVector,
      };
    }
  }

  return bestPair;
}

/**
 * Compute the snap position to move partB so its face touches partA's face.
 */
function computeSnapPosition(
  bboxA: { min: Vec3; max: Vec3 },
  bboxB: { min: Vec3; max: Vec3 },
  fromFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back',
  toFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back',
  currentCenterB: Vec3
): Vec3 {
  const targetFaceCenter = getFaceCenter(bboxA, fromFace);
  const currentToFaceCenter = getFaceCenter(bboxB, toFace);

  // Calculate the offset needed to align the faces
  const offset = {
    x: targetFaceCenter.x - currentToFaceCenter.x,
    y: targetFaceCenter.y - currentToFaceCenter.y,
    z: targetFaceCenter.z - currentToFaceCenter.z,
  };

  // Apply offset to current center
  return {
    x: currentCenterB.x + offset.x,
    y: currentCenterB.y + offset.y,
    z: currentCenterB.z + offset.z,
  };
}

/**
 * Compute auto-connections between all loaded mesh nodes based on bounding box proximity.
 *
 * For vertical assemblies (rockets, towers, etc.):
 * - Finds the largest part as the anchor (fuselage)
 * - Stacks parts above/below based on their names/types
 * - Nose cone goes on top, engine on bottom, fins on sides
 */
export function computeAutoConnections(
  nodes: Record<string, CanvasNode>,
  existingConnections: Record<string, CanvasConnection>,
  proximityThreshold: number = 2.0
): AutoConnection[] {
  const scene = _threeScene;
  if (!scene) {
    console.warn('[AUTO-CONNECT] Scene not registered');
    return [];
  }

  const nodeList = Object.values(nodes);
  if (nodeList.length < 2) {
    return []; // Need at least 2 parts to connect
  }

  // Gather bounding box data for all nodes with loaded meshes
  interface PartData {
    nodeId: string;
    title: string;
    bbox: { min: Vec3; max: Vec3 };
    center: Vec3;
    size: Vec3;
    volume: number;
    meshFound: boolean;
  }

  const parts: PartData[] = [];

  for (const node of nodeList) {
    // Skip if already has connections
    const hasConnection = Object.values(existingConnections).some(
      (c) => c.fromId === node.id || c.toId === node.id
    );

    const mesh = findMeshForNode(scene, node.id);

    if (mesh) {
      const bboxMetrics = computeBoundingBoxMetrics(mesh);
      const volume = bboxMetrics.size.x * bboxMetrics.size.y * bboxMetrics.size.z;

      parts.push({
        nodeId: node.id,
        title: node.title || node.content.slice(0, 30),
        bbox: { min: bboxMetrics.min, max: bboxMetrics.max },
        center: bboxMetrics.center,
        size: bboxMetrics.size,
        volume,
        meshFound: true,
      });
    } else if (node.meshLoading) {
      // Mesh is still loading, skip for now
      console.log(`[AUTO-CONNECT] Skipping ${node.title || node.id} — mesh still loading`);
    }
  }

  if (parts.length < 2) {
    console.log('[AUTO-CONNECT] Not enough loaded meshes to connect');
    return [];
  }

  // Find the largest part (anchor/fuselage)
  const maxVolume = Math.max(...parts.map((p) => p.volume));
  const anchorPart = parts.find((p) => p.volume === maxVolume);

  if (!anchorPart) {
    return [];
  }

  // Classify parts by role
  const partRoles = new Map<string, 'anchor' | 'top' | 'bottom' | 'side' | 'unknown'>();

  for (const part of parts) {
    const aspectRatio = {
      heightToWidth: part.size.y / Math.max(part.size.x, 0.01),
      heightToDepth: part.size.y / Math.max(part.size.z, 0.01),
    };
    const role = inferPartRole(part.title, part.volume, maxVolume, aspectRatio);
    partRoles.set(part.nodeId, role);
  }

  // Build connections
  const connections: AutoConnection[] = [];
  const connectedParts = new Set<string>();

  // First, connect non-anchor parts to the anchor
  for (const part of parts) {
    if (part.nodeId === anchorPart.nodeId) continue;

    const role = partRoles.get(part.nodeId) || 'unknown';
    const facePair = findBestFacePair(anchorPart.bbox, part.bbox);

    if (facePair.distance <= proximityThreshold) {
      const snapPosition = computeSnapPosition(
        anchorPart.bbox,
        part.bbox,
        facePair.fromFace,
        facePair.toFace,
        part.center
      );

      // Determine connection type
      let connectionType: 'vertical' | 'horizontal' | 'radial' = 'horizontal';
      if (facePair.fromFace === 'top' || facePair.fromFace === 'bottom') {
        connectionType = 'vertical';
      } else if (role === 'side') {
        connectionType = 'radial';
      }

      connections.push({
        fromId: anchorPart.nodeId,
        toId: part.nodeId,
        fromTitle: anchorPart.title,
        toTitle: part.title,
        snapPosition,
        gapVector: facePair.gapVector,
        gapDistance: facePair.distance,
        facePair: {
          fromFace: facePair.fromFace,
          toFace: facePair.toFace,
        },
        connectionType,
        role,
      });

      connectedParts.add(part.nodeId);
    }
  }

  // For parts not connected to anchor, check proximity to any other part
  for (const partA of parts) {
    if (connectedParts.has(partA.nodeId) || partA.nodeId === anchorPart.nodeId) continue;

    for (const partB of parts) {
      if (partA.nodeId === partB.nodeId) continue;
      if (!connectedParts.has(partB.nodeId) && partB.nodeId !== anchorPart.nodeId) continue;

      const facePair = findBestFacePair(partB.bbox, partA.bbox);

      if (facePair.distance <= proximityThreshold) {
        const snapPosition = computeSnapPosition(
          partB.bbox,
          partA.bbox,
          facePair.fromFace,
          facePair.toFace,
          partA.center
        );

        const role = partRoles.get(partA.nodeId) || 'unknown';
        let connectionType: 'vertical' | 'horizontal' | 'radial' = 'horizontal';
        if (facePair.fromFace === 'top' || facePair.fromFace === 'bottom') {
          connectionType = 'vertical';
        }

        connections.push({
          fromId: partB.nodeId,
          toId: partA.nodeId,
          fromTitle: partB.title,
          toTitle: partA.title,
          snapPosition,
          gapVector: facePair.gapVector,
          gapDistance: facePair.distance,
          facePair: {
            fromFace: facePair.fromFace,
            toFace: facePair.toFace,
          },
          connectionType,
          role,
        });

        connectedParts.add(partA.nodeId);
        break; // Found a connection for this part
      }
    }
  }

  // Sort connections: anchor connections first, then by role priority
  const rolePriority: Record<string, number> = {
    anchor: 0,
    bottom: 1,
    top: 2,
    side: 3,
    unknown: 4,
  };

  connections.sort((a, b) => {
    const priorityA = rolePriority[a.role] ?? 4;
    const priorityB = rolePriority[b.role] ?? 4;
    return priorityA - priorityB;
  });

  return connections;
}

/**
 * Check if all mesh nodes have finished loading.
 */
export function allMeshesLoaded(nodes: Record<string, CanvasNode>): boolean {
  const meshNodes = Object.values(nodes).filter((n) => n.meshUrl || n.meshLoading);

  if (meshNodes.length === 0) return true;

  return meshNodes.every((node) => {
    if (node.meshLoading) return false;
    if (!node.meshUrl) return true;

    // Check if mesh is actually in the scene
    const scene = _threeScene;
    if (!scene) return false;

    const mesh = findMeshForNode(scene, node.id);
    return mesh !== null;
  });
}
