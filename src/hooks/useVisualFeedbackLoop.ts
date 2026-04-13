'use client';

import { useState, useCallback, useRef } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import { parseToolCallToAction } from '@/agents/builder/action-parser';
import { getCaptureFrames } from '@/components/canvas/SceneCapture';
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
   */
  const captureFrames = useCallback(async (): Promise<string[]> => {
    try {
      // Get the capture function from the module export
      const captureFn = getCaptureFrames();
      if (!captureFn) {
        console.warn('[FEEDBACK LOOP] getCaptureFrames not available (SceneCapture not mounted)');
        return [];
      }
      // captureFn returns CapturedFrame[] with { name, image } — extract just the image strings
      const capturedFrames = await captureFn();
      return capturedFrames.map((frame) => frame.image);
    } catch (error) {
      console.error('[FEEDBACK LOOP] Error capturing frames:', error);
      return [];
    }
  }, []);

  /**
   * Call OpenCV analysis API to get structured metrics.
   */
  const analyzeCVMetrics = useCallback(async (frames: string[]): Promise<CVMetrics | null> => {
    if (frames.length === 0) return null;

    try {
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
    geometryAnalysis: GeometryAnalysis | null
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
    geometryAnalysis: GeometryAnalysis | null
  ): Promise<BuilderAction[]> => {
    try {
      // Format geometry for prompt if available
      const geometryContext = geometryAnalysis ? formatGeometryForPrompt(geometryAnalysis) : null;

      const response = await fetch('/api/agents/mechanic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owlEvaluation,
          frames,
          cvMetrics,
          canvasState,
          geometryContext, // Exact 3D measurements
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
   */
  const triggerVisualFeedbackLoop = useCallback(async (): Promise<{
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
    }));

    // Activate mechanic avatar at loop start
    setMechanicActive(true);

    let iteration = 0;
    let lastEval: OwlEvaluation | null = null;

    try {
      // Step 0: Run auto-connection to snap parts together BEFORE evaluation
      console.log('[FEEDBACK LOOP] Running auto-connection pass...');
      const autoConnectCount = await runAutoConnect();
      if (autoConnectCount > 0) {
        console.log(`[FEEDBACK LOOP] Auto-connected ${autoConnectCount} parts, waiting for render...`);
        await waitForRender();
      }

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`[FEEDBACK LOOP] Iteration ${iteration}/${MAX_ITERATIONS} — capturing frames...`);

        setState((s) => ({ ...s, currentIteration: iteration }));

        // Step 1: Capture frames from 3D scene
        const frames = await captureFrames();
        console.log(`[FEEDBACK LOOP] Captured ${frames.length} frames`);

        // Abort if no frames captured — can't evaluate without visual input
        if (frames.length === 0) {
          console.error('[FEEDBACK LOOP] No frames captured, aborting');
          setState((s) => ({ ...s, error: 'No frames captured (SceneCapture not ready)' }));
          break;
        }

        // Step 2: Get OpenCV metrics (optional - may not be available)
        const cvMetrics = await analyzeCVMetrics(frames);
        if (cvMetrics) {
          console.log('[FEEDBACK LOOP] CV metrics received');
        }

        // Step 2.5: Run geometry analysis on Three.js scene graph
        const geometryAnalysis = runGeometryAnalysis();
        if (geometryAnalysis) {
          console.log(`[FEEDBACK LOOP] Geometry analysis: ${geometryAnalysis.parts.length} parts with exact 3D measurements`);
        }

        // Step 3: Get Owl evaluation
        const canvasState = getCanvasState();
        const owlEvaluation = await getOwlEvaluation(frames, cvMetrics, canvasState, geometryAnalysis);

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
          owlEvaluation.partEvaluations.filter((p) => p.issue !== 'none').length;

        if (approved) {
          console.log(`[FEEDBACK LOOP] Owl: APPROVED — assembly looks correct after ${iteration} iteration(s)`);
          break;
        }

        console.log(`[FEEDBACK LOOP] Owl: NOT_APPROVED (${issueCount} issues)`);

        // Step 5: Get Mechanic corrections
        const corrections = await getMechanicCorrections(
          owlEvaluation,
          frames,
          cvMetrics,
          canvasState,
          geometryAnalysis
        );

        // Filter out respond_verbally from correction count
        const spatialCorrections = corrections.filter(a => a.type !== 'respond_verbally');
        console.log(`[FEEDBACK LOOP] Mechanic applied ${spatialCorrections.length} spatial corrections (${corrections.length - spatialCorrections.length} verbal)`);

        if (spatialCorrections.length === 0) {
          console.log('[FEEDBACK LOOP] No spatial corrections, stopping');
          break;
        }

        // Step 6: Apply corrections
        applyCorrections(corrections);

        // Step 7: Wait for re-render
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
