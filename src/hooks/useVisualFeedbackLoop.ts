'use client';

import { useState, useCallback, useRef } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import { parseToolCallToAction } from '@/agents/builder/action-parser';
import { getCaptureFrames, type CapturedFrame } from '@/components/canvas/SceneCapture';
import {
  analyzeGeometry,
  formatGeometryForPrompt,
  computeAutoConnections,
  allMeshesLoaded,
  type GeometryAnalysis,
  type AutoConnection,
} from '@/utils/geometryAnalyzer';
import type { BuilderAction, CanvasState } from '@/core/types';

const MAX_ITERATIONS = 5;
const RENDER_SETTLE_MS = 500;

/** Correction record for history tracking */
interface CorrectionRecord {
  iteration: number;
  nodeId: string;
  nodeTitle: string;
  action: string;
  details: string;
}

/**
 * Format CV rotation estimates as explicit instructions for the Mechanic.
 * CV provides orientationDeg which represents estimated rotation needed.
 */
function formatCVRotationEstimates(cvMetrics: CVMetrics | null, nodes: Record<string, { title?: string; content: string }>): string {
  if (!cvMetrics?.parts || cvMetrics.parts.length === 0) {
    return '';
  }

  const rotationEstimates: string[] = [];

  for (const part of cvMetrics.parts) {
    if (part.orientationDeg !== undefined && Math.abs(part.orientationDeg) > 10) {
      // Calculate confidence based on how clear the orientation signal is
      const confidence = Math.min(0.9, 0.5 + Math.abs(part.orientationDeg) / 180);
      const node = nodes[part.nodeId];
      const partName = node?.title || node?.content?.slice(0, 20) || part.nodeId;

      // Determine rotation axis based on bounding box aspect ratio
      const aspectRatio = part.boundingBox.width / part.boundingBox.height;
      let reason = '';
      let axis = 'Z';

      if (aspectRatio > 1.5) {
        reason = 'elongated horizontally in view';
        axis = 'Z';
      } else if (aspectRatio < 0.67) {
        reason = 'elongated vertically (may be correct)';
        axis = 'Z';
      } else {
        reason = 'orientation unclear from aspect ratio';
      }

      rotationEstimates.push(
        `- ${partName}: rotate ${axis}=${Math.round(part.orientationDeg)}° (confidence: ${confidence.toFixed(1)}, reason: ${reason})`
      );
    }
  }

  if (rotationEstimates.length === 0) {
    return '';
  }

  return `
## CV ROTATION ESTIMATES (apply directly if confidence > 0.7)
${rotationEstimates.join('\n')}
`;
}

/**
 * Format correction history for the Mechanic to avoid repeating the same fixes.
 */
function formatCorrectionHistory(history: CorrectionRecord[]): string {
  if (history.length === 0) {
    return '';
  }

  const byIteration = new Map<number, CorrectionRecord[]>();
  for (const record of history) {
    const list = byIteration.get(record.iteration) || [];
    list.push(record);
    byIteration.set(record.iteration, list);
  }

  const lines: string[] = ['## CORRECTIONS ALREADY APPLIED THIS LOOP'];
  for (const [iteration, records] of byIteration) {
    const actions = records.map(r => `${r.action} ${r.nodeTitle} ${r.details}`).join(', ');
    lines.push(`- Iteration ${iteration}: ${actions}`);
  }
  lines.push('');
  lines.push('DO NOT repeat these corrections. Build on previous work or try different approaches.');

  return lines.join('\n');
}

/** Part evaluation from Owl */
interface PartEvaluation {
  nodeId: string;
  partName: string;
  issue: string;
  severity: string;
  details: string;
  suggestedFix?: string;
}

/** Assembly verdict from Owl */
interface AssemblyVerdict {
  verdict: 'APPROVED' | 'NOT_APPROVED';
  coherenceScore?: number;
  summary: string;
  issueCount: number;
}

/** Full Owl evaluation response */
interface OwlEvaluation {
  badges: Array<{ nodeId: string; badgeType: string; message: string }>;
  suggestedConnections: Array<{ fromId: string; toId: string; reason: string }>;
  partEvaluations: PartEvaluation[];
  assemblyVerdict: AssemblyVerdict | null;
}

/** CV metrics from OpenCV analysis */
interface CVMetrics {
  parts?: Array<{
    nodeId: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    areaRatio?: number;
    orientationDeg?: number;
  }>;
  gaps?: Array<{
    fromId: string;
    toId: string;
    gapPixels: number;
  }>;
  overallCoherence?: number;
}

/** State exposed by the hook */
interface FeedbackLoopState {
  isRunning: boolean;
  currentIteration: number;
  maxIterations: number;
  lastEvaluation: OwlEvaluation | null;
  error: string | null;
  lastUserRequest: string | null;
}

/**
 * Hook that orchestrates the Owl ↔ Mechanic visual feedback correction loop.
 *
 * The loop captures 3D scene frames, analyzes them with OpenCV and Owl,
 * then applies Mechanic corrections until the assembly is approved or max iterations reached.
 */
export function useVisualFeedbackLoop() {
  const [state, setState] = useState<FeedbackLoopState>({
    isRunning: false,
    currentIteration: 0,
    maxIterations: MAX_ITERATIONS,
    lastEvaluation: null,
    error: null,
    lastUserRequest: null,
  });

  const isRunningRef = useRef(false);

  // Get canvas store functions
  const getCanvasState = useCallback((): CanvasState => {
    const store = useCanvasStore.getState();
    return {
      nodes: store.nodes,
      connections: store.connections,
      groups: store.groups,
      focusStack: store.focusStack,
    };
  }, []);

  const executeAction = useCanvasStore((s) => s.executeAction);
  const setMechanicActive = useCanvasStore((s) => s.setMechanicActive);
  const setMechanicTarget = useCanvasStore((s) => s.setMechanicTarget);
  const addCorrectionHighlight = useCanvasStore((s) => s.addCorrectionHighlight);
  const addConnection = useCanvasStore((s) => s.addConnection);
  const updateNode = useCanvasStore((s) => s.updateNode);

  /**
   * Capture frames from the 3D scene.
   * Uses the getCaptureFrames function exported from SceneCapture.
   * Returns full CapturedFrame[] with { name, image } for cv-analyze to use view names.
   */
  const captureFrames = useCallback(async (): Promise<CapturedFrame[]> => {
    try {
      // Get the capture function from the module export
      const captureFn = getCaptureFrames();
      if (!captureFn) {
        console.warn('[FEEDBACK LOOP] getCaptureFrames not available (SceneCapture not mounted)');
        return [];
      }
      // Return full CapturedFrame[] with names ('front', 'side', 'top') for cv-analyze
      return await captureFn();
    } catch (error) {
      console.error('[FEEDBACK LOOP] Error capturing frames:', error);
      return [];
    }
  }, []);

  /**
   * Call OpenCV analysis API to get structured metrics.
   * Sends frames with names ('front', 'side', 'top') for multi-view triangulation.
   */
  const analyzeCVMetrics = useCallback(async (frames: CapturedFrame[]): Promise<CVMetrics | null> => {
    if (frames.length === 0) return null;

    try {
      // Send frames with names so Python script can do multi-view triangulation
      // The cv-analyze route accepts { name, image }[] format
      const response = await fetch('/api/cv-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames }),
      });

      if (!response.ok) {
        console.warn('[FEEDBACK LOOP] CV analysis failed:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.warn('[FEEDBACK LOOP] CV analysis error:', error);
      return null;
    }
  }, []);

  /**
   * Run geometry analysis on the current scene.
   * Returns exact 3D measurements from Three.js scene graph.
   */
  const runGeometryAnalysis = useCallback((): GeometryAnalysis | null => {
    const { nodes, connections } = useCanvasStore.getState();
    const analysis = analyzeGeometry(nodes, connections);

    if (analysis) {
      console.log(`[FEEDBACK LOOP] Geometry analysis: ${analysis.parts.length} parts, ${analysis.connections.length} connections`);
    }

    return analysis;
  }, []);

  /**
   * Run auto-connection: detect parts that should be connected and snap them together.
   * This runs BEFORE Owl evaluation to automatically assemble parts based on proximity.
   */
  const runAutoConnect = useCallback(async (): Promise<number> => {
    const { nodes, connections } = useCanvasStore.getState();

    // Check if all meshes are loaded
    if (!allMeshesLoaded(nodes)) {
      console.log('[AUTO-CONNECT] Waiting for meshes to load...');
      return 0;
    }

    // Compute auto-connections based on bounding box proximity
    const autoConnections = computeAutoConnections(nodes, connections, 2.0);

    if (autoConnections.length === 0) {
      console.log('[AUTO-CONNECT] No new connections needed');
      return 0;
    }

    console.log(`[AUTO-CONNECT] Found ${autoConnections.length} connections to create`);

    // Apply each connection
    for (const conn of autoConnections) {
      // Create the connection (fromId, toId, label)
      addConnection(conn.fromId, conn.toId, `auto-${conn.connectionType}`);

      // Snap the "to" part to the correct position
      updateNode(conn.toId, {
        position: conn.snapPosition,
      });

      // Add visual highlight
      addCorrectionHighlight(conn.toId, 'move');

      // Move mechanic avatar to show work
      const node = nodes[conn.toId];
      if (node) {
        setMechanicTarget(conn.snapPosition);
      }

      console.log(
        `[AUTO-CONNECT] Snapped ${conn.toTitle} to ${conn.fromTitle} ` +
        `(gap: ${conn.gapDistance.toFixed(2)} units, face: ${conn.facePair.fromFace}→${conn.facePair.toFace})`
      );

      // Small delay for visual effect
      await new Promise((r) => setTimeout(r, 200));
    }

    return autoConnections.length;
  }, [addConnection, updateNode, addCorrectionHighlight, setMechanicTarget]);

  /**
   * Call Owl agent to evaluate the assembly visually.
   */
  const getOwlEvaluation = useCallback(async (
    frames: string[],
    cvMetrics: CVMetrics | null,
    canvasState: CanvasState,
    geometryAnalysis: GeometryAnalysis | null,
    userRequest: string | null
  ): Promise<OwlEvaluation | null> => {
    try {
      // Format geometry for prompt if available
      const geometryContext = geometryAnalysis ? formatGeometryForPrompt(geometryAnalysis) : null;

      const response = await fetch('/api/agents/owl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvasState,
          frames,
          cvMetrics,
          geometryContext, // Exact 3D measurements
          userRequest, // Original user request for semantic evaluation
        }),
      });

      if (!response.ok) {
        console.error('[FEEDBACK LOOP] Owl evaluation failed:', response.status);
        return null;
      }

      const result = await response.json();
      // Validate response shape — API errors may return unexpected format
      if (!result || typeof result !== 'object') return null;
      if (result.error) {
        console.error('[FEEDBACK LOOP] Owl returned error:', result.error);
        return null;
      }
      return result;
    } catch (error) {
      console.error('[FEEDBACK LOOP] Owl evaluation error:', error);
      return null;
    }
  }, []);

  /**
   * Check if the Owl evaluation approves the assembly.
   */
  const isApproved = useCallback((evaluation: OwlEvaluation): boolean => {
    // Check assembly verdict
    if (evaluation.assemblyVerdict) {
      return evaluation.assemblyVerdict.verdict === 'APPROVED';
    }
    // Fallback: no critical issues (with null safety)
    if (!evaluation.partEvaluations) return false;
    const criticalIssues = evaluation.partEvaluations.filter(
      (p) => p.severity === 'critical'
    );
    return criticalIssues.length === 0;
  }, []);

  /**
   * Call Mechanic agent to get corrections based on Owl evaluation.
   */
  const getMechanicCorrections = useCallback(async (
    owlEvaluation: OwlEvaluation,
    frames: string[],
    cvMetrics: CVMetrics | null,
    canvasState: CanvasState,
    geometryAnalysis: GeometryAnalysis | null,
    correctionHistory: CorrectionRecord[],
    userRequest: string | null
  ): Promise<BuilderAction[]> => {
    try {
      // Format geometry for prompt if available
      const geometryContext = geometryAnalysis ? formatGeometryForPrompt(geometryAnalysis) : null;

      // Format CV rotation estimates as explicit instructions
      const cvRotationEstimates = formatCVRotationEstimates(cvMetrics, canvasState.nodes);

      // Format correction history to prevent repeating the same fixes
      const correctionHistoryContext = formatCorrectionHistory(correctionHistory);

      const response = await fetch('/api/agents/mechanic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owlEvaluation,
          frames,
          cvMetrics,
          canvasState,
          geometryContext, // Exact 3D measurements
          cvRotationEstimates, // Formatted CV rotation estimates
          correctionHistoryContext, // Previous corrections in this loop
          userRequest, // Original user request for semantic corrections
        }),
      });

      if (!response.ok) {
        console.error('[FEEDBACK LOOP] Mechanic corrections failed:', response.status);
        return [];
      }

      const result = await response.json();

      // Parse Mechanic tool calls into BuilderActions
      // The Mechanic uses similar tools to the Builder: rotate_node, scale_node, move_node, etc.
      const actions: BuilderAction[] = [];
      if (result.toolCalls && Array.isArray(result.toolCalls)) {
        for (const call of result.toolCalls) {
          const action = parseToolCallToAction(call.name, call.input);
          if (action) {
            actions.push(action);
          }
        }
      }

      // Also check for actions array in response
      if (result.actions && Array.isArray(result.actions)) {
        actions.push(...result.actions);
      }

      return actions;
    } catch (error) {
      console.error('[FEEDBACK LOOP] Mechanic corrections error:', error);
      return [];
    }
  }, []);

  /**
   * Map tool name to correction type for highlighting.
   */
  const getCorrectionType = useCallback((toolName: string): string | null => {
    switch (toolName) {
      case 'rotate_node':
        return 'rotate';
      case 'scale_node':
        return 'scale';
      case 'move_node':
        return 'move';
      case 'generate_mesh':
        return 'regenerate';
      default:
        return null;
    }
  }, []);

  /**
   * Extract nodeId from a tool call input.
   */
  const getNodeIdFromAction = useCallback((action: BuilderAction): string | null => {
    if ('nodeId' in action && typeof action.nodeId === 'string') {
      return action.nodeId;
    }
    return null;
  }, []);

  /**
   * Apply Mechanic corrections to the canvas store.
   * Also triggers visual feedback (mechanic avatar movement + highlight rings).
   */
  const applyCorrections = useCallback(async (corrections: BuilderAction[]) => {
    const nodes = useCanvasStore.getState().nodes;

    // Filter to only spatial correction types
    const spatialTypes = new Set(['move_node', 'update_node', 'rotate_node', 'scale_node', 'generate_mesh']);
    const spatialCorrections = corrections.filter((a) => spatialTypes.has(a.type));
    const respondVerballyCount = corrections.filter((a) => a.type === 'respond_verbally').length;

    console.log(`[FEEDBACK LOOP] Mechanic applied ${spatialCorrections.length} spatial corrections (filtered ${respondVerballyCount} respond_verbally)`);

    for (const action of spatialCorrections) {
      // Get the nodeId being corrected
      const nodeId = getNodeIdFromAction(action);
      const node = nodeId ? nodes[nodeId] : null;

      // Move mechanic avatar to the node being fixed
      if (node) {
        setMechanicTarget(node.position);
        // Small delay to let avatar start moving
        await new Promise((r) => setTimeout(r, 100));
      }

      // Execute the correction
      executeAction(action);

      // Add correction highlight based on action type
      if (nodeId) {
        let correctionType: string | null = null;
        if (action.type === 'update_node') {
          // Check if this is a rotate or scale action (stored in metadata)
          const changes = action.changes as Record<string, unknown>;
          if (changes.metadata) {
            const metadata = changes.metadata as Record<string, unknown>;
            if ('rotation' in metadata) correctionType = 'rotate';
            else if ('uniformScale' in metadata) correctionType = 'scale';
          }
        } else if (action.type === 'move_node') {
          correctionType = 'move';
        } else if (action.type === 'generate_mesh') {
          correctionType = 'regenerate';
        }

        if (correctionType) {
          addCorrectionHighlight(nodeId, correctionType);
        }
      }

      // Small delay between corrections for visual effect
      await new Promise((r) => setTimeout(r, 150));
    }
  }, [executeAction, setMechanicTarget, addCorrectionHighlight, getNodeIdFromAction]);

  /**
   * Wait for React to re-render after applying corrections.
   */
  const waitForRender = useCallback((): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, RENDER_SETTLE_MS));
  }, []);

  /**
   * Run the full visual feedback correction loop.
   * Call this after the Builder finishes an assembly.
   * @param userRequest - The original user request/transcript for semantic evaluation
   */
  const triggerVisualFeedbackLoop = useCallback(async (userRequest?: string): Promise<{
    success: boolean;
    iterations: number;
    finalEvaluation: OwlEvaluation | null;
  }> => {
    // Prevent concurrent runs
    if (isRunningRef.current) {
      console.log('[FEEDBACK LOOP] Already running, skipping');
      return { success: false, iterations: 0, finalEvaluation: null };
    }

    isRunningRef.current = true;
    setState((s) => ({
      ...s,
      isRunning: true,
      currentIteration: 0,
      error: null,
      lastUserRequest: userRequest || null,
    }));

    // Store userRequest for use in the loop
    const requestContext = userRequest || null;

    // Activate mechanic avatar at loop start
    setMechanicActive(true);

    let iteration = 0;
    let lastEval: OwlEvaluation | null = null;

    // Track corrections to detect loops (same correction repeated = mesh is unfixable)
    const correctionSignatures = new Map<string, string[]>(); // nodeId -> array of correction signatures

    // Track all corrections for history context
    const correctionHistory: CorrectionRecord[] = [];

    try {
      // Auto-connect disabled — Builder's semantic positioning + Mechanic corrections
      // handle assembly better than rule-based snapping
      // const autoConnectCount = await runAutoConnect();
      const autoConnectCount = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`[FEEDBACK LOOP] Iteration ${iteration}/${MAX_ITERATIONS} — capturing frames...`);

        setState((s) => ({ ...s, currentIteration: iteration }));

        // Step 1: Capture frames from 3D scene (with names for cv-analyze)
        const frames = await captureFrames();
        console.log(`[FEEDBACK LOOP] Captured ${frames.length} frames: ${frames.map(f => f.name).join(', ')}`);

        // Abort if no frames captured — can't evaluate without visual input
        if (frames.length === 0) {
          console.error('[FEEDBACK LOOP] No frames captured, aborting');
          setState((s) => ({ ...s, error: 'No frames captured (SceneCapture not ready)' }));
          break;
        }

        // Extract just image strings for Owl (Claude Vision doesn't need view names)
        const frameImages = frames.map(f => f.image);

        // Step 2: Get OpenCV metrics (uses frame names for multi-view triangulation)
        const cvMetrics = await analyzeCVMetrics(frames);
        if (cvMetrics) {
          console.log('[FEEDBACK LOOP] CV metrics received');
        }

        // Step 2.5: Run geometry analysis on Three.js scene graph
        const geometryAnalysis = runGeometryAnalysis();
        if (geometryAnalysis) {
          console.log(`[FEEDBACK LOOP] Geometry analysis: ${geometryAnalysis.parts.length} parts with exact 3D measurements`);
        }

        // Get canvas state for diagnostic and Owl evaluation
        const canvasState = getCanvasState();

        // ─────────────────────────────────────────────────────────────────────
        // DIAGNOSTIC LOGGING — Per-iteration perception layer snapshot
        // ─────────────────────────────────────────────────────────────────────
        console.group(`[FEEDBACK LOOP DIAGNOSTIC — Iteration ${iteration}]`);

        // 1. Builder-placed nodes: id, title, position, rotation, scale
        console.log('📦 BUILDER-PLACED NODES:');
        for (const [nodeId, node] of Object.entries(canvasState.nodes)) {
          const rotation = (node.metadata?.rotation as { x?: number; y?: number; z?: number }) || { x: 0, y: 0, z: 0 };
          const scale = (node.metadata?.uniformScale as number) ?? 1;
          console.log(
            `  • ${node.title || node.content.slice(0, 20)} (${nodeId})\n` +
            `    position: {x: ${node.position.x.toFixed(3)}, y: ${node.position.y.toFixed(3)}, z: ${node.position.z.toFixed(3)}}\n` +
            `    rotation: {x: ${(rotation.x ?? 0).toFixed(1)}°, y: ${(rotation.y ?? 0).toFixed(1)}°, z: ${(rotation.z ?? 0).toFixed(1)}°}\n` +
            `    scale: ${scale.toFixed(2)}`
          );
        }

        // 2. Geometry analyzer gap data for each connection
        console.log('📐 GEOMETRY ANALYZER GAP DATA:');
        if (geometryAnalysis && geometryAnalysis.connections.length > 0) {
          for (const conn of geometryAnalysis.connections) {
            console.log(
              `  • ${conn.fromTitle} ↔ ${conn.toTitle}\n` +
              `    fromId: ${conn.fromId}, toId: ${conn.toId}\n` +
              `    gap.distance: ${conn.gap.distance.toFixed(4)} units\n` +
              `    gap.direction: {x: ${conn.gap.direction.x.toFixed(2)}, y: ${conn.gap.direction.y.toFixed(2)}, z: ${conn.gap.direction.z.toFixed(2)}}\n` +
              `    overlapping: ${conn.overlapping}\n` +
              `    overlapAmount: ${conn.overlapAmount.toFixed(4)} units`
            );
          }
        } else {
          console.log('  (no connections to analyze)');
        }

        // 3. CV metrics summary
        console.log('👁️ CV METRICS SUMMARY:');
        if (cvMetrics) {
          console.log(`  Parts detected: ${cvMetrics.parts?.length ?? 0}`);
          if (cvMetrics.gaps && cvMetrics.gaps.length > 0) {
            console.log('  Gap entries (pixel counts):');
            for (const gap of cvMetrics.gaps) {
              console.log(`    • ${gap.fromId} ↔ ${gap.toId}: ${gap.gapPixels}px`);
            }
          } else {
            console.log('  Gap entries: (none)');
          }
          if (cvMetrics.parts && cvMetrics.parts.length > 0) {
            const partsWithOrientation = cvMetrics.parts.filter(p => p.orientationDeg !== undefined);
            if (partsWithOrientation.length > 0) {
              console.log('  Orientation estimates:');
              for (const part of partsWithOrientation) {
                const confidence = Math.min(0.9, 0.5 + Math.abs(part.orientationDeg!) / 180);
                console.log(`    • ${part.nodeId}: ${part.orientationDeg!.toFixed(1)}° (confidence: ${confidence.toFixed(2)})`);
              }
            } else {
              console.log('  Orientation estimates: (none)');
            }
          }
          if (cvMetrics.overallCoherence !== undefined) {
            console.log(`  Overall coherence: ${cvMetrics.overallCoherence.toFixed(2)}`);
          }
        } else {
          console.log('  (CV analysis unavailable)');
        }

        // 4. User request passthrough
        console.log('📝 USER REQUEST:');
        if (requestContext) {
          console.log(`  Passed: YES\n  Value: "${requestContext}"`);
        } else {
          console.log('  Passed: NO');
        }

        console.groupEnd();
        // ─────────────────────────────────────────────────────────────────────

        // Step 3: Get Owl evaluation (uses image strings only)
        const owlEvaluation = await getOwlEvaluation(frameImages, cvMetrics, canvasState, geometryAnalysis, requestContext);

        if (!owlEvaluation) {
          console.error('[FEEDBACK LOOP] Owl evaluation failed, stopping');
          setState((s) => ({ ...s, error: 'Owl evaluation failed' }));
          break;
        }

        lastEval = owlEvaluation;
        setState((s) => ({ ...s, lastEvaluation: owlEvaluation }));

        // Step 4: Check if approved
        const approved = isApproved(owlEvaluation);
        const issueCount = owlEvaluation.assemblyVerdict?.issueCount ??
          (owlEvaluation.partEvaluations?.filter((p) => p.issue !== 'none').length ?? 0);

        if (approved) {
          console.log(`[FEEDBACK LOOP] Owl: APPROVED — assembly looks correct after ${iteration} iteration(s)`);
          break;
        }

        console.log(`[FEEDBACK LOOP] Owl: NOT_APPROVED (${issueCount} issues)`);

        // Step 5: Get Mechanic corrections (uses image strings only)
        const corrections = await getMechanicCorrections(
          owlEvaluation,
          frameImages,
          cvMetrics,
          canvasState,
          geometryAnalysis,
          correctionHistory,
          requestContext
        );

        // Filter out respond_verbally from correction count
        const spatialCorrections = corrections.filter(a => a.type !== 'respond_verbally');
        console.log(`[FEEDBACK LOOP] Mechanic applied ${spatialCorrections.length} spatial corrections (${corrections.length - spatialCorrections.length} verbal)`);

        if (spatialCorrections.length === 0) {
          console.log('[FEEDBACK LOOP] No spatial corrections, stopping');
          break;
        }

        // Step 6: Filter out duplicate corrections to prevent loops
        const filteredCorrections: BuilderAction[] = [];
        const nodes = canvasState.nodes;
        for (const action of corrections) {
          // Detect correction loops
          const changes = 'changes' in action ? action.changes as Record<string, unknown> : undefined;
          const metadata = changes?.metadata as Record<string, unknown> | undefined;
          const corrSig = JSON.stringify({
            type: action.type,
            nodeId: getNodeIdFromAction(action),
            rotation: action.type === 'update_node' ? metadata?.rotation : undefined,
            scale: action.type === 'update_node' ? metadata?.uniformScale : undefined,
          });
          const nodeId = getNodeIdFromAction(action);
          if (nodeId) {
            const sigs = correctionSignatures.get(nodeId) || [];
            if (sigs.includes(corrSig)) {
              console.warn(`[FEEDBACK LOOP] Skipping duplicate correction for ${nodeId}: ${corrSig}`);
              continue; // Skip this correction — it already failed
            }
            sigs.push(corrSig);
            correctionSignatures.set(nodeId, sigs);

            // Add to correction history for context
            const node = nodes[nodeId];
            const nodeTitle = node?.title || node?.content?.slice(0, 20) || nodeId;
            let actionDesc = action.type as string;
            let details = '';

            if (action.type === 'update_node' && metadata) {
              if (metadata.rotation) {
                const rot = metadata.rotation as { x?: number; y?: number; z?: number };
                actionDesc = 'rotated';
                details = `X=${rot.x || 0}°, Y=${rot.y || 0}°, Z=${rot.z || 0}°`;
              } else if (metadata.uniformScale !== undefined) {
                actionDesc = 'scaled';
                details = `to ${metadata.uniformScale}`;
              }
            } else if (action.type === 'move_node') {
              actionDesc = 'moved';
              const pos = (action as { position?: { x: number; y: number; z: number } }).position;
              if (pos) {
                details = `to Y=${pos.y.toFixed(1)}`;
              }
            }

            correctionHistory.push({
              iteration,
              nodeId,
              nodeTitle,
              action: actionDesc,
              details,
            });
          }
          filteredCorrections.push(action);
        }

        if (filteredCorrections.length === 0) {
          console.log('[FEEDBACK LOOP] All corrections were duplicates, stopping');
          break;
        }

        // Step 7: Apply corrections
        applyCorrections(filteredCorrections);

        // Step 8: Wait for re-render
        await waitForRender();
      }

      // Check final status
      if (iteration >= MAX_ITERATIONS && lastEval && !isApproved(lastEval)) {
        console.warn(`[FEEDBACK LOOP] Max iterations (${MAX_ITERATIONS}) reached without approval`);
        setState((s) => ({ ...s, error: `Max iterations reached (${MAX_ITERATIONS})` }));
      }

      return {
        success: lastEval ? isApproved(lastEval) : false,
        iterations: iteration,
        finalEvaluation: lastEval,
      };

    } finally {
      // Deactivate mechanic avatar at loop end
      setMechanicActive(false);
      setMechanicTarget(null);

      isRunningRef.current = false;
      setState((s) => ({ ...s, isRunning: false }));
    }
  }, [
    captureFrames,
    analyzeCVMetrics,
    runGeometryAnalysis,
    runAutoConnect,
    getCanvasState,
    getOwlEvaluation,
    isApproved,
    getMechanicCorrections,
    applyCorrections,
    waitForRender,
    setMechanicActive,
    setMechanicTarget,
  ]);

  return {
    ...state,
    triggerVisualFeedbackLoop,
  };
}
