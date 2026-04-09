// ============================================================
// Workshop — Intent Dispatch Hook
// Handles sending intents to the Builder agent and executing actions
// ============================================================

'use client';

import { useCallback, useState } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import { logBuilderActions } from '@/agents/safety/logger';
import type { BuilderAction, CanvasState, UnifiedIntent } from '@/core/types';

interface DispatchResult {
  success: boolean;
  actions: BuilderAction[];
  error?: string;
}

export function useIntentDispatch() {
  const [isProcessing, setIsProcessing] = useState(false);
  const executeAction = useCanvasStore((s) => s.executeAction);

  const dispatch = useCallback(async (
    text: string,
    _intent: UnifiedIntent | null = null
  ): Promise<DispatchResult> => {
    if (!text.trim()) {
      return { success: false, actions: [], error: 'Empty text' };
    }

    // Prevent concurrent requests
    if (isProcessing) {
      console.log('[Dispatch] Skipping - already processing');
      return { success: false, actions: [], error: 'Already processing' };
    }

    console.log('[PIPELINE] Sending to /api/agent:', text);
    setIsProcessing(true);

    // Get FRESH canvas state at call time (not stale closure)
    const store = useCanvasStore.getState();
    const canvasBefore: CanvasState = {
      nodes: store.nodes,
      connections: store.connections,
      groups: store.groups,
      focusStack: store.focusStack,
    };

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          canvasState: canvasBefore,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Dispatch] API error:', response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const actions: BuilderAction[] = data.actions || [];
      console.log('[PIPELINE] Received actions:', actions.length, actions.map(a => a.type));

      // Execute each action
      for (const action of actions) {
        console.log('[PIPELINE] Executing:', action.type);
        store.executeAction(action);
      }

      // Log actions to Safety Supervisor
      if (actions.length > 0) {
        const canvasAfter = useCanvasStore.getState();
        logBuilderActions(actions, text, canvasBefore, canvasAfter);
      }

      return { success: true, actions };
    } catch (error) {
      console.error('[Dispatch] Failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, actions: [], error: errorMessage };
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, executeAction]);

  return {
    dispatch,
    isProcessing,
  };
}
