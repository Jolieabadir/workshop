import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { BUILDER_SYSTEM_PROMPT } from '@/agents/builder/prompt';
import { BUILDER_TOOLS } from '@/agents/builder/tools';
import {
  formatCanvasStateForLLM,
  formatIntentContext,
  formatSpatialContext,
  parseToolCallToAction,
  type IntentData,
  type SpatialContext,
} from '@/agents/builder/action-parser';
import type { BuilderAction, CanvasState } from '@/core/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface AgentRequest {
  transcript: string;
  canvasState: CanvasState;
  intent?: IntentData | null;
  spatialContext?: SpatialContext | null;
}

export async function POST(request: NextRequest) {
  try {
    const body: AgentRequest = await request.json();
    const { transcript, canvasState, intent, spatialContext } = body;

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json({ actions: [] });
    }

    const canvasContext = formatCanvasStateForLLM(canvasState);

    // Build the user message with canvas state, spatial context, and optional intent
    let userMessage = canvasContext;

    // Add spatial context from hand tracking (preferred source of spatial info)
    if (spatialContext) {
      const spatialInfo = formatSpatialContext(spatialContext, canvasState);
      userMessage += `\n\n${spatialInfo}`;
    }

    // Add legacy intent context if provided (for backwards compatibility)
    if (intent) {
      const intentContext = formatIntentContext(intent, canvasState);
      userMessage += `\n\n${intentContext}`;
    }

    userMessage += `\n\n---\n\nUser says: "${transcript}"`;

    // Multi-round tool calling loop
    // Claude returns tool calls, we send back results, Claude makes more calls
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    const allActions: BuilderAction[] = [];
    let continueLoop = true;
    let iterations = 0;
    const MAX_ITERATIONS = 5; // Safety limit

    while (continueLoop && iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: BUILDER_SYSTEM_PROMPT,
        tools: BUILDER_TOOLS,
        tool_choice: { type: 'auto' },
        messages,
      });

      console.log(`[AGENT API] Round ${iterations} - blocks: ${response.content.length}, stop_reason: ${response.stop_reason}`);

      // Collect any tool calls from this round
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[AGENT API] Tool call:', block.name, JSON.stringify(block.input));
          const action = parseToolCallToAction(block.name, block.input as Record<string, unknown>);
          if (action) {
            allActions.push(action);
          }
        }
      }

      // If Claude wants to make more tool calls (stop_reason is 'tool_use'),
      // send back tool results and continue
      if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        // Add assistant's response to conversation
        messages.push({ role: 'assistant', content: response.content });

        // Add tool results for each tool call
        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(block => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: 'OK — action executed successfully',
        }));

        messages.push({ role: 'user', content: toolResults });
      } else {
        // Claude is done (stop_reason is 'end_turn' or no more tool calls)
        continueLoop = false;
      }
    }

    console.log(`[AGENT API] Completed in ${iterations} rounds, total actions: ${allActions.length}`);
    return NextResponse.json({ actions: allActions });
  } catch (error) {
    console.error('Builder agent error:', error);

    // Extract useful error info for client
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isBillingError = errorMessage.includes('credit balance') || errorMessage.includes('billing');
    const isAuthError = errorMessage.includes('401') || errorMessage.includes('authentication');

    if (isBillingError) {
      return NextResponse.json(
        { error: 'API billing issue', details: 'Anthropic API credits exhausted. Please add credits.' },
        { status: 402 }
      );
    }

    if (isAuthError) {
      return NextResponse.json(
        { error: 'API authentication failed', details: 'Check ANTHROPIC_API_KEY in .env.local' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process request', details: errorMessage },
      { status: 500 }
    );
  }
}
