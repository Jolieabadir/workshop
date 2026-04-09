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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: BUILDER_SYSTEM_PROMPT,
      tools: BUILDER_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const actions: BuilderAction[] = [];

    console.log('[AGENT API] Raw response blocks:', response.content.length);
    for (const block of response.content) {
      console.log('[AGENT API] Block type:', block.type, block.type === 'tool_use' ? (block as { name: string }).name : '');
      if (block.type === 'tool_use') {
        const toolBlock = block as { name: string; input: Record<string, unknown> };
        console.log('[AGENT API] Tool call:', toolBlock.name, JSON.stringify(toolBlock.input));
        const action = parseToolCallToAction(toolBlock.name, toolBlock.input);
        if (action) {
          actions.push(action);
        }
      }
    }

    console.log('[AGENT API] Final actions:', actions.length, JSON.stringify(actions.map(a => ({ type: a.type, message: a.type === 'respond_verbally' ? (a as { message: string }).message : undefined }))));
    return NextResponse.json({ actions });
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
