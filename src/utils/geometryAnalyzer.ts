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
 * Compute auto-connections between all loaded mesh nodes using NAME-BASED assembly logic.
 *
 * For vertical assemblies (rockets, towers, etc.):
 * - Finds the part with "fuselage" or "body" in the title — that's the anchor
 * - Finds "nose" or "cone" — goes on TOP of the anchor
 * - Finds "engine" or "nozzle" — goes on BOTTOM of the anchor
 * - Finds "fin" or "wing" or "stabilizer" — attaches to the LOWER THIRD of the anchor
 *
 * Does NOT rely on distance thresholds — uses part names to determine assembly order.
 */
export function computeAutoConnections(
  nodes: Record<string, CanvasNode>,
  existingConnections: Record<string, CanvasConnection>,
  _proximityThreshold: number = 5.0 // Not used anymore, kept for API compatibility
): AutoConnection[] {
  const scene = _threeScene;
  if (!scene) {
    console.warn('[AUTO-CONNECT] Scene not registered');
    return [];
  }

  const nodeList = Object.values(nodes);
  if (nodeList.length < 2) {
    console.log('[AUTO-CONNECT] Need at least 2 parts to connect');
    return [];
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
    role: 'anchor' | 'top' | 'bottom' | 'side' | 'unknown';
  }

  const parts: PartData[] = [];
  console.log(`[AUTO-CONNECT] Analyzing ${nodeList.length} nodes...`);

  for (const node of nodeList) {
    const mesh = findMeshForNode(scene, node.id);
    const title = node.title || node.content.slice(0, 30);

    if (mesh) {
      const bboxMetrics = computeBoundingBoxMetrics(mesh);
      const volume = bboxMetrics.size.x * bboxMetrics.size.y * bboxMetrics.size.z;

      // Determine role from name FIRST
      const normalizedTitle = title.toLowerCase();
      let role: 'anchor' | 'top' | 'bottom' | 'side' | 'unknown' = 'unknown';

      if (ROLE_PATTERNS.anchor.test(normalizedTitle)) {
        role = 'anchor';
      } else if (ROLE_PATTERNS.top.test(normalizedTitle)) {
        role = 'top';
      } else if (ROLE_PATTERNS.bottom.test(normalizedTitle)) {
        role = 'bottom';
      } else if (ROLE_PATTERNS.side.test(normalizedTitle)) {
        role = 'side';
      }

      console.log(`[AUTO-CONNECT] Part "${title}" — role: ${role}, size: ${bboxMetrics.size.x.toFixed(2)}×${bboxMetrics.size.y.toFixed(2)}×${bboxMetrics.size.z.toFixed(2)}`);

      parts.push({
        nodeId: node.id,
        title,
        bbox: { min: bboxMetrics.min, max: bboxMetrics.max },
        center: bboxMetrics.center,
        size: bboxMetrics.size,
        volume,
        meshFound: true,
        role,
      });
    } else if (node.meshLoading) {
      console.log(`[AUTO-CONNECT] Skipping "${title}" — mesh still loading`);
    } else {
      console.log(`[AUTO-CONNECT] Skipping "${title}" — no mesh found`);
    }
  }

  if (parts.length < 2) {
    console.log('[AUTO-CONNECT] Not enough loaded meshes to connect');
    return [];
  }

  // Find the anchor part (by name first, then by largest volume)
  let anchorPart = parts.find((p) => p.role === 'anchor');
  if (!anchorPart) {
    // Fall back to largest part
    const maxVolume = Math.max(...parts.map((p) => p.volume));
    anchorPart = parts.find((p) => p.volume === maxVolume);
    if (anchorPart) {
      anchorPart.role = 'anchor';
      console.log(`[AUTO-CONNECT] No anchor found by name, using largest part: "${anchorPart.title}"`);
    }
  }

  if (!anchorPart) {
    console.log('[AUTO-CONNECT] Could not determine anchor part');
    return [];
  }

  console.log(`[AUTO-CONNECT] Anchor: "${anchorPart.title}" at Y=${anchorPart.center.y.toFixed(2)}`);

  // Build connections based on roles
  const connections: AutoConnection[] = [];

  // Get anchor dimensions
  const anchorHeight = anchorPart.size.y;
  const anchorTopY = anchorPart.bbox.max.y;
  const anchorBottomY = anchorPart.bbox.min.y;
  const anchorCenterX = (anchorPart.bbox.min.x + anchorPart.bbox.max.x) / 2;
  const anchorCenterZ = (anchorPart.bbox.min.z + anchorPart.bbox.max.z) / 2;

  for (const part of parts) {
    if (part.nodeId === anchorPart.nodeId) continue;

    // Check if already connected
    const hasConnection = Object.values(existingConnections).some(
      (c) => c.fromId === part.nodeId || c.toId === part.nodeId
    );
    if (hasConnection) {
      console.log(`[AUTO-CONNECT] Skipping "${part.title}" — already connected`);
      continue;
    }

    const partHalfHeight = part.size.y / 2;
    const oldY = part.center.y;
    let snapPosition: Vec3;
    let facePair: { fromFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'; toFace: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' };
    let connectionType: 'vertical' | 'horizontal' | 'radial';

    if (part.role === 'top') {
      // Nose cone: move to anchor top face center + part half-height
      const newY = anchorTopY + partHalfHeight;
      snapPosition = {
        x: anchorCenterX,
        y: newY,
        z: anchorCenterZ,
      };
      facePair = { fromFace: 'top', toFace: 'bottom' };
      connectionType = 'vertical';
      console.log(`[AUTO-CONNECT] Snapping "${part.title}" to TOP of "${anchorPart.title}" (moving Y from ${oldY.toFixed(2)} to ${newY.toFixed(2)})`);

    } else if (part.role === 'bottom') {
      // Engine: move to anchor bottom face center - part half-height
      const newY = anchorBottomY - partHalfHeight;
      snapPosition = {
        x: anchorCenterX,
        y: newY,
        z: anchorCenterZ,
      };
      facePair = { fromFace: 'bottom', toFace: 'top' };
      connectionType = 'vertical';
      console.log(`[AUTO-CONNECT] Snapping "${part.title}" to BOTTOM of "${anchorPart.title}" (moving Y from ${oldY.toFixed(2)} to ${newY.toFixed(2)})`);

    } else if (part.role === 'side') {
      // Fins: attach to lower third of anchor, offset on Z axis
      const finY = anchorBottomY + anchorHeight * 0.25; // Lower quarter
      const finZ = anchorPart.bbox.max.z + part.size.z / 2; // Offset behind anchor
      snapPosition = {
        x: anchorCenterX,
        y: finY,
        z: finZ,
      };
      facePair = { fromFace: 'back', toFace: 'front' };
      connectionType = 'radial';
      console.log(`[AUTO-CONNECT] Snapping "${part.title}" to SIDE of "${anchorPart.title}" (moving to Y=${finY.toFixed(2)}, Z=${finZ.toFixed(2)})`);

    } else {
      // Unknown role: use best face pair based on current position
      const bestFacePair = findBestFacePair(anchorPart.bbox, part.bbox);
      snapPosition = computeSnapPosition(
        anchorPart.bbox,
        part.bbox,
        bestFacePair.fromFace,
        bestFacePair.toFace,
        part.center
      );
      facePair = {
        fromFace: bestFacePair.fromFace,
        toFace: bestFacePair.toFace,
      };
      connectionType = (bestFacePair.fromFace === 'top' || bestFacePair.fromFace === 'bottom') ? 'vertical' : 'horizontal';
      console.log(`[AUTO-CONNECT] Snapping "${part.title}" (unknown role) to "${anchorPart.title}" using best face pair: ${facePair.fromFace}→${facePair.toFace}`);
    }

    // Calculate gap vector from current position to snap position
    const gapVector = {
      x: snapPosition.x - part.center.x,
      y: snapPosition.y - part.center.y,
      z: snapPosition.z - part.center.z,
    };
    const gapDistance = Math.sqrt(gapVector.x ** 2 + gapVector.y ** 2 + gapVector.z ** 2);

    // Validate snap position - skip if any value is NaN or Infinity
    const isValidPosition = (v: Vec3) =>
      Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

    if (!isValidPosition(snapPosition)) {
      console.warn(`[AUTO-CONNECT] Skipping "${part.title}" — invalid snap position (NaN or Infinity)`);
      continue;
    }

    connections.push({
      fromId: anchorPart.nodeId,
      toId: part.nodeId,
      fromTitle: anchorPart.title,
      toTitle: part.title,
      snapPosition,
      gapVector,
      gapDistance,
      facePair,
      connectionType,
      role: part.role,
    });
  }

  // Sort connections: bottom first, then top, then sides
  const rolePriority: Record<string, number> = {
    bottom: 0,
    top: 1,
    side: 2,
    unknown: 3,
    anchor: 4,
  };

  connections.sort((a, b) => {
    const priorityA = rolePriority[a.role] ?? 3;
    const priorityB = rolePriority[b.role] ?? 3;
    return priorityA - priorityB;
  });

  console.log(`[AUTO-CONNECT] Created ${connections.length} connections`);
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
