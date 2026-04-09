'use client';

import { useEffect, useRef } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import type { OwlAnalysisResult } from '@/agents/owl/analyzer';

const OWL_DEBOUNCE_MS = 2000; // Wait 2 seconds after last change before analyzing
const OWL_COOLDOWN_MS = 10000; // Minimum 10 seconds between analyses

/**
 * Hook that automatically triggers Owl analysis after canvas changes.
 * The Owl runs in the background and doesn't block user interactions.
 */
export function useOwlAnalysis() {
  const nodes = useCanvasStore((s) => s.nodes);
  const connections = useCanvasStore((s) => s.connections);
  const groups = useCanvasStore((s) => s.groups);
  const focusStack = useCanvasStore((s) => s.focusStack);
  const addBadge = useCanvasStore((s) => s.addBadge);
  const clearBadgesBySource = useCanvasStore((s) => s.clearBadgesBySource);
  const lastAnalyzedAt = useCanvasStore((s) => s.lastAnalyzedAt);
  const setLastAnalyzedAt = useCanvasStore((s) => s.setLastAnalyzedAt);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);
  const lastNodeCountRef = useRef(0);

  useEffect(() => {
    const nodeCount = Object.keys(nodes).length;

    // Skip if no nodes or if node count hasn't changed (avoid analyzing on non-structural changes)
    if (nodeCount === 0) {
      lastNodeCountRef.current = 0;
      return;
    }

    // Track if this is a meaningful change (new node added, node deleted, etc.)
    const hasStructuralChange = nodeCount !== lastNodeCountRef.current;
    lastNodeCountRef.current = nodeCount;

    // Clear existing debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Only trigger analysis on structural changes (not every re-render)
    if (!hasStructuralChange) {
      return;
    }

    // Debounce the analysis to avoid rapid-fire requests
    debounceRef.current = setTimeout(async () => {
      // Check cooldown
      const now = Date.now();
      if (now - lastAnalyzedAt < OWL_COOLDOWN_MS) {
        console.log('[Owl] Skipping analysis - cooldown active');
        return;
      }

      // Prevent concurrent analyses
      if (isAnalyzingRef.current) {
        console.log('[Owl] Skipping analysis - already running');
        return;
      }

      isAnalyzingRef.current = true;
      console.log('[Owl] Starting background analysis...');

      try {
        const response = await fetch('/api/agents/owl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvasState: { nodes, connections, groups, focusStack },
          }),
        });

        if (!response.ok) {
          console.error('[Owl] Analysis failed:', response.status);
          return;
        }

        const result: OwlAnalysisResult = await response.json();

        // Clear old Owl badges before adding new ones
        clearBadgesBySource('owl');

        // Add new badges
        for (const badge of result.badges) {
          addBadge(badge.nodeId, {
            type: badge.badgeType,
            message: badge.message,
            source: 'owl',
          });
        }

        // Add info badges for suggested connections
        for (const suggestion of result.suggestedConnections) {
          // Add badge to the source node about the suggested connection
          addBadge(suggestion.fromId, {
            type: 'info',
            message: `Consider connecting to: ${suggestion.reason}`,
            source: 'owl',
          });
        }

        setLastAnalyzedAt(now);

        const totalFindings = result.badges.length + result.suggestedConnections.length;
        if (totalFindings > 0) {
          console.log(`[Owl] Found ${totalFindings} issue(s)`);
        } else {
          console.log('[Owl] No issues found');
        }
      } catch (error) {
        console.error('[Owl] Analysis error:', error);
      } finally {
        isAnalyzingRef.current = false;
      }
    }, OWL_DEBOUNCE_MS);

    // Cleanup
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [nodes, connections, groups, focusStack, addBadge, clearBadgesBySource, lastAnalyzedAt, setLastAnalyzedAt]);
}
